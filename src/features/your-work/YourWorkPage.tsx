import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  RotateCw,
  CircleDot,
  CalendarClock,
  AlertCircle,
  Inbox,
  BellOff,
  Info,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { AvatarGroup } from '@/components/ui/avatar-group'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getProjects, type Project } from '@/api/project'
import { getStates, type State, type StateGroup } from '@/api/state'
import { getAllIssues, type Issue, type IssuePriorityValue } from '@/api/issue'
import { IssueDetailPanel } from '@/features/work-items/IssueDetailPanel'

const errMsg = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback

// Order + display metadata for the five workflow state groups. Colours are hex
// (not Tailwind classes) so they can drive inline styles on the distribution bar.
const GROUP_ORDER: StateGroup[] = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'cancelled',
]
const GROUP_META: Record<StateGroup, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: '#8b8b90' },
  unstarted: { label: 'Todo', color: '#6b7280' },
  started: { label: 'In Progress', color: '#f59e0b' },
  completed: { label: 'Done', color: '#10b981' },
  cancelled: { label: 'Cancelled', color: '#e5484d' },
}

const PRIORITY_ORDER: IssuePriorityValue[] = [
  'urgent',
  'high',
  'medium',
  'low',
  'none',
]
// Hex equivalents of the priority palette, for the distribution/workload bars.
const PRIORITY_BAR: Record<IssuePriorityValue, string> = {
  urgent: '#e5484d',
  high: '#f76808',
  medium: '#eab308',
  low: '#3f76ff',
  none: '#8b8b90',
}

// Deterministic accent per project — mirrors the sidebar so a project's tile
// colour stays consistent across the app.
const PROJECT_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
]
function projectColor(id: string) {
  let hash = 0
  for (const ch of id) hash = (hash + ch.charCodeAt(0)) % PROJECT_COLORS.length
  return PROJECT_COLORS[hash]
}

function formatDue(iso: string) {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString(undefined, opts)
}

type MainTab = 'summary' | 'assigned' | 'created' | 'subscribed'
type GroupBy = 'project' | 'state' | 'priority'

interface Segment {
  key: string
  label: string
  color: string
  count: number
  icon?: LucideIcon
}

interface IssueGroup {
  id: string
  label: string
  kind: GroupBy
  color: string
  identifier?: string
  icon?: LucideIcon
  items: Issue[]
}

interface Summary {
  total: number
  inProgress: number
  completed: number
  overdue: number
}

