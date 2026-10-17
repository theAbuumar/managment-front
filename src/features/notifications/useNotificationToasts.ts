import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getNotifications,
  markNotificationRead,
  type AppNotification,
} from '@/api/notification'
import { useRealtime } from '@/lib/realtime'
import { shortName } from '@/lib/people'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { t } from '@/i18n'
import { TYPE_META } from './notificationMeta'

/**
 * A toast for every new notification as it arrives over the live stream
 * (Ф8, part of 8.F2). The event carries ids only, so the fresh rows are read
 * through the regular API; a click opens the issue and marks the row read.
 * Several notifications arriving together become one toast each, newest last.
 */
export function useNotificationToasts() {
  const navigate = useNavigate()
  const shown = useRef(new Set<string>())
  // Only rows created after the app opened: older unread ones are on the bell.
  const since = useRef(0)
  useEffect(() => {
    since.current = Date.now()
  }, [])
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function showNew() {
    const slug = useWorkspaceStore.getState().workspace?.slug
    if (!slug) return
    const page = await getNotifications(slug, { read: false, limit: 5 }).catch(
      () => null,
    )
    if (!page) return
    const fresh = page.data
      .filter(
        (n) =>
          !shown.current.has(n.id) &&
          new Date(n.created_at).getTime() >= since.current - 5000,
      )
      .reverse()
    for (const n of fresh) {
      shown.current.add(n.id)
      present(slug, n)
    }
  }

  function present(slug: string, n: AppNotification) {
    const meta = TYPE_META[n.type]
    const title = meta
      ? meta.text(n, shortName(n.actor))
      : t('Новое уведомление')
    const issue = n.issue
    const key = issue
      ? `${issue.project.identifier}-${issue.sequence_id}`
      : null
    toast(title, {
      description: issue ? `${key} · ${issue.title}` : undefined,
      duration: 8000,
      action: issue
        ? {
            label: t('Открыть'),
            onClick: () => {
              void markNotificationRead(slug, n.id)
                .then(() => {
                  const store = useNotificationStore.getState()
                  store.setUnreadCount(Math.max(0, store.unreadCount - 1))
                })
                .catch(() => {})
              navigate(
                `/projects/${issue.project_id}/work-items?issue=${issue.id}`,
              )
            },
          }
        : undefined,
    })
  }

  useRealtime((message) => {
    if (message.type !== 'notification.created') return
    // A fan-out (рассылка) writes several rows at once — read them together.
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(() => void showNew(), 300)
  })
}
