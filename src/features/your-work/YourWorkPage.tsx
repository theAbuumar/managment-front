import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Briefcase,
  RotateCw,
  AlertCircle,
  Inbox,
  Flame,
  CalendarClock,
  EyeOff,
  ShieldCheck,
  Hourglass,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { DeadlineBadge } from '@/components/ui/deadline-badge'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getProjects, type Project } from '@/api/project'
import { getStates, type State, type StateGroup } from '@/api/state'
import { getAllIssues, type Issue } from '@/api/issue'
import { IssueDetailPanel } from '@/features/work-items/IssueDetailPanel'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { deadlineInfo } from '@/lib/deadline'
import { t as translate } from '@/i18n'

type Tab = 'assigned' | 'control' | 'review' | 'created' | 'watching'

const TABS: { key: Tab; label: () => string; icon: LucideIcon }[] = [
  { key: 'assigned', label: () => translate('Мне поручено'), icon: Briefcase },
  { key: 'control', label: () => translate('На контроле'), icon: ShieldCheck },
  { key: 'review', label: () => translate('Ждут моей проверки'), icon: Hourglass },
  { key: 'created', label: () => translate('Создано мной'), icon: Inbox },
  { key: 'watching', label: () => translate('Наблюдаю'), icon: EyeOff },
]

// Deadline buckets, in the order a person works through them.
type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'nodate' | 'done'
const BUCKETS: { key: Bucket; label: () => string; tone: string }[] = [
  { key: 'overdue', label: () => translate('Просрочено'), tone: 'text-red-600' },
  { key: 'today', label: () => translate('Срок сегодня'), tone: 'text-orange-600' },
  { key: 'week', label: () => translate('На этой неделе'), tone: 'text-amber-600' },
  { key: 'later', label: () => translate('Позже'), tone: 'text-foreground' },
  { key: 'nodate', label: () => translate('Без срока'), tone: 'text-muted-foreground' },
  { key: 'done', label: () => translate('Выполнено за 14 дней'), tone: 'text-emerald-600' },
]

