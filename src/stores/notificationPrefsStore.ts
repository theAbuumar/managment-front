import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// How this browser announces new notifications (Ф8 8.F2): a short chime and the
// unread count in the tab title. Kept per device — sound is wanted on an office
// PC, not on a projector laptop — so it lives in localStorage, not on the server.
interface NotificationPrefsState {
  sound: boolean
  titleCount: boolean
  setSound: (sound: boolean) => void
  setTitleCount: (titleCount: boolean) => void
}

export const useNotificationPrefs = create<NotificationPrefsState>()(
  persist(
    (set) => ({
      sound: true,
      titleCount: true,
      setSound: (sound) => set({ sound }),
      setTitleCount: (titleCount) => set({ titleCount }),
    }),
    {
      name: 'notification-prefs',
      partialize: ({ sound, titleCount }) => ({ sound, titleCount }),
    },
  ),
)
