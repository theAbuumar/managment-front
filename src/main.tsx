import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
// Inter is bundled with the app (not Google Fonts) so the stand works offline (13.D3).
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './index.css'
import '@/i18n'
import { t } from '@/i18n'
import { router } from './routes'
import { prefetchPages } from './routes/lazyPage'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Toaster } from '@/components/ui/toaster'
import { ConnectionBanner } from '@/components/layout/ConnectionBanner'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getMe } from '@/api/auth'
import { getWorkspaces } from '@/api/workspace'
import {
  refreshSession,
  setAccessRevokedHandler,
  setSessionExpiredHandler,
} from '@/api/client'
import { clearLocalSession, takeNextPath } from '@/lib/session'
import { getFriendlyMessage } from '@/lib/errorMessages'
import { APP_NAME } from '@/lib/constants'

document.title = APP_NAME

// A page chunk that no longer exists (the site was updated while this tab was
// open) can't be loaded — reload once to pick up the new version.
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('chunk-reload-at') ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem('chunk-reload-at', String(Date.now()))
  } catch {
    return
  }
  window.location.reload()
})

// A session that can't be renewed (refresh cookie expired/revoked) sends the user
// back to the login page once, with the current page remembered.
setSessionExpiredHandler((code) => {
  if (!useAuthStore.getState().token) return
  clearLocalSession()
  toast.error(
    code === 'SESSION_REVOKED' || code === 'ACCOUNT_DEACTIVATED'
      ? getFriendlyMessage(code)
      : t('Сессия истекла. Войдите снова.'),
  )
  void router.navigate('/login')
})

// An admin turned the user's access to a workspace off (12.B7). With no workspace
// left their sessions end and the handler above signs them out; otherwise they
// move to a workspace they still have.
let revokedHandled: string | null = null
setAccessRevokedHandler(async (slug) => {
  if (revokedHandled === slug) return
  revokedHandled = slug
  toast.error(getFriendlyMessage('MEMBER_DEACTIVATED'))
  const workspaces = await getWorkspaces().catch(() => [])
  const store = useWorkspaceStore.getState()
  store.setWorkspaces(workspaces)
  if (store.workspace?.slug === slug && workspaces.length > 0) {
    store.setWorkspace(workspaces[0])
    void router.navigate('/')
  }
  setTimeout(() => {
    revokedHandled = null
  }, 10_000)
})

// After OAuth the backend redirects to /#access_token=...  (or /#error=...).
// Capture that here before the router mounts, otherwise the token in the URL
// hash is thrown away and the guard bounces back to /login.
async function consumeOAuthRedirect(): Promise<boolean> {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const error = hash.get('error')
  const token = hash.get('access_token') ?? hash.get('token')
  if (!error && !token) return false

  history.replaceState(null, '', window.location.pathname)

  if (error) {
    setTimeout(
      () =>
        toast.error(
          // Backend codes (MEMBER_DEACTIVATED…) have a message; provider ones don't.
          /^[A-Z_]+$/.test(error)
            ? getFriendlyMessage(error)
            : t('Не удалось войти: {{error}}', { error }),
        ),
      0,
    )
    return true
  }

  // Keep the token no matter what — a failed profile/workspace fetch (e.g. an
  // inactive account the backend rejects) must not wipe the session.
  useAuthStore.setState({ token })

  const user = await getMe().catch(() => null)
  const workspaces = await getWorkspaces().catch(() => [])

  if (user) useAuthStore.getState().setAuth(user, token!)
  useWorkspaceStore.getState().setWorkspaces(workspaces)
  if (workspaces.length > 0)
    useWorkspaceStore.getState().setWorkspace(workspaces[0])
  if (!user) {
    setTimeout(
      () => toast.error(t('Вход выполнен, но профиль не загрузился')),
      0,
    )
  }
  const next = takeNextPath()
  history.replaceState(
    null,
    '',
    next ?? (workspaces.length > 0 ? '/' : '/onboarding/workspace'),
  )
  return true
}

async function bootstrap() {
  const fromOAuth = await consumeOAuthRedirect()
  // No access token yet, but the httpOnly refresh cookie may still hold a live
  // session (e.g. after the token store was cleared) — renew it silently.
  if (!fromOAuth && !useAuthStore.getState().token) {
    await refreshSession()
  }
  // Signed in, but the stored workspace list is gone (cleared site data): load it,
  // or the guard would send a member of a workspace to create a new one.
  const store = useWorkspaceStore.getState()
  if (!fromOAuth && useAuthStore.getState().token && !store.workspace) {
    const workspaces = await getWorkspaces().catch(() => [])
    store.setWorkspaces(workspaces)
    if (workspaces.length > 0) store.setWorkspace(workspaces[0])
  }
}

bootstrap().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <RouterProvider router={router} />
        <Toaster />
        <ConnectionBanner />
      </ThemeProvider>
    </StrictMode>,
  )
  // The rest of the pages download in the background once someone is at the
  // screen — the first mouse move, key or touch — or after 15 s, so their parsing
  // doesn't compete with the page being opened (12.F4). The presenter moves the
  // mouse long before the first click, so later pages still open instantly.
  const idle =
    window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 0))
  const events = ['pointermove', 'keydown', 'touchstart'] as const
  let started = false
  const start = () => {
    if (started) return
    started = true
    events.forEach((e) => window.removeEventListener(e, start))
    idle(() => prefetchPages())
  }
  events.forEach((e) =>
    window.addEventListener(e, start, { once: true, passive: true }),
  )
  setTimeout(start, 15000)
})
