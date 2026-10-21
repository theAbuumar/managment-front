import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, CheckCheck, Mail, MailOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useRealtime } from '@/lib/realtime'
import { useNotificationStore } from '@/stores/notificationStore'
import {
  getNotifications,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  isReportReady,
  type AppNotification,
  type NotificationType,
} from '@/api/notification'
import { downloadReportRun } from '@/api/reportSchedules'
import { TONES, TYPE_META } from './notificationMeta'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { timeAgo } from '@/lib/dates'
import { t as translate } from '@/i18n'

// Notifications page (Ф8 8.F4): every type of ADR-020 in Russian, a filter by
// read state and by topic, grouping of repeated events on the same task
// («3 комментария»), mark read / unread, and a click opens the task.

const PAGE_SIZE = 30

// Topic filter — groups of types.
type Topic = 'all' | 'assign' | 'review' | 'deadlines' | 'comments' | 'reports'
const TOPICS: { key: Topic; label: () => string; types?: NotificationType[] }[] = [
  { key: 'all', label: () => translate('Все') },
  { key: 'assign', label: () => translate('Назначения'), types: ['issue_assigned', 'acknowledged', 'state_changed'] },
  { key: 'review', label: () => translate('Проверка'), types: ['review_requested', 'review_approved', 'review_returned'] },
  {
    key: 'deadlines',
    label: () => translate('Сроки'),
    types: ['due_soon', 'overdue', 'escalated', 'deadline_change_requested', 'deadline_change_decided'],
  },
  { key: 'comments', label: () => translate('Комментарии'), types: ['comment_added', 'mentioned'] },
  { key: 'reports', label: () => translate('Отчёты'), types: ['report_ready'] },
]

/** Consecutive events of one type on one task collapse into a single row. */
interface Group {
  key: string
  head: AppNotification
  items: AppNotification[]
}

function groupItems(items: AppNotification[]): Group[] {
  const groups: Group[] = []
  for (const n of items) {
    const last = groups[groups.length - 1]
    if (
      last &&
      n.issue_id &&
      last.head.issue_id === n.issue_id &&
      last.head.type === n.type &&
      last.head.is_read === n.is_read
    ) {
      last.items.push(n)
    } else {
      groups.push({ key: n.id, head: n, items: [n] })
    }
  }
  return groups
}

