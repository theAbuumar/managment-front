import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: string
  email: string | null
  display_name: string
  avatar_url?: string | null
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  setAuth: (user: AuthUser, token: string) => void
  setUser: (user: AuthUser) => void
  logout: () => void
}

// The access token is short-lived (15 min) and is renewed silently through the
// httpOnly refresh cookie (api/client.ts → refreshSession). It is persisted only
// so a reload doesn't flash the login page while the refresh is in flight.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'auth-storage' },
  ),
)
