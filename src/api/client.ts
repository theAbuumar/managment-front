import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { getFriendlyMessage } from '@/lib/errorMessages'
import {
  markOffline,
  markOnline,
  setConnectionProbe,
  waitForOnline,
} from '@/lib/connection'

// Same-origin by default: dev goes through the Vite proxy, production is served
// with `/api` proxied to the backend (ADR-003). VITE_API_URL overrides it for a
// cross-origin deployment.
export const API_BASE_URL = import.meta.env.DEV
  ? '/api/v1'
  : import.meta.env.VITE_API_URL || '/api/v1'

/** An API failure with the backend's machine-readable code and HTTP status. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const axiosRequester = axios.create({
  baseURL: API_BASE_URL,
  // Send/receive the httpOnly refresh cookie (and the Telegram `tg_session`).
  withCredentials: true,
})

// Attach the bearer token from the zustand store on every request.
axiosRequester.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Connection (12.F5) ───────────────────────────────────────────────────────
// No answer at all, or the proxy saying the API is down while it restarts, means
// "no connection" — not an error of the request itself.

const UNAVAILABLE = new Set([502, 503, 504])
/** How long a read waits for the connection before it gives up. */
const WAIT_FOR_SERVER_MS = 60_000

function unreachable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  return !err.response || UNAVAILABLE.has(err.response.status)
}

// Any HTTP answer below 500 means the server is there.
setConnectionProbe(async () => {
  const res = await fetch(`${API_BASE_URL}/auth/providers`, {
    cache: 'no-store',
  })
  return res.status < 500
})

// ─── Silent session refresh ───────────────────────────────────────────────────
// The access token is short-lived; the refresh token lives in an httpOnly cookie.
// On a 401 we refresh once (shared by all concurrent requests) and replay.

interface RefreshResult {
  token: string | null
  /** True when the server could not be reached (the session may still be fine). */
  unreachable: boolean
}

let refreshing: Promise<RefreshResult> | null = null

function refresh(): Promise<RefreshResult> {
  refreshing ??= (async (): Promise<RefreshResult> => {
    // A refresh that hits a dropped connection waits for it once instead of
    // treating the user as signed out (12.F5).
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        )
        markOnline()
        const { access_token, user } = res.data
        useAuthStore.getState().setAuth(user, access_token)
        return { token: access_token as string, unreachable: false }
      } catch (err) {
        if (!unreachable(err)) {
          markOnline()
          return { token: null, unreachable: false }
        }
        markOffline()
        if (attempt > 0 || !(await waitForOnline(WAIT_FOR_SERVER_MS)))
          return { token: null, unreachable: true }
      }
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** Exchange the refresh cookie for a new access token; null when there is no session. */
export async function refreshSession(): Promise<string | null> {
  return (await refresh()).token
}

// Requests that must never trigger a refresh-and-retry loop.
const NO_RETRY = ['/auth/refresh', '/auth/logout', '/auth/email/', '/auth/telegram/']

let onSessionExpired: (() => void) | null = null

/** Called once when the session cannot be renewed (wired up in main.tsx). */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

function toApiError(err: AxiosError): ApiError {
  if (!err.response || UNAVAILABLE.has(err.response.status)) {
    return new ApiError(0, 'NETWORK_ERROR', getFriendlyMessage('NETWORK_ERROR'))
  }
  const body = err.response.data as
    | { error?: { code?: string; message?: string; details?: unknown } }
    | undefined
  const code = body?.error?.code ?? 'INTERNAL_ERROR'
  return new ApiError(
    err.response.status,
    code,
    getFriendlyMessage(code),
    body?.error?.details,
  )
}

// Listeners told about every successful write (POST/PATCH/PUT/DELETE), e.g. to
// refresh the sidebar counters right after a task changes.
type MutationListener = (url: string) => void
const mutationListeners = new Set<MutationListener>()

export function onApiMutation(listener: MutationListener): () => void {
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}

// Unwrap `data` on success; refresh-and-retry on 401; normalize errors to ApiError.
axiosRequester.interceptors.response.use(
  (res) => {
    markOnline()
    const method = res.config.method?.toLowerCase()
    if (method && method !== 'get' && method !== 'head') {
      mutationListeners.forEach((fn) => fn(res.config.url ?? ''))
    }
    return res.data
  },
  async (err: AxiosError) => {
    const original = err.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean; _waited?: boolean })
      | undefined
    const url = original?.url ?? ''

    if (unreachable(err)) {
      markOffline()
      // Reads are safe to repeat: wait for the server and send them again.
      // Writes are not resent on their own — the form keeps what was typed.
      const method = original?.method?.toLowerCase()
      if (
        original &&
        !original._waited &&
        (method === 'get' || method === 'head')
      ) {
        original._waited = true
        if (await waitForOnline(WAIT_FOR_SERVER_MS))
          return axiosRequester(original)
      }
      return Promise.reject(toApiError(err))
    }
    markOnline()

    if (
      err.response?.status === 401 &&
      original &&
      !original._retried &&
      !NO_RETRY.some((p) => url.includes(p))
    ) {
      original._retried = true
      const { token, unreachable: offline } = await refresh()
      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return axiosRequester(original)
      }
      // No connection is not an expired session: stay signed in.
      if (offline) {
        return Promise.reject(
          new ApiError(0, 'NETWORK_ERROR', getFriendlyMessage('NETWORK_ERROR')),
        )
      }
      onSessionExpired?.()
    }

    return Promise.reject(toApiError(err))
  },
)

export { axiosRequester }
export default axiosRequester
