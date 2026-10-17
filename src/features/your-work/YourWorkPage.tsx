import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Briefcase,
  RotateCw,
  AlertCircle,
  Inbox,
  Flame,
  CalendarClock,
  EyeOff,
  Eye,
  ShieldCheck,
  Hourglass,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useMySummary } from '@/stores/summaryStore'
import {
  getAllWorkspaceIssues,
  type Issue,
  type WorkspaceListParams,
} from '@/api/issue'
import { IssueRow } from '@/features/issues/IssueRow'
import { WorkspaceIssuePanel } from '@/features/issues/WorkspaceIssuePanel'
import { errorText } from '@/lib/errorMessages'
import { deadlineInfo } from '@/lib/deadline'
import { t as translate } from '@/i18n'

type Tab = 'assigned' | 'control' | 'review' | 'created' | 'watching'

// Each tab is one server-side filter of GET WS/issues (7.B1) — no per-project fan-out.
const TABS: {
  key: Tab
  label: () => string
  icon: LucideIcon
  params: WorkspaceListParams
}[] = [
  {
    key: 'assigned',
    label: () => translate('Мне поручено'),
    icon: Briefcase,
    params: { assignee: 'me' },
  },
  {
    key: 'control',
    label: () => translate('На контроле'),
    icon: ShieldCheck,
    params: { kind: 'assignment', reviewer: 'me' },
  },
  {
    key: 'review',
    label: () => translate('Ждут моей проверки'),
    icon: Hourglass,
    params: { reviewer: 'me', state_group: 'review' },
  },
  {
    key: 'created',
    label: () => translate('Создано мной'),
    icon: Inbox,
    params: { created_by: 'me' },
  },
  {
    key: 'watching',
    label: () => translate('Наблюдаю'),
    icon: Eye,
    params: { watcher: 'me' },
  },
]

// Deadline buckets, in the order a person works through them.
type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'nodate' | 'done'
const BUCKETS: { key: Bucket; label: () => string; tone: string }[] = [
  {
    key: 'overdue',
    label: () => translate('Просрочено'),
    tone: 'text-red-600',
  },
  {
    key: 'today',
    label: () => translate('Срок сегодня'),
    tone: 'text-orange-600',
  },
  {
    key: 'week',
    label: () => translate('На этой неделе'),
    tone: 'text-amber-600',
  },
  { key: 'later', label: () => translate('Позже'), tone: 'text-foreground' },
  {
    key: 'nodate',
    label: () => translate('Без срока'),
    tone: 'text-muted-foreground',
  },
  {
    key: 'done',
    label: () => translate('Выполнено за 14 дней'),
    tone: 'text-emerald-600',
  },
]

const DONE_WINDOW_DAYS = 14

