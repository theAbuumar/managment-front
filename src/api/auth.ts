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
// The refresh cookie identifies the session; the empty body keeps older API
// versions (which required one) from rejecting the sign-out.
export const logout = () => client.post<unknown, void>('/auth/logout', {})

// Current user for the stored token (used after an OAuth redirect).
export const getMe = () => client.get<unknown, AuthUser>('/auth/me')

// Profile: ФИО (display_name is rebuilt from it), phone, language, time zone, avatar.
export const updateMe = (data: {
  display_name?: string
  avatar_url?: string | null
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
  phone?: string | null
  locale?: 'ru' | 'en'
  timezone?: string | null
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

// ─── Demo stand quick login (backend DEMO_MODE only; 404 otherwise) ────────────

export interface DemoAccount {
  email: string
  display_name: string
  position: string | null
  role: string | null
  workspace: string | null
  /** The four quick-login accounts, in story order; null for the rest. */
  demo_role?: 'rector' | 'prorector' | 'dean' | 'employee' | null
}

export const getDemoAccounts = () =>
  client.get<unknown, DemoAccount[]>('/auth/demo/accounts')

export const demoLogin = (email: string) =>
  client.post<unknown, AuthResponse>('/auth/demo/login', { email })

// Sign-in methods configured on this deployment (13.P5): the login page shows only
// these, so a stand without OAuth or SMTP has no buttons that end in an error.
export interface AuthProviders {
  email: boolean
  google: boolean
  github: boolean
  telegram: boolean
  /** DEMO_MODE: quick login as the demo accounts. */
  demo: boolean
  /** University account — LDAP / Active Directory (12.B10). */
  ldap?: boolean
  /** How the login page names it, and a hint under the login field. */
  ldap_label?: string | null
  ldap_hint?: string | null
}

// ─── University account: LDAP / Active Directory (12.B10, ADR-034) ─────────────

/** Login (as in the university network, or the work email) and password. */
export const ldapLogin = (login: string, password: string) =>
  client.post<unknown, AuthResponse>('/auth/ldap/login', { login, password })

// ─── A password as an additional sign-in method (12.B12, ADR-034) ──────────────

/** Email + password (`/auth/login`); 10 wrong in a row pause it for 15 minutes. */
export const passwordLogin = (email: string, password: string) =>
  client.post<unknown, AuthResponse>('/auth/login', { email, password })

export interface PasswordResult {
  has_password: true
  password_changed_at: string
  /** Other sessions that were ended. */
  signed_out_sessions: number
}

/**
 * Step 1 of setting a password: a 6-digit code to the account's email. The server
 * checks the password against the policy first, so a weak one sends no code.
 */
export const requestPasswordCode = (password: string) =>
  client.post<unknown, { status: 'otp_sent'; channel: 'email'; email: string }>(
    '/auth/password/code',
    { password },
  )

/** Step 2: the first password, or a new one instead of a forgotten one. */
export const setPassword = (code: string, password: string) =>
  client.post<unknown, PasswordResult>('/auth/password/set', { code, password })

/** Change knowing the current password. */
export const changePassword = (current_password: string, password: string) =>
  client.post<unknown, PasswordResult>('/auth/password/change', {
    current_password,
    password,
  })

export const getAuthProviders = () =>
  client.get<unknown, AuthProviders>('/auth/providers')

// ─── Connected login methods (auth_tz.md §10; Telegram in the profile — 13.P5) ─

export interface Identity {
  id: string
  provider: 'email' | 'google' | 'github' | 'telegram' | 'ldap'
  provider_email: string | null
  created_at: string
}

export const listIdentities = () =>
  client.get<unknown, Identity[]>('/auth/identities')

// With the token from telegramInit(): answers TELEGRAM_NOT_CONFIRMED
// (details.status 'pending') until the user confirms in the bot — poll it.
export const linkTelegram = (token: string) =>
  client.post<unknown, Identity>('/auth/identities/telegram/link', { token })

// Google/GitHub from the profile (4.F9, ADR-025): navigate to the returned consent
// URL; the provider brings the browser back to /profile#linked=<provider> or
// #link_error=<code>.
export const startOAuthLink = (provider: 'google' | 'github') =>
  client.post<unknown, { url: string }>(
    `/auth/identities/${provider}/link/start`,
  )

export const unlinkIdentity = (provider: Identity['provider']) =>
  client.delete<unknown, void>(`/auth/identities/${provider}`)

// ─── Sign-in sessions (Ф12 12.B2): «Мои сессии» in the profile ─────────────────

export interface AuthSession {
  id: string
  /** password | email_code | google | github | telegram | ldap | demo; null for old sessions. */
  method: string | null
  /** «Chrome 128», «Safari 17»… parsed from the User-Agent by the server. */
  browser: string | null
  /** «Windows», «macOS», «iOS», «Android»… */
  os: string | null
  mobile: boolean
  ip: string | null
  user_agent: string | null
  /** Sign-in time. */
  created_at: string
  /** Last sign-in or token refresh (≈ every 15 minutes while the site is open). */
  last_used_at: string
  expires_at: string
  /** This browser's session. */
  current: boolean
}

export const listSessions = () =>
  client
    .get<unknown, { data: AuthSession[] }>('/auth/sessions')
    .then((r) => r.data)

// Ends the session at once: its next request is refused (401 SESSION_REVOKED).
// Ending the current one signs this browser out (the cookie is cleared).
export const revokeSession = (id: string) =>
  client.delete<unknown, void>(`/auth/sessions/${id}`)

/** «Выйти на всех других устройствах»: this browser stays signed in. */
export const revokeOtherSessions = () =>
  client.post<unknown, { revoked: number }>('/auth/sessions/revoke-all')

/**
 * «Скачать мои данные» (12.B13): everything the system keeps about me as one
 * JSON file (`GET /auth/me/export`); the download goes to the audit log.
 */
export async function downloadMyData(fallbackName: string): Promise<void> {
  const blob = await client.get<unknown, Blob>('/auth/me/export', {
    responseType: 'blob',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fallbackName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  // Keep the link until the browser has picked the file name up.
  setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(link.href)
  }, 10_000)
}
