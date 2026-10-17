import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import './index.css'
import '@/i18n'
import { t } from '@/i18n'
import { router } from './routes'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Toaster } from '@/components/ui/toaster'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getMe } from '@/api/auth'
import { getWorkspaces } from '@/api/workspace'
import { refreshSession, setSessionExpiredHandler } from '@/api/client'
import { clearLocalSession, takeNextPath } from '@/lib/session'
import { APP_NAME } from '@/lib/constants'

document.title = APP_NAME

// A session that can't be renewed (refresh cookie expired/revoked) sends the user
// back to the login page once, with the current page remembered.
setSessionExpiredHandler(() => {
  if (!useAuthStore.getState().token) return
  clearLocalSession()
  toast.error(t('Сессия истекла. Войдите снова.'))
  void router.navigate('/login')
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
    setTimeout(() => toast.error(t('Не удалось войти: {{error}}', { error })), 0)
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
    setTimeout(() => toast.error(t('Вход выполнен, но профиль не загрузился')), 0)
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
}

bootstrap().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <RouterProvider router={router} />
        <Toaster />
      </ThemeProvider>
    </StrictMode>,
  )
})