export function YourWorkPage() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const workspaceName = useWorkspaceStore((s) => s.workspace?.name)
  const user = useAuthStore((s) => s.user)
  const userId = user?.id

  const [projects, setProjects] = useState<Project[]>([])
  const [statesByProject, setStatesByProject] = useState<
    Record<string, State[]>
  >({})
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<MainTab>('summary')
  const [groupBy, setGroupBy] = useState<GroupBy>('state')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Guards against out-of-order responses and throttles the focus refetch.
  const reqToken = useRef(0)
  const lastLoad = useRef(0)

  // Issues live only under a project on the backend — there is no workspace-wide
  // "my issues" endpoint — so we fan out across every project and filter to the
  // current user client-side. `mode` controls the loading UI: 'full' shows the
  // skeleton, 'refresh' spins the button, 'silent' updates in the background.
  const fetchAll = useCallback(
    async (mode: 'full' | 'refresh' | 'silent' = 'full') => {
      if (!slug) return
      const token = ++reqToken.current
      if (mode === 'full') setLoading(true)
      if (mode === 'refresh') setRefreshing(true)
      if (mode !== 'silent') setError(null)
      try {
        const projs = await getProjects(slug)
        const results = await Promise.all(
          projs.map(async (p) => {
            const [st, page] = await Promise.all([
              getStates(slug, p.id).catch(() => [] as State[]),
              getAllIssues(slug, p.id, {
                sort_by: 'updated_at',
                order: 'desc',
              }).catch(() => [] as Issue[]),
            ])
            return { project: p, states: st, issues: page }
          }),
        )
        if (token !== reqToken.current) return
        setProjects(projs)
        setStatesByProject(
          Object.fromEntries(results.map((r) => [r.project.id, r.states])),
        )
        setIssues(results.flatMap((r) => r.issues))
      } catch (err) {
        if (token === reqToken.current && mode !== 'silent')
          setError(errMsg(err, 'Failed to load your work'))
      } finally {
        if (token === reqToken.current) {
          if (mode === 'full') setLoading(false)
          if (mode === 'refresh') setRefreshing(false)
        }
        lastLoad.current = Date.now()
      }
    },
    [slug],
  )

  useEffect(() => {
    // Wrapped so the synchronous setLoading inside fetchAll isn't called
    // directly in the effect body (react-hooks/set-state-in-effect).
    void (async () => {
      await fetchAll('full')
    })()
  }, [fetchAll])

  // Refetch quietly when the user comes back to the tab, so a work item they
  // just completed on the board shows up here without a manual refresh.
  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastLoad.current > 8000
      )
        fetchAll('silent')
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [fetchAll])

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects],
  )
  const statesById = useMemo(() => {
    const m: Record<string, State> = {}
    for (const arr of Object.values(statesByProject))
      for (const s of arr) m[s.id] = s
    return m
  }, [statesByProject])

  const groupOf = (i: Issue): StateGroup | undefined =>
    statesById[i.state_id]?.group
  const isOpenIssue = (i: Issue) => {
    const g = groupOf(i)
    return g !== 'completed' && g !== 'cancelled'
  }
  const startOfToday = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const isOverdue = (i: Issue) =>
    !!i.due_date && new Date(i.due_date) < startOfToday && isOpenIssue(i)

  // The two source sets, plus their union (deduped) for the overview charts.
  const assigned = useMemo(
    () =>
      userId
        ? issues.filter((i) => i.assignees.some((a) => a.user_id === userId))
        : [],
    [issues, userId],
  )
  const created = useMemo(
    () => (userId ? issues.filter((i) => i.created_by_id === userId) : []),
    [issues, userId],
  )
  const mine = useMemo(() => {
    const map = new Map<string, Issue>()
    for (const i of assigned) map.set(i.id, i)
    for (const i of created) map.set(i.id, i)
    return [...map.values()]
  }, [assigned, created])

  // Cheap enough to recompute each render — a few filters over small arrays.
  const summarize = (list: Issue[]): Summary => ({
    total: list.length,
    inProgress: list.filter((i) => groupOf(i) === 'started').length,
    completed: list.filter((i) => groupOf(i) === 'completed').length,
    overdue: list.filter(isOverdue).length,
  })
  const assignedStats = summarize(assigned)
  const createdStats = summarize(created)

  const byState: Segment[] = useMemo(
    () =>
      GROUP_ORDER.map((g) => ({
        key: g,
        label: GROUP_META[g].label,
        color: GROUP_META[g].color,
        count: mine.filter((i) => groupOf(i) === g).length,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, statesById],
  )
  const byPriority: Segment[] = useMemo(
    () =>
      PRIORITY_ORDER.map((p) => ({
        key: p,
        label: PRIORITY_CONFIG[p].label,
        color: PRIORITY_BAR[p],
        icon: PRIORITY_CONFIG[p].icon,
        count: mine.filter((i) => i.priority === p).length,
      })),
    [mine],
  )

  // Grouped list for the active tab (Assigned / Created only).
  const groups: IssueGroup[] = useMemo(() => {
    const list =
      tab === 'assigned' ? assigned : tab === 'created' ? created : []
    if (groupBy === 'project') {
      return projects
        .map((p) => ({
          id: p.id,
          label: p.name,
          kind: 'project' as const,
          color: projectColor(p.id),
          identifier: p.identifier,
          items: list.filter((i) => i.project_id === p.id),
        }))
        .filter((g) => g.items.length > 0)
    }
    if (groupBy === 'state') {
      return GROUP_ORDER.map((g) => ({
        id: g,
        label: GROUP_META[g].label,
        kind: 'state' as const,
        color: GROUP_META[g].color,
        items: list.filter((i) => groupOf(i) === g),
      })).filter((g) => g.items.length > 0)
    }
    return PRIORITY_ORDER.map((p) => ({
      id: p,
      label: PRIORITY_CONFIG[p].label,
      kind: 'priority' as const,
      color: PRIORITY_BAR[p],
      icon: PRIORITY_CONFIG[p].icon,
      items: list.filter((i) => i.priority === p),
    })).filter((g) => g.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, assigned, created, groupBy, projects, statesById])

  const selectedIssue = issues.find((i) => i.id === selectedId) ?? null

  const initial = user?.display_name?.[0]?.toUpperCase() ?? 'U'
  const tabs: { value: MainTab; label: string; count?: number }[] = [
    { value: 'summary', label: 'Summary' },
    { value: 'assigned', label: 'Assigned', count: assigned.length },
    { value: 'created', label: 'Created', count: created.length },
    { value: 'subscribed', label: 'Subscribed' },
  ]

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6 text-sm font-medium">
        <Briefcase size={16} />
        Your Work
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5"
          onClick={() => fetchAll('refresh')}
          disabled={loading || refreshing}
        >
          <RotateCw
            size={14}
            className={cn((loading || refreshing) && 'animate-spin')}
          />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <Avatar className="size-11">
              <AvatarFallback className="bg-purple-600 text-base font-semibold text-white">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">
                {user?.display_name ?? 'Your Work'}
              </h1>
              <p className="text-sm text-muted-foreground">
                Work items assigned to you or created by you
                {workspaceName ? ` in ${workspaceName}` : ''}.
              </p>
            </div>
          </div>

          {/* Tabs */}
          <TabBar tabs={tabs} value={tab} onChange={setTab} />

          {loading ? (
            <LoadingState />
          ) : error ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load your work"
              description={error}
              action={{ label: 'Try again', onClick: () => fetchAll('full') }}
            />
          ) : projects.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No projects yet"
              description="Once you're part of a project and get assigned work items, they'll appear here."
            />
          ) : tab === 'summary' ? (
            <SummaryTab
              assignedStats={assignedStats}
              createdStats={createdStats}
              byPriority={byPriority}
              byState={byState}
              total={mine.length}
            />
          ) : tab === 'subscribed' ? (
            <div className="pt-6">
              <EmptyState
                icon={BellOff}
                title="Subscriptions aren't available yet"
                description="Following work items you're not assigned to isn't supported by the backend yet. For now, Assigned and Created cover your work."
              />
            </div>
          ) : (
            <div className="pt-4">
              {/* Group-by control */}
              <div className="mb-3 flex items-center justify-end gap-2">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Group by
                </span>
                <Segmented
                  value={groupBy}
                  onChange={(v) => setGroupBy(v as GroupBy)}
                  options={[
                    { value: 'state', label: 'State' },
                    { value: 'project', label: 'Project' },
                    { value: 'priority', label: 'Priority' },
                  ]}
                />
              </div>

              {groups.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title={
                    tab === 'assigned'
                      ? 'Nothing assigned to you'
                      : "You haven't created any work items"
                  }
                  description={
                    tab === 'assigned'
                      ? "Ask a teammate to assign you a work item, or open one and add yourself as an assignee — it'll show up here."
                      : 'Work items you create across all projects will show up here, including the ones you complete.'
                  }
                />
              ) : (
                groups.map((g) => (
                  <section key={g.id} className="mb-5">
                    <header className="mb-1.5 flex items-center gap-2 px-1">
                      <GroupTile group={g} />
                      <span className="text-sm font-medium text-foreground">
                        {g.label}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {g.items.length}
                      </span>
                    </header>
                    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {g.items.map((issue) => (
                        <IssueRow
                          key={issue.id}
                          issue={issue}
                          project={projectsById[issue.project_id] ?? null}
                          state={statesById[issue.state_id]}
                          overdue={isOverdue(issue)}
                          onOpen={() => setSelectedId(issue.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reuse the full work-item detail panel, scoped to the clicked issue's
          own project so state/label/assignee edits hit the right endpoints. */}
      {slug && (
        <IssueDetailPanel
          issue={selectedIssue}
          project={
            selectedIssue
              ? (projectsById[selectedIssue.project_id] ?? null)
              : null
          }
          slug={slug}
          projectId={selectedIssue?.project_id ?? ''}
          states={
            selectedIssue
              ? (statesByProject[selectedIssue.project_id] ?? [])
              : []
          }
          onOpenChange={(open) => !open && setSelectedId(null)}
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

function SummaryTab({
  assignedStats,
  createdStats,
  byPriority,
  byState,
  total,
}: {
  assignedStats: Summary
  createdStats: Summary
  byPriority: Segment[]
  byState: Segment[]
  total: number
}) {
  return (
    <div className="space-y-4 pt-6">
      {/* How this page works */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info size={16} className="mt-0.5 shrink-0 text-primary" />
        <p>
          A work item appears here when it&apos;s{' '}
          <span className="font-medium text-foreground">assigned to you</span>{' '}
          or <span className="font-medium text-foreground">created by you</span>
          . <span className="font-medium text-foreground">Completed</span> means
          it sits in a Done state. Creating a work item does not assign it to
          you automatically — add yourself as an assignee if you want it counted
          under Assigned.
        </p>
      </div>

      {/* Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <OverviewPanel
          icon={CircleDot}
          tone="text-primary"
          title="Assigned to you"
          stats={assignedStats}
          showOverdue
        />
        <OverviewPanel
          icon={Briefcase}
          tone="text-violet-500"
          title="Created by you"
          stats={createdStats}
        />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No work yet"
          description="When you're assigned a work item or create one, its breakdown by priority and state will show up here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Workload by priority">
            <PriorityWorkload segments={byPriority} />
          </Panel>
          <Panel title="Issues by state">
            <DistributionBar segments={byState} total={total} />
          </Panel>
        </div>
      )}
    </div>
  )
}

function OverviewPanel({
  icon: Icon,
  tone,
  title,
  stats,
  showOverdue = false,
}: {
  icon: LucideIcon
  tone: string
  title: string
  stats: Summary
  showOverdue?: boolean
}) {
  const sub = [
    { label: 'In progress', value: stats.inProgress, color: '#f59e0b' },
    { label: 'Completed', value: stats.completed, color: '#10b981' },
    ...(showOverdue
      ? [{ label: 'Overdue', value: stats.overdue, color: '#e5484d' }]
      : []),
  ]
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={15} className={tone} />
        <span className="text-xs font-medium">{title}</span>
      </div>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
        {stats.total}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {sub.map((s) => (
          <span
            key={s.label}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
            <span className="font-semibold tabular-nums text-foreground">
              {s.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  )
}

// Plane-style "Workload": one row per priority with a bar scaled to the busiest
// priority, so the relative spread of your work is legible at a glance.
function PriorityWorkload({ segments }: { segments: Segment[] }) {
  const max = Math.max(1, ...segments.map((s) => s.count))
  return (
    <div className="space-y-2.5">
      {segments.map((s) => {
        const Icon = s.icon
        return (
          <div key={s.key} className="flex items-center gap-3">
            <div className="flex w-24 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              {Icon && (
                <Icon
                  size={13}
                  style={{ color: s.color }}
                  className="shrink-0"
                />
              )}
              {s.label}
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(s.count / max) * 100}%`,
                  background: s.color,
                }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
              {s.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function DistributionBar({
  segments,
  total,
}: {
  segments: Segment[]
  total: number
}) {
  const active = segments.filter((s) => s.count > 0)
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          active.map((s) => (
            <div
              key={s.key}
              style={{
                width: `${(s.count / total) * 100}%`,
                background: s.color,
              }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupTile({ group }: { group: IssueGroup }) {
  if (group.kind === 'project')
    return (
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
        style={{ background: group.color }}
      >
        {group.identifier?.[0] ?? '?'}
      </span>
    )
  if (group.kind === 'priority' && group.icon) {
    const Icon = group.icon
    return (
      <Icon size={15} className="shrink-0" style={{ color: group.color }} />
    )
  }
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ background: group.color }}
    />
  )
}

function IssueRow({
  issue,
  project,
  state,
  overdue,
  onOpen,
}: {
  issue: Issue
  project: Project | null
  state: State | undefined
  overdue: boolean
  onOpen: () => void
}) {
  const meta = PRIORITY_CONFIG[issue.priority]
  const PIcon = meta.icon
  const identifier = project
    ? `${project.identifier}-${issue.sequence_id}`
    : `#${issue.sequence_id}`
  const assignees = issue.assignees.map((a) => ({
    src: a.user?.avatar_url ?? undefined,
    name: a.user?.display_name ?? '?',
  }))

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <PIcon size={15} className={cn('shrink-0', meta.iconColor)} />
      <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">
        {identifier}
      </span>
      <span className="flex-1 truncate text-sm text-foreground">
        {issue.title}
      </span>

      {state && (
        <span
          className="hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs sm:inline-flex"
          style={{ background: `${state.color}1a`, color: state.color }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: state.color }}
          />
          {state.name}
        </span>
      )}

      {issue.due_date && (
        <span
          className={cn(
            'hidden shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs sm:inline-flex',
            overdue
              ? 'bg-destructive/10 text-destructive'
              : 'text-muted-foreground',
          )}
        >
          <CalendarClock size={12} />
          {formatDue(issue.due_date)}
        </span>
      )}

      {assignees.length > 0 && <AvatarGroup avatars={assignees} max={3} />}
    </button>
  )
}

function TabBar({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: MainTab; label: string; count?: number }[]
  value: MainTab
  onChange: (value: MainTab) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.value
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
          {typeof t.count === 'number' && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] tabular-nums',
                value === t.value
                  ? 'bg-nav-active-bg text-primary'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-3 py-1 text-sm font-medium transition-colors',
            value === o.value
              ? 'bg-nav-active-bg text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4 pt-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </div>
  )
}