function NotificationRow({
  group,
  onOpen,
  onToggleRead,
}: {
  group: Group
  onOpen: (g: Group) => void
  onToggleRead: (g: Group) => void
}) {
  const { t } = useTranslation()
  const n = group.head
  const meta = TYPE_META[n.type] ?? TYPE_META.digest
  const Icon = meta.icon
  const name = shortName(n.actor)
  const more = group.items.length - 1
  const issueKey = n.issue ? `${n.issue.project.identifier}-${n.issue.sequence_id}` : null

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/50 sm:px-4',
        !n.is_read && 'bg-primary/5',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(group)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <div className="relative shrink-0">
          {meta.system ? (
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', TONES[meta.tone])}>
              <Icon size={16} />
            </span>
          ) : (
            <>
              <PersonAvatar person={n.actor} size={36} title={false} />
              <span
                className={cn(
                  'absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-card',
                  TONES[meta.tone],
                )}
              >
                <Icon size={10} />
              </span>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">
            {meta.text(n, name)}
            {more > 0 && (
              <span className="ml-1 text-muted-foreground">{t('и ещё {{n}}', { n: more })}</span>
            )}
          </p>
          {n.issue && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              <span className="font-mono text-xs">{issueKey}</span> · {n.issue.title}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onToggleRead(group)}
          aria-label={n.is_read ? t('Отметить непрочитанным') : t('Отметить прочитанным')}
          title={n.is_read ? t('Отметить непрочитанным') : t('Отметить прочитанным')}
          className="rounded p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          {n.is_read ? <Mail size={14} /> : <MailOpen size={14} />}
        </button>
        {!n.is_read && <span className="size-2 rounded-full bg-primary" aria-hidden />}
      </div>
    </div>
  )
}

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount)

  const [items, setItems] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [topic, setTopic] = useState<Topic>('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const types = TOPICS.find((x) => x.key === topic)?.types

  // Reload from scratch whenever the workspace or a filter changes. The fetch
  // lives inside an async IIFE so the initial setState isn't called
  // synchronously in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await getNotifications(slug, {
          read: filter === 'unread' ? false : undefined,
          type: types,
          limit: PAGE_SIZE,
        })
        if (cancelled) return
        setItems(res.data)
        setCursor(res.next_cursor)
        setUnreadCount(res.unread_count)
      } catch (err) {
        if (!cancelled) toast.error(errorText(err, t('Не удалось загрузить уведомления')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, filter, topic, setUnreadCount, t]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live (8.F1): new notifications slide in on top, without a reload spinner.
  useRealtime((message) => {
    if (message.type !== 'notification.created' && message.type !== 'resync') return
    if (!slug) return
    void getNotifications(slug, {
      read: filter === 'unread' ? false : undefined,
      type: types,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        setItems((prev) => {
          const known = new Set(prev.map((it) => it.id))
          return [...res.data.filter((it) => !known.has(it.id)), ...prev]
        })
        setUnreadCount(res.unread_count)
      })
      .catch(() => {})
  })

  // Append the next page (user-triggered, so setState here is fine).
  async function loadMore() {
    if (!slug || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await getNotifications(slug, {
        read: filter === 'unread' ? false : undefined,
        type: types,
        cursor,
        limit: PAGE_SIZE,
      })
      setItems((prev) => [...prev, ...res.data])
      setCursor(res.next_cursor)
      setUnreadCount(res.unread_count)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось загрузить уведомления')))
    } finally {
      setLoadingMore(false)
    }
  }

  function setRead(ids: Set<string>, isRead: boolean) {
    setItems((prev) => prev.map((it) => (ids.has(it.id) ? { ...it, is_read: isRead } : it)))
  }

  // Optimistic: flip the rows and the badge, revert on failure.
  async function markGroup(group: Group, isRead: boolean) {
    if (!slug) return
    const targets = group.items.filter((it) => it.is_read !== isRead)
    if (targets.length === 0) return
    const ids = new Set(targets.map((it) => it.id))
    const before = unreadCount
    setRead(ids, isRead)
    setUnreadCount(Math.max(0, before + (isRead ? -targets.length : targets.length)))
    try {
      await Promise.all(
        targets.map((it) =>
          isRead ? markNotificationRead(slug, it.id) : markNotificationUnread(slug, it.id),
        ),
      )
    } catch (err) {
      setRead(ids, !isRead)
      setUnreadCount(before)
      toast.error(errorText(err, t('Не удалось обновить уведомление')))
    }
  }

  function open(group: Group) {
    void markGroup(group, true)
    const issue = group.head.issue
    const details = group.head.details
    if (issue) navigate(`/projects/${issue.project_id}/work-items?issue=${issue.id}`)
    else if (group.head.type === 'invite_received') navigate('/invitations')
    // A planned report (10.F7): the file itself; a sending gone from the history — the list.
    else if (group.head.type === 'report_ready') {
      if (slug && isReportReady(details))
        downloadReportRun(slug, details.run_id).catch(() => navigate('/settings/reports'))
      else navigate('/settings/reports')
    }
  }

  async function readAll() {
    if (!slug || unreadCount === 0 || markingAll) return
    setMarkingAll(true)
    try {
      await markAllNotificationsRead(slug)
      setItems((prev) => prev.map((it) => ({ ...it, is_read: true })))
      setUnreadCount(0)
      toast.success(t('Все уведомления прочитаны'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отметить уведомления')))
    } finally {
      setMarkingAll(false)
    }
  }

  const groups = groupItems(items)

  return (
    <div>
      {/* Top bar */}
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <Bell size={16} />
        {t('Уведомления')}
        {unreadCount > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
            {unreadCount}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={unreadCount === 0 || markingAll}
          onClick={readAll}
        >
          <CheckCheck size={14} />
          <span className="hidden sm:inline">{t('Прочитать все')}</span>
        </Button>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">{t('Уведомления')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Назначения, проверка работ, сроки и комментарии по задачам этого пространства.')}
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* All / Unread */}
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded px-3 py-1 text-sm font-medium transition-colors',
                  filter === f ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f === 'all' ? t('Все') : t('Непрочитанные')}
              </button>
            ))}
          </div>

          {/* Topic */}
          <div className="flex gap-1 overflow-x-auto">
            {TOPICS.filter((x) => x.key !== 'all').map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={topic === x.key}
                onClick={() => setTopic(topic === x.key ? 'all' : x.key)}
                className={cn(
                  'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  topic === x.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {x.label()}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={
              filter === 'unread'
                ? t('Непрочитанных уведомлений нет')
                : topic !== 'all'
                  ? t('Уведомлений этого типа нет')
                  : t('Уведомлений пока нет')
            }
            description={t(
              'Здесь появятся новые поручения, сдача работ на проверку, напоминания о сроках и упоминания в комментариях.',
            )}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <NotificationRow
                key={g.key}
                group={g}
                onOpen={open}
                onToggleRead={(x) => markGroup(x, !x.head.is_read)}
              />
            ))}
            {cursor && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? t('Загружаем…') : t('Показать ещё')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