export function YourWorkPage() {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug
  const timeZone = workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const me = useAuthStore((s) => s.user?.id)

  const [projects, setProjects] = useState<Project[]>([])
  const [statesByProject, setStatesByProject] = useState<Record<string, State[]>>({})
  const [issues, setIssues] = useState<Issue[]>([])
  const [watchedIds, setWatchedIds] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('assigned')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // "Done in the last 14 days" is measured from when the page was opened.
  const [openedAt] = useState(() => Date.now())
  const reqToken = useRef(0)

  // One request per project for now (the workspace-level issue list comes in Ф7).
  const fetchAll = useCallback(
    async (mode: 'full' | 'refresh' = 'full') => {
      if (!slug) return
      const token = ++reqToken.current
      if (mode === 'refresh') setRefreshing(true)
      try {
        const projs = await getProjects(slug)
        setError(null)
        const results = await Promise.all(
          projs.map(async (p) => {
            const [st, list] = await Promise.all([
              getStates(slug, p.id).catch(() => [] as State[]),
              getAllIssues(slug, p.id, { sort_by: 'updated_at', order: 'desc' }).catch(() => [] as Issue[]),
            ])
            return { project: p, states: st, issues: list }
          }),
        )
        if (token !== reqToken.current) return
        setProjects(projs)
        setStatesByProject(Object.fromEntries(results.map((r) => [r.project.id, r.states])))
        setIssues(results.flatMap((r) => r.issues))
        setWatchedIds(null)
      } catch (err) {
        if (token === reqToken.current) setError(errorText(err, t('Не удалось загрузить задачи')))
      } finally {
        if (token === reqToken.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [slug, t],
  )

  useEffect(() => {
    // Deferred a tick so the load's state updates don't run inside the effect body.
    const id = setTimeout(() => void fetchAll('full'), 0)
    return () => clearTimeout(id)
  }, [fetchAll])

  // "Наблюдаю" needs the server's watcher list; load it the first time the tab opens.
  useEffect(() => {
    if (tab !== 'watching' || watchedIds || !slug) return
    let cancelled = false
    ;(async () => {
      const lists = await Promise.all(
        projects.map((p) => getAllIssues(slug, p.id, { watcher: 'me' }).catch(() => [] as Issue[])),
      )
      if (!cancelled) setWatchedIds(new Set(lists.flat().map((i) => i.id)))
    })()
    return () => {
      cancelled = true
    }
  }, [tab, watchedIds, slug, projects])

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const groupOf = useCallback(
    (i: Issue): StateGroup | undefined =>
      i.state?.group ?? statesByProject[i.project_id]?.find((s) => s.id === i.state_id)?.group,
    [statesByProject],
  )
  const isOpen = useCallback(
    (i: Issue) => {
      const g = groupOf(i)
      return g !== 'completed' && g !== 'cancelled'
    },
    [groupOf],
  )
  const controllerOf = (i: Issue) => i.controller_id ?? (i.kind === 'assignment' ? i.created_by_id : null)

  const lists = useMemo(() => {
    const mine = issues.filter((i) => i.assignees.some((a) => a.user_id === me))
    return {
      assigned: mine,
      control: issues.filter((i) => controllerOf(i) === me && i.kind === 'assignment'),
      review: issues.filter((i) => controllerOf(i) === me && groupOf(i) === 'review'),
      created: issues.filter((i) => i.created_by_id === me),
      watching: watchedIds ? issues.filter((i) => watchedIds.has(i.id)) : [],
    }
  }, [issues, me, groupOf, watchedIds])

  const kpi = useMemo(() => {
    const open = lists.assigned.filter(isOpen)
    const tone = (i: Issue) => deadlineInfo(i.due_date, groupOf(i), timeZone).tone
    return {
      open: open.length,
      overdue: open.filter((i) => tone(i) === 'overdue').length,
      today: open.filter((i) => tone(i) === 'today').length,
      unack: open.filter((i) => i.kind === 'assignment' && i.assignees.some((a) => a.user_id === me && !a.acknowledged_at)).length,
      control: lists.control.filter(isOpen).length,
      controlOverdue: lists.control.filter((i) => isOpen(i) && tone(i) === 'overdue').length,
      review: lists.review.length,
    }
  }, [lists, isOpen, groupOf, timeZone, me])

  const buckets = useMemo(() => {
    const now = openedAt
    const result: Record<Bucket, Issue[]> = { overdue: [], today: [], week: [], later: [], nodate: [], done: [] }
    for (const i of lists[tab]) {
      const g = groupOf(i)
      if (g === 'completed' || g === 'cancelled') {
        const doneAt = new Date(i.completed_at ?? i.updated_at).getTime()
        if (now - doneAt <= 14 * 86_400_000) result.done.push(i)
        continue
      }
      const info = deadlineInfo(i.due_date, g, timeZone)
      if (info.tone === 'none') result.nodate.push(i)
      else if (info.tone === 'overdue') result.overdue.push(i)
      else if (info.tone === 'today') result.today.push(i)
      else if ((info.days ?? 99) <= 7) result.week.push(i)
      else result.later.push(i)
    }
    const byDue = (a: Issue, b: Issue) =>
      (a.due_date ? Date.parse(a.due_date) : Infinity) - (b.due_date ? Date.parse(b.due_date) : Infinity)
    for (const k of Object.keys(result) as Bucket[]) result[k].sort(byDue)
    return result
  }, [lists, tab, groupOf, timeZone, openedAt])

  const selected = issues.find((i) => i.id === selectedId) ?? null
  const selectedProject = selected ? (projectById.get(selected.project_id) ?? null) : null

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={AlertCircle} title={t('Не удалось загрузить задачи')} description={error} />
  }

  const tiles: { label: string; value: number; hint?: string; icon: LucideIcon; tone: string; tab?: Tab }[] = [
    { label: t('В работе у меня'), value: kpi.open, icon: Briefcase, tone: 'text-primary', tab: 'assigned' },
    { label: t('Просрочено'), value: kpi.overdue, icon: Flame, tone: kpi.overdue ? 'text-red-600' : 'text-muted-foreground', tab: 'assigned' },
    { label: t('Срок сегодня'), value: kpi.today, icon: CalendarClock, tone: kpi.today ? 'text-orange-600' : 'text-muted-foreground', tab: 'assigned' },
    { label: t('Ждут ознакомления'), value: kpi.unack, icon: EyeOff, tone: kpi.unack ? 'text-amber-600' : 'text-muted-foreground', tab: 'assigned' },
    {
      label: t('На моём контроле'),
      value: kpi.control,
      hint: kpi.controlOverdue ? t('просрочено: {{n}}', { n: kpi.controlOverdue }) : undefined,
      icon: ShieldCheck,
      tone: 'text-primary',
      tab: 'control',
    },
    { label: t('Ждут моей проверки'), value: kpi.review, icon: Hourglass, tone: kpi.review ? 'text-violet-600' : 'text-muted-foreground', tab: 'review' },
  ]

  const current = lists[tab]
  const nonEmpty = BUCKETS.filter((b) => buckets[b.key].length > 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6">
        <Briefcase size={16} className="text-muted-foreground" />
        <h1 className="text-sm font-semibold">{t('Мои задачи')}</h1>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => fetchAll('refresh')}
          disabled={refreshing}
        >
          <RotateCw size={14} className={cn(refreshing && 'animate-spin')} />
          {t('Обновить')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-6">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {tiles.map((tile) => (
              <button
                key={tile.label}
                onClick={() => tile.tab && setTab(tile.tab)}
                className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
              >
                <tile.icon size={16} className={tile.tone} />
                <p className={cn('mt-2 text-2xl font-bold tabular-nums', tile.tone)}>{tile.value}</p>
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                {tile.hint && <p className="text-[11px] text-red-600">{tile.hint}</p>}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
                  tab === tb.key
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <tb.icon size={14} />
                {tb.label()}
                {tb.key !== 'watching' && (
                  <span className="rounded bg-muted px-1.5 text-[11px] tabular-nums">
                    {lists[tb.key].filter(isOpen).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'watching' && !watchedIds ? (
            <Skeleton className="h-40" />
          ) : current.length === 0 || nonEmpty.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t('Здесь пусто')}
              description={
                tab === 'review'
                  ? t('Нет работ, ожидающих вашей проверки.')
                  : tab === 'control'
                    ? t('Нет поручений, где вы контролёр.')
                    : t('Задачи появятся здесь, когда вам их поручат.')
              }
            />
          ) : (
            <div className="space-y-6">
              {nonEmpty.map((b) => (
                <section key={b.key}>
                  <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', b.tone)}>
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
                        project={projectById.get(issue.project_id)}
                        group={groupOf(issue)}
                        groupName={statesByProject[issue.project_id]?.find((s) => s.id === issue.state_id)?.name}
                        showController={tab === 'assigned'}
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

      {slug && selected && (
        <IssueDetailPanel
          issue={selected}
          project={selectedProject}
          slug={slug}
          projectId={selected.project_id}
          states={statesByProject[selected.project_id] ?? []}
          onOpenChange={(open) => !open && setSelectedId(null)}
          onUpdated={(updated) => setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))}
          onDeleted={(id) => {
            setIssues((prev) => prev.filter((i) => i.id !== id))
            setSelectedId(null)
          }}
        />
      )}
    </div>
  )
}

function IssueRow({
  issue,
  project,
  group,
  groupName,
  showController,
  onOpen,
}: {
  issue: Issue
  project: Project | undefined
  group: StateGroup | undefined
  groupName: string | undefined
  showController: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const meta = PRIORITY_CONFIG[issue.priority]
  const PIcon = meta.icon
  const person = showController ? issue.controller : issue.assignees[0]?.user
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
      <PIcon size={14} className={cn('shrink-0', meta.iconColor)} />
      <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
        {project ? `${project.identifier}-${issue.sequence_id}` : `#${issue.sequence_id}`}
      </span>
      {issue.kind === 'assignment' && <ShieldCheck size={13} className="shrink-0 text-primary" aria-label={t('Поручение')} />}
      <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
      {project && (
        <span className="hidden max-w-[160px] truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground lg:inline">
          {project.icon ? `${project.icon} ` : ''}
          {project.name}
        </span>
      )}
      {groupName && <span className="hidden text-[11px] text-muted-foreground md:inline">{groupName}</span>}
      <DeadlineBadge dueDate={issue.due_date} group={group} completedAt={issue.completed_at} />
      {person && (
        <span className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex" title={showController ? t('Контролёр') : t('Ответственный')}>
          <PersonAvatar person={person} size={18} />
          {shortName(person)}
        </span>
      )}
    </button>
  )
}
