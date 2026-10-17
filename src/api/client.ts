import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { getFriendlyMessage } from '@/lib/errorMessages'

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

// ─── Silent session refresh ───────────────────────────────────────────────────
// The access token is short-lived; the refresh token lives in an httpOnly cookie.
// On a 401 we refresh once (shared by all concurrent requests) and replay.

let refreshing: Promise<string | null> | null = null

/** Exchange the refresh cookie for a new access token; null when there is no session. */
export function refreshSession(): Promise<string | null> {
  refreshing ??= axios
    .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
    .then((res) => {
      const { access_token, user } = res.data
      useAuthStore.getState().setAuth(user, access_token)
      return access_token as string
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

// Requests that must never trigger a refresh-and-retry loop.
const NO_RETRY = ['/auth/refresh', '/auth/logout', '/auth/email/', '/auth/telegram/']

let onSessionExpired: (() => void) | null = null

/** Called once when the session cannot be renewed (wired up in main.tsx). */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

function toApiError(err: AxiosError): ApiError {
  if (!err.response) {
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

// Unwrap `data` on success; refresh-and-retry on 401; normalize errors to ApiError.
axiosRequester.interceptors.response.use(
  (res) => res.data,
  async (err: AxiosError) => {
    const original = err.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined
    const url = original?.url ?? ''

    if (
      err.response?.status === 401 &&
      original &&
      !original._retried &&
      !NO_RETRY.some((p) => url.includes(p))
    ) {
      original._retried = true
      const token = await refreshSession()
      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return axiosRequester(original)
      }
      onSessionExpired?.()
    }

    return Promise.reject(toApiError(err))
  },
)

export { axiosRequester }
export default axiosRequester
