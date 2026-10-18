import { useEffect } from 'react'
import { APP_NAME } from '@/lib/constants'
import { useNotificationStore } from '@/stores/notificationStore'
import { useNotificationPrefs } from '@/stores/notificationPrefsStore'

/**
 * The bell's unread count in the tab title — «(3) Система поручений» — so a
 * background tab shows there is something new (Ф8 8.F2). Switched off in the
 * profile; the plain name comes back when the app shell unmounts (sign-out).
 */
export function useUnreadTitle() {
  const unread = useNotificationStore((s) => s.unreadCount)
  const enabled = useNotificationPrefs((s) => s.titleCount)

  useEffect(() => {
    const count = unread > 99 ? '99+' : String(unread)
    document.title = enabled && unread > 0 ? `(${count}) ${APP_NAME}` : APP_NAME
  }, [unread, enabled])

  useEffect(
    () => () => {
      document.title = APP_NAME
    },
    [],
  )
}
