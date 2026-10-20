import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity as ActivityIcon,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { DatePicker } from '@/components/ui/date-picker'
import { PersonAvatar } from '@/components/ui/person-avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getWorkspaceActivity,
  type FeedItem,
  type FeedType,
} from '@/api/activity'
import { getProjects, type Project } from '@/api/project'
import { getDepartments, type Department } from '@/api/department'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { ApiError } from '@/api/client'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { useMyRole } from '@/stores/summaryStore'
import { activityText } from '@/lib/activityText'
import { errorText } from '@/lib/errorMessages'
import { shortName, fullName } from '@/lib/people'
import { useRealtime } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import { t as translate } from '@/i18n'

// Workspace → «Лента событий» (Ф7 7.F9): who did what across all projects,
// newest first, for admins and department heads (GET WS/activity, 7.B3). The
// filters live in the URL, so a link opens the same picture. New events do not
// shift the list under the reader: a button offers to show them.

const PAGE = 50
const ALL = 'all'

const TYPES: { key: FeedType; label: () => string }[] = [
  { key: 'created', label: () => translate('Создание') },
  { key: 'state', label: () => translate('Состояние') },
  { key: 'review', label: () => translate('Проверка и ознакомление') },
  { key: 'deadline', label: () => translate('Сроки') },
  { key: 'people', label: () => translate('Исполнители') },
  { key: 'comments', label: () => translate('Комментарии') },
  { key: 'files', label: () => translate('Файлы') },
  { key: 'checklist', label: () => translate('Чек-листы') },
  { key: 'trash', label: () => translate('Удаление') },
]

const DANGER = new Set([
  'issue.deleted',
  'issue.review_returned',
  'issue.deadline_rejected',
])
const GOOD = new Set([
  'issue.review_approved',
  'issue.restored',
  'issue.deadline_approved',
  'issue.checklist_checked',
])

function zone(): string | undefined {
  return useAuthStore.getState().user?.timezone || undefined
}

/** "2026-10-20" of an instant in the reader's zone. */
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function dayTitle(key: string): string {
  const today = dayKey(new Date().toISOString())
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString())
  if (key === today) return translate('Сегодня')
  if (key === yesterday) return translate('Вчера')
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    timeZone: zone(),
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** The phrase, with names of the state/person/label the row refers to (sent by the API). */
function phrase(item: FeedItem): string {
  const named = (id: string | null) =>
    id === item.new_value
      ? item.new_label
      : id === item.old_value
        ? item.old_label
        : null
  return activityText(item, {
    member: (id) =>
      shortName({ display_name: named(id) }) || translate('участник'),
    label: (id) => named(id) ?? translate('метка'),
    state: (id) => named(id) ?? '—',
  })
}

