import client, { API_BASE_URL } from './client'
import type { AuthUser } from '@/stores/authStore'

export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: AuthUser
}

// OAuth start endpoints — the browser navigates here; the backend shows the
// provider's consent screen, handles the callback and redirects back with a session.
// They must live on the same origin as the backend's OAuth callback (the CSRF
// `state` cookie is set here and checked there), so a cross-origin dev setup points
// them at VITE_API_URL directly instead of the Vite proxy.
const OAUTH_BASE = import.meta.env.VITE_API_URL || API_BASE_URL

export const OAUTH_URLS = {
  google: `${OAUTH_BASE}/auth/google`,
  github: `${OAUTH_BASE}/auth/github`,
}

// Passwordless email sign-in. Step 1 emails a 6-digit code (same response for new
// and existing addresses); `display_name` is used only when the account is new.
export const requestEmailCode = (email: string, display_name?: string) =>
  client.post<unknown, { status: 'otp_sent'; email: string }>(
    '/auth/email/otp/request',
    { email, ...(display_name ? { display_name } : {}) },
  )

// Step 2: confirm the code → session (refresh cookie + access token).
export const verifyEmailCode = (email: string, code: string) =>
  client.post<unknown, AuthResponse>('/auth/email/otp/verify', { email, code })

// Revoke the refresh token server-side (the cookie is cleared by the response).
export const logout = () => client.post<unknown, void>('/auth/logout')

// Current user for the stored token (used after an OAuth redirect).
export const getMe = () => client.get<unknown, AuthUser>('/auth/me')

// Backend only accepts display_name / avatar_url.
export const updateMe = (data: {
  display_name?: string
  avatar_url?: string | null
}) => client.patch<unknown, AuthUser>('/auth/me', data)

// Code-confirmed account deletion — a two-step flow (both require a session).
// Step 1: request a 6-digit code, delivered to the account's email or, for a
// Telegram-only account, through the bot. `channel` says which; `email` is set
// only for the email channel. A 400 means the account has no email/Telegram to
// reach — the user must link one first.
export interface DeleteChallenge {
  status: 'otp_sent'
  channel: 'email' | 'telegram'
  email?: string | null
}

export const requestAccountDeletion = () =>
  client.post<unknown, DeleteChallenge>('/auth/account/delete/request')

// Step 2: confirm with the code. On success (204) the account is anonymized and
// every session is revoked server-side, so the client must drop its local auth.
export const confirmAccountDeletion = (code: string) =>
  client.post<unknown, void>('/auth/account/delete/confirm', { code })

// Telegram login: /init returns a deep-link to open + a token to poll.
export const telegramInit = () =>
  client.post<
    unknown,
    { deep_link: string; token: string; expires_at: string }
  >('/auth/telegram/init')

// Poll after the user opens the deep-link; tokens arrive once authenticated.
export const telegramStatus = (token: string) =>
  client.get<
    unknown,
    {
      status: 'pending' | 'expired' | 'used' | 'authenticated'
      access_token?: string
      refresh_token?: string
      user?: AuthUser
    }
  >(`/auth/telegram/status?token=${encodeURIComponent(token)}`)