export function YourWorkPage() {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug
  const timeZone =
    workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const summary = useMySummary()

  // The tab lives in the URL (?tab=control) so the sidebar can link to it.
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.some((x) => x.key === tabParam)
    ? (tabParam as Tab)
    : 'assigned'
  const setTab = (next: Tab) =>
    setParams(next === 'assigned' ? {} : { tab: next }, { replace: true })

  const [issues, setIssues] = useState<Issue[]>([])
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const reqToken = useRef(0)

  // Two requests per tab: everything open, and what was closed in the last 14 days.
  const load = useCallback(
    async (which: Tab, mode: 'full' | 'refresh' = 'full') => {
      if (!slug) return
      const token = ++reqToken.current
      if (mode === 'refresh') setRefreshing(true)
      const filter = TABS.find((x) => x.key === which)!.params
      const since = new Date(
        Date.now() - DONE_WINDOW_DAYS * 86_400_000,
      ).toISOString()
      try {
        const [open, done] = await Promise.all([
          getAllWorkspaceIssues(slug, {
            ...filter,
            open: 'true',
            sort_by: 'due_date',
            order: 'asc',
          }),
          getAllWorkspaceIssues(slug, {
            ...filter,
            state_group: 'completed',
            completed_after: since,
            sort_by: 'updated_at',
            order: 'desc',
          }),
        ])
        if (token !== reqToken.current) return
        setIssues([...open, ...done])
        setLoadedTab(which)
        setError(null)
      } catch (err) {
        if (token === reqToken.current)
          setError(errorText(err, t('Не удалось загрузить задачи')))
      } finally {
        if (token === reqToken.current) setRefreshing(false)
      }
    },
    [slug, t],
  )

  useEffect(() => {
    // Deferred a tick so the load's state updates don't run inside the effect body.
    const id = setTimeout(() => void load(tab), 0)
    return () => clearTimeout(id)
  }, [load, tab])

  const buckets = useMemo(() => {
    const result: Record<Bucket, Issue[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      nodate: [],
      done: [],
    }
    for (const i of issues) {
      const g = i.state?.group
      if (g === 'completed' || g === 'cancelled') {
        result.done.push(i)
        continue
      }
      const info = deadlineInfo(i.due_date, g, timeZone)
      if (info.tone === 'none') result.nodate.push(i)
      else if (info.tone === 'overdue') result.overdue.push(i)
      else if (info.tone === 'today') result.today.push(i)
      else if ((info.days ?? 99) <= 7) result.week.push(i)
      else result.later.push(i)
    }
    return result
  }, [issues, timeZone])

  const selected = issues.find((i) => i.id === selectedId) ?? null

  const tiles: {
    label: string
    value: number | undefined
    hint?: string
    icon: LucideIcon
    tone: string
    tab: Tab
  }[] = [
    {
      label: t('В работе у меня'),
      value: summary?.assigned,
      icon: Briefcase,
      tone: 'text-primary',
      tab: 'assigned',
    },
    {
      label: t('Просрочено'),
      value: summary?.overdue,
      icon: Flame,
      tone: summary?.overdue ? 'text-red-600' : 'text-muted-foreground',
      tab: 'assigned',
    },
    {
      label: t('Срок сегодня'),
      value: summary?.due_today,
      icon: CalendarClock,
      tone: summary?.due_today ? 'text-orange-600' : 'text-muted-foreground',
      tab: 'assigned',
    },
    {
      label: t('Ждут ознакомления'),
      value: summary?.unacknowledged,
      icon: EyeOff,
      tone: summary?.unacknowledged
        ? 'text-amber-600'
        : 'text-muted-foreground',
      tab: 'assigned',
    },
    {
      label: t('На моём контроле'),
      value: summary?.control,
      hint: summary?.control_overdue
        ? t('просрочено: {{n}}', { n: summary.control_overdue })
        : undefined,
      icon: ShieldCheck,
      tone: 'text-primary',
      tab: 'control',
    },
    {
      label: t('Ждут моей проверки'),
      value: summary?.review_pending,
      icon: Hourglass,
      tone: summary?.review_pending
        ? 'text-violet-600'
        : 'text-muted-foreground',
      tab: 'review',
    },
  ]
  const tabCount: Partial<Record<Tab, number>> = {
    assigned: summary?.assigned,
    control: summary?.control,
    review: summary?.review_pending,
    watching: summary?.watching,
  }

  const nonEmpty = BUCKETS.filter((b) => buckets[b.key].length > 0)
  const loading = loadedTab !== tab && !error

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6">
        <Briefcase size={16} className="text-muted-foreground" />
        <h1 className="text-sm font-semibold">{t('Мои задачи')}</h1>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => load(tab, 'refresh')}
          disabled={refreshing}
        >
          <RotateCw size={14} className={cn(refreshing && 'animate-spin')} />
          {t('Обновить')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
          {/* KPI tiles — the same counters as the sidebar (GET me/summary). */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {tiles.map((tile) => (
              <button
                key={tile.label}
                onClick={() => setTab(tile.tab)}
                className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
              >
                <tile.icon size={16} className={tile.tone} />
                {tile.value === undefined ? (
                  <Skeleton className="mt-2 h-8 w-10" />
                ) : (
                  <p
                    className={cn(
                      'mt-2 text-2xl font-bold tabular-nums',
                      tile.tone,
                    )}
                  >
                    {tile.value}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                {tile.hint && (
                  <p className="text-[11px] text-red-600">{tile.hint}</p>
                )}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={cn(
                  '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
                  tab === tb.key
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <tb.icon size={14} />
                {tb.label()}
                {tabCount[tb.key] !== undefined && (
                  <span className="rounded bg-muted px-1.5 text-[11px] tabular-nums">
                    {tabCount[tb.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {error ? (
            <EmptyState
              icon={AlertCircle}
              title={t('Не удалось загрузить задачи')}
              description={error}
            />
          ) : loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-40" />
            </div>
          ) : nonEmpty.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t('Здесь пусто')}
              description={
                tab === 'review'
                  ? t('Нет работ, ожидающих вашей проверки.')
                  : tab === 'control'
                    ? t('Нет поручений, где вы контролёр.')
                    : tab === 'watching'
                      ? t('Вы пока ни за чем не наблюдаете.')
                      : tab === 'created'
                        ? t('Вы пока не создавали задач.')
                        : t('Задачи появятся здесь, когда вам их поручат.')
              }
            />
          ) : (
            <div className="space-y-6">
              {nonEmpty.map((b) => (
                <section key={b.key}>
                  <h2
                    className={cn(
                      'mb-2 flex items-center gap-2 text-sm font-semibold',
                      b.tone,
                    )}
                  >
                    {b.label()}
                    <span className="rounded bg-muted px-1.5 text-xs font-normal text-muted-foreground">
                      {buckets[b.key].length}
                    </span>
                  </h2>
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {buckets[b.key].map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        person={tab === 'assigned' ? 'controller' : 'assignee'}
                        onOpen={() => setSelectedId(issue.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {slug && (
        <WorkspaceIssuePanel
          slug={slug}
          issue={selected}
          onClose={() => setSelectedId(null)}
          onUpdated={(updated) =>
            setIssues((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i)),
            )
          }
          onDeleted={(id) => {
            setIssues((prev) => prev.filter((i) => i.id !== id))
            setSelectedId(null)
          }}
        />
      )}
    </div>
  )
}