export function ActivityFeedPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const role = useMyRole()
  const [params, setParams] = useSearchParams()

  const types = useMemo(
    () => (params.get('type')?.split(',').filter(Boolean) ?? []) as FeedType[],
    [params],
  )
  const project = params.get('project') ?? ''
  const department = params.get('department') ?? ''
  const actor = params.get('actor') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const filtered =
    types.length > 0 || !!project || !!department || !!actor || !!from || !!to

  const [rows, setRows] = useState<FeedItem[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fresh, setFresh] = useState(false)
  const [reload, setReload] = useState(0)

  const [projects, setProjects] = useState<Project[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])

  useEffect(() => {
    if (!slug) return
    getProjects(slug).then(setProjects, () => setProjects([]))
    getDepartments(slug).then(setDepartments, () => setDepartments([]))
    getWorkspaceMembers(slug).then(setMembers, () => setMembers([]))
  }, [slug])

  function set(key: string, value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  function toggleType(type: FeedType) {
    const next = types.includes(type)
      ? types.filter((x) => x !== type)
      : [...types, type]
    set('type', next.join(','))
  }

  const query = useMemo(
    () => ({
      type: types.length > 0 ? types : undefined,
      project: project || undefined,
      department: department || undefined,
      actor: actor || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: PAGE,
    }),
    [types, project, department, actor, from, to],
  )

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setRows(null)
      setError(null)
      setFresh(false)
      try {
        const page = await getWorkspaceActivity(slug, query)
        if (cancelled) return
        setRows(page.data)
        setCursor(page.next_cursor)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 403) setForbidden(true)
        else setError(errorText(err, t('Не удалось загрузить ленту')))
        setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, query, reload, t])

  // Something happened somewhere: offer to show it instead of moving the list.
  useRealtime((message) => {
    if (message.type === 'resync' || message.issue_id) setFresh(true)
  })

  async function loadMore() {
    if (!slug || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getWorkspaceActivity(slug, { ...query, cursor })
      setRows((prev) => [...(prev ?? []), ...page.data])
      setCursor(page.next_cursor)
    } catch (err) {
      setError(errorText(err, t('Не удалось загрузить ленту')))
    } finally {
      setLoadingMore(false)
    }
  }

  const days = useMemo(() => {
    const groups: { key: string; items: FeedItem[] }[] = []
    for (const row of rows ?? []) {
      const key = dayKey(row.created_at)
      const last = groups[groups.length - 1]
      if (last && last.key === key) last.items.push(row)
      else groups.push({ key, items: [row] })
    }
    return groups
  }, [rows])

  const admin = role === 'owner' || role === 'admin'
  const people = useMemo(
    () =>
      [...members].sort((a, b) =>
        fullName(a.user).localeCompare(fullName(b.user), 'ru'),
      ),
    [members],
  )

  function open(item: FeedItem) {
    if (item.issue.deleted_at) navigate('/trash')
    else
      navigate(
        `/projects/${item.issue.project.id}/work-items?issue=${item.issue.id}`,
      )
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <ActivityIcon size={16} />
        {t('Лента событий')}
      </div>

      <div className="max-w-5xl space-y-4 px-4 py-6 md:px-8">
        {!forbidden && (
          <p className="text-sm text-muted-foreground">
            {admin
              ? t(
                  'Кто и что сделал во всех проектах: создание и смена состояния, отчёты и решения контролёров, сроки, исполнители, комментарии, файлы и удаление.',
                )
              : t(
                  'Работа ваших подразделений вместе с подчинёнными: кто и что сделал по их задачам.',
                )}
          </p>
        )}

        {forbidden ? (
          <EmptyState
            icon={Lock}
            title={t(
              'Лента доступна администраторам и руководителям подразделений',
            )}
            description={t('История каждой задачи — в её карточке.')}
          />
        ) : (
          <>
            {/* Filters */}
            <div className="space-y-3">
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={t('Что показывать')}
              >
                {TYPES.map((type) => (
                  <button
                    key={type.key}
                    type="button"
                    aria-pressed={types.includes(type.key)}
                    onClick={() => toggleType(type.key)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      types.includes(type.key)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-foreground hover:bg-muted',
                    )}
                  >
                    {type.label()}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Select
                  value={project || ALL}
                  onValueChange={(v) => set('project', v === ALL ? null : v)}
                >
                  <SelectTrigger aria-label={t('Проект')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('Все проекты')}</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={department || ALL}
                  onValueChange={(v) => set('department', v === ALL ? null : v)}
                >
                  <SelectTrigger aria-label={t('Подразделение')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      {t('Все подразделения')}
                    </SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.short_name || d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={actor || ALL}
                  onValueChange={(v) => set('actor', v === ALL ? null : v)}
                >
                  <SelectTrigger aria-label={t('Кто')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('Все сотрудники')}</SelectItem>
                    {people.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {shortName(m.user)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="w-5 shrink-0">{t('с')}</span>
                  <DatePicker
                    value={from}
                    max={to || undefined}
                    onChange={(e) => set('from', e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="w-5 shrink-0">{t('по')}</span>
                  <DatePicker
                    value={to}
                    min={from || undefined}
                    onChange={(e) => set('to', e.target.value)}
                  />
                </label>
              </div>
              {filtered && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() =>
                    setParams(new URLSearchParams(), { replace: true })
                  }
                >
                  <X size={14} />
                  {t('Сбросить фильтры')}
                </Button>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 px-4 py-3 text-sm text-destructive"
              >
                <span>{error}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReload((n) => n + 1)}
                >
                  {t('Повторить')}
                </Button>
              </div>
            )}

            {fresh && rows !== null && (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReload((n) => n + 1)}
                >
                  <RefreshCw size={14} />
                  {t('Есть новые события — показать')}
                </Button>
              </div>
            )}

            {rows === null ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : rows.length === 0 && !error ? (
              <EmptyState
                icon={ActivityIcon}
                title={
                  filtered ? t('Ничего не найдено') : t('Событий пока нет')
                }
                description={
                  filtered ? t('Измените или сбросьте фильтры.') : undefined
                }
              />
            ) : (
              <div className="space-y-5" data-testid="activity-feed">
                {days.map((day) => (
                  <section key={day.key}>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first-letter:uppercase">
                      {dayTitle(day.key)}
                    </h2>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {day.items.map((item) => {
                        const key = `${item.issue.project.identifier}-${item.issue.sequence_id}`
                        return (
                          <li
                            key={item.id}
                            className="flex items-start gap-3 px-3 py-2.5 sm:px-4"
                          >
                            <PersonAvatar
                              person={item.actor}
                              size={28}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-foreground">
                                <span className="font-medium">
                                  {shortName(item.actor)}
                                </span>{' '}
                                <span
                                  className={cn(
                                    DANGER.has(item.action) &&
                                      'text-red-600 dark:text-red-400',
                                    GOOD.has(item.action) &&
                                      'text-emerald-700 dark:text-emerald-400',
                                  )}
                                >
                                  {phrase(item)}
                                </span>
                              </p>
                              <button
                                type="button"
                                onClick={() => open(item)}
                                className="mt-0.5 flex max-w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
                                title={
                                  item.issue.deleted_at
                                    ? t('Задача в корзине')
                                    : t('Открыть задачу')
                                }
                              >
                                <span className="shrink-0">
                                  {item.issue.project.icon ?? '📁'}
                                </span>
                                <span className="shrink-0 font-mono">
                                  {key}
                                </span>
                                {item.issue.kind === 'assignment' && (
                                  <ShieldCheck
                                    size={12}
                                    className="shrink-0 text-primary"
                                    aria-label={t('Поручение')}
                                  />
                                )}
                                <span
                                  className={cn(
                                    'truncate',
                                    item.issue.deleted_at && 'line-through',
                                  )}
                                >
                                  {item.issue.title}
                                </span>
                                {item.issue.deleted_at && (
                                  <span className="flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px]">
                                    <Trash2 size={10} />
                                    {t('в корзине')}
                                  </span>
                                )}
                              </button>
                            </div>
                            <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                              {time(item.created_at)}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            {cursor && rows && rows.length > 0 && (
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
          </>
        )}
      </div>
    </div>
  )
}
