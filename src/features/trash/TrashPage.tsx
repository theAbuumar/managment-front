import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CircleDot, FolderOpen, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  getTrash,
  purgeFromTrash,
  restoreFromTrash,
  type TrashItem,
  type TrashType,
} from '@/api/trash'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useMyRole } from '@/stores/summaryStore'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { dateTime } from '@/lib/dates'
import { pluralize } from '@/lib/plural'
import { cn } from '@/lib/utils'
import { t as translate } from '@/i18n'

// «Корзина» (Ф7 7.F7, ADR-017): deleted issues and projects with who deleted them
// and when they go for good; «Восстановить» and, for admins, «Удалить навсегда».
// A member sees the issues they deleted themselves (the backend decides).

const PAGE = 50
const DAY_MS = 24 * 60 * 60 * 1000

const FILTERS: {
  key: TrashType | 'all'
  label: () => string
  admin?: boolean
}[] = [
  { key: 'all', label: () => translate('Всё') },
  { key: 'issue', label: () => translate('Задачи') },
  { key: 'project', label: () => translate('Проекты'), admin: true },
]

/** «Удалится через 12 дней» / «Удалится сегодня». */
function purgeText(iso: string): { text: string; soon: boolean } {
  const days = Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS),
  )
  if (days === 0)
    return { text: translate('Удалится навсегда сегодня'), soon: true }
  return {
    text: translate('Удалится навсегда через {{n}}', {
      n: pluralize(days, [
        translate('день'),
        translate('дня'),
        translate('дней'),
      ]),
    }),
    soon: days <= 3,
  }
}

export function TrashPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const role = useMyRole()
  const admin = role === 'owner' || role === 'admin'
  const [filter, setFilter] = useState<TrashType | 'all'>('all')
  const [rows, setRows] = useState<TrashItem[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [retention, setRetention] = useState(30)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [purging, setPurging] = useState<TrashItem | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setRows(null)
      try {
        const page = await getTrash(slug, {
          type: filter === 'all' ? undefined : filter,
          limit: PAGE,
        })
        if (cancelled) return
        setRows(page.data)
        setCursor(page.next_cursor)
        setRetention(page.retention_days)
      } catch (err) {
        if (cancelled) return
        toast.error(errorText(err, t('Не удалось загрузить корзину')))
        setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, filter, t])

  async function loadMore() {
    if (!slug || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getTrash(slug, {
        type: filter === 'all' ? undefined : filter,
        cursor,
        limit: PAGE,
      })
      setRows((prev) => [...(prev ?? []), ...page.data])
      setCursor(page.next_cursor)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось загрузить корзину')))
    } finally {
      setLoadingMore(false)
    }
  }

  async function restore(item: TrashItem) {
    if (!slug) return
    setBusyId(item.id)
    try {
      const result = await restoreFromTrash(slug, item.type, item.id)
      setRows((prev) => prev?.filter((r) => r.id !== item.id) ?? prev)
      const open =
        result.type === 'issue'
          ? `/projects/${result.project_id}/work-items?issue=${result.id}`
          : `/projects/${result.id}/work-items`
      toast.success(
        result.type === 'issue'
          ? t('Задача {{key}} восстановлена', { key: result.key })
          : t('Проект «{{name}}» восстановлен вместе с задачами', {
              name: result.name,
            }),
        { action: { label: t('Открыть'), onClick: () => navigate(open) } },
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось восстановить')))
    } finally {
      setBusyId(null)
    }
  }

  async function purge(item: TrashItem) {
    if (!slug) return
    setBusyId(item.id)
    try {
      await purgeFromTrash(slug, item.type, item.id)
      setRows((prev) => prev?.filter((r) => r.id !== item.id) ?? prev)
      toast.success(
        item.type === 'issue'
          ? t('Задача {{key}} удалена навсегда', { key: item.key })
          : t('Проект «{{name}}» удалён навсегда', { name: item.name }),
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить')))
    } finally {
      setBusyId(null)
    }
  }

  const filters = FILTERS.filter((f) => !f.admin || admin)

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <Trash2 size={16} />
        {t('Корзина')}
      </div>

      <div className="max-w-4xl space-y-4 px-4 py-6 md:px-8">
        <p className="text-sm text-muted-foreground">
          {admin
            ? t(
                'Удалённые задачи и проекты хранятся {{n}}, затем удаляются навсегда. До этого их можно восстановить вместе с историей, комментариями и файлами.',
                { n: pluralize(retention, [t('день'), t('дня'), t('дней')]) },
              )
            : t(
                'Здесь задачи, которые удалили вы. Они хранятся {{n}}, затем удаляются навсегда. Всё удалённое в пространстве видят администраторы.',
                { n: pluralize(retention, [t('день'), t('дня'), t('дней')]) },
              )}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                filter === f.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {f.label()}
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title={t('Корзина пуста')}
            description={
              admin
                ? t('Здесь появятся удалённые задачи и проекты.')
                : t('Здесь появятся задачи, которые вы удалите.')
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows.map((item) => {
              const purgeInfo = purgeText(item.purge_at)
              const Icon = item.type === 'project' ? FolderOpen : CircleDot
              return (
                <li
                  key={`${item.type}-${item.id}`}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <Icon
                      size={16}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {item.key}
                        </span>
                        <span className="min-w-0 break-words font-medium text-foreground">
                          {item.name}
                        </span>
                        {item.type === 'project' && (
                          <Badge variant="secondary">
                            {t('Проект с задачами')}
                          </Badge>
                        )}
                        {item.kind === 'assignment' && (
                          <Badge variant="secondary">{t('Поручение')}</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.project && (
                          <>
                            {item.project.name}
                            {' · '}
                          </>
                        )}
                        {item.deleted_by
                          ? t('удалил(а) {{name}}', {
                              name: shortName(item.deleted_by),
                            })
                          : t('удалено')}
                        {' · '}
                        <span className="tabular-nums">
                          {dateTime(item.deleted_at)}
                        </span>
                      </p>
                      <p
                        className={cn(
                          'text-xs',
                          purgeInfo.soon
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-muted-foreground',
                        )}
                      >
                        {purgeInfo.text}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 pl-7 sm:pl-0">
                    {item.can_restore && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === item.id}
                        onClick={() => restore(item)}
                      >
                        <RotateCcw size={14} className="mr-1.5" />
                        {t('Восстановить')}
                      </Button>
                    )}
                    {item.can_purge && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busyId === item.id}
                        onClick={() => setPurging(item)}
                      >
                        {t('Удалить навсегда')}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {cursor && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {t('Показать ещё')}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(open) => !open && setPurging(null)}
        title={
          purging?.type === 'project'
            ? t('Удалить проект «{{name}}» навсегда?', { name: purging.name })
            : t('Удалить задачу {{key}} навсегда?', { key: purging?.key ?? '' })
        }
        description={
          purging?.type === 'project'
            ? t(
                'Проект, все его задачи, комментарии и файлы будут удалены без возможности восстановления. В журнале аудита останется запись.',
              )
            : t(
                'Задача, её комментарии и файлы будут удалены без возможности восстановления. В журнале аудита останется запись.',
              )
        }
        confirmLabel={t('Удалить навсегда')}
        cancelLabel={t('Отмена')}
        onConfirm={() => purging && purge(purging)}
      />
    </div>
  )
}
