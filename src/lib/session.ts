import { logout as apiLogout } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useNotificationStore } from '@/stores/notificationStore'

// Where to return after signing in (set before leaving for login / an OAuth
// provider, consumed once the session exists).
const NEXT_KEY = 'auth:next'

export function rememberNextPath(path: string) {
  try {
    sessionStorage.setItem(NEXT_KEY, path)
  } catch {
    // Storage unavailable (private mode) — the user just lands on the home page.
  }
}

export function takeNextPath(): string | null {
  try {
    const next = sessionStorage.getItem(NEXT_KEY)
    sessionStorage.removeItem(NEXT_KEY)
    // Only same-app paths — never an absolute URL from storage.
    return next && next.startsWith('/') && !next.startsWith('//') ? next : null
  } catch {
    return null
  }
}

/** Drop every bit of local session state (no server call). */
export function clearLocalSession() {
  useAuthStore.getState().logout()
  useWorkspaceStore.getState().reset()
  useNotificationStore.getState().setUnreadCount(0)
}

/** Sign out: revoke the refresh token on the server, then clear local state. */
export async function signOut() {
  await apiLogout().catch(() => {
    // Already expired/offline — local cleanup is what matters to the user.
  })
  clearLocalSession()
}
