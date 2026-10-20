import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, List, AlertCircle, Plus, Send, CalendarDays, GanttChart } from 'lucide-react'
import { toast } from 'sonner'
import { toastIssueTrashed } from '@/features/trash/trashToast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { useReadOnly } from '@/stores/summaryStore'
import { ApiError } from '@/api/client'
import { errorText } from '@/lib/errorMessages'
import { isOwnEcho, useRealtime } from '@/lib/realtime'
import { shortName } from '@/lib/people'
import { getProject, type Project } from '@/api/project'
import { getStates, type State } from '@/api/state'
import {
  getAllIssues,
  getIssue,
  createIssue,
  updateIssue,
  deleteIssue,
  addAssignee,
  removeAssignee,
  type Issue,
  type IssuePriorityValue,
} from '@/api/issue'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { getLabels, type Label } from '@/api/label'
import { getProjectRelations, type ProjectRelation } from '@/api/relation'
import { dateInputToIso, longDate } from '@/lib/dates'
import { BoardView } from './BoardView'
import { ListView } from './ListView'
import { BulkBar } from './BulkBar'
import { CalendarView } from './views/CalendarView'
import { TimelineView } from './views/TimelineView'
import { CreateIssueDialog } from './CreateIssueDialog'
import { DistributeDialog } from './DistributeDialog'
import { IssueDetailPanel } from './IssueDetailPanel'
import { SubmitReviewDialog } from './control/ControlDialogs'
import { FilterPanel } from '@/features/views/FilterPanel'
import { ScopeBanner } from '@/features/cycles/ScopeBanner'
import { joinScope, useProjectScopes, type Scope, type ScopeKind } from '@/features/cycles/scopes'
import { ViewsMenu } from '@/features/views/ViewsMenu'
import {
  BOARD_KEYS,
  QUICK_FILTERS,
  boardFilterValues,
  describeFilters,
  matchesBoard,
  readBoardFilters,
  type BoardFilters,
} from '@/features/views/filters'

const errMsg = (err: unknown, fallback: string) => errorText(err, fallback)

// How the project's work is shown (7.F4). Kept in the URL (?view=calendar), so a
// link — or a saved view later — opens the same picture; the last one is remembered.
type ViewMode = 'board' | 'list' | 'calendar' | 'timeline'
const VIEW_MODES: ViewMode[] = ['board', 'list', 'calendar', 'timeline']
const VIEW_KEY = 'work-items:view'

function rememberedView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY) as ViewMode | null
    return v && VIEW_MODES.includes(v) ? v : 'board'
  } catch {
    return 'board'
  }
}


export function WorkItemsPage() {
  const { t } = useTranslation()
  const { id: projectId } = useParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug
  const me = useAuthStore((s) => s.user?.id)
  // A guest only reads (12.B4): no create, distribute or drag-and-drop.
  const readOnly = useReadOnly()
  const timeZone = workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  // Hand-in dialog opened from a drag to "На проверке" / "Готово".
  const [reviewFor, setReviewFor] = useState<{ issue: Issue; note?: string } | null>(null)

  const [project, setProject] = useState<Project | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  // «блокирует» arrows of the timeline, loaded when it is first shown.
  const [relations, setRelations] = useState<ProjectRelation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [distributeOpen, setDistributeOpen] = useState(false)
  // Bulk selection in the list (6.F6); the last clicked row anchors a Shift range.
  const [selection, setSelection] = useState<Set<string>>(() => new Set())
  const lastSelected = useRef<string | null>(null)
  // The open issue lives in the URL (?issue=<id>) so notifications, the home page
  // and deep links can open a specific work item.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('issue')
  const urlView = searchParams.get('view') as ViewMode | null
  const view: ViewMode = urlView && VIEW_MODES.includes(urlView) ? urlView : rememberedView()
  // Quick filters (Ф5) and the filter panel (7.F5) live in the URL too: a link or
  // a saved view opens the same picture.
  const filters = useMemo(() => readBoardFilters(searchParams), [searchParams])
  // Read from the address itself, not from the last render: two quick clicks
  // must not undo each other while the first navigation is still rendering.
  function updateFilters(update: (current: BoardFilters) => Partial<BoardFilters>) {
    const params = new URLSearchParams(window.location.search)
    const current = readBoardFilters(params)
    const next = { ...current, ...update(current) }
    for (const key of BOARD_KEYS) params.delete(key)
    for (const [key, value] of Object.entries(boardFilterValues(next))) params.set(key, value)
    setSearchParams(params, { replace: true })
  }

  function setView(mode: ViewMode) {
    try {
      localStorage.setItem(VIEW_KEY, mode)
    } catch {
      // Storage unavailable — the URL still carries the view.
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('view', mode)
        return next
      },
      { replace: true },
    )
  }
  const setSelectedId = (id: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('issue', id)
        else next.delete('issue')
        return next
      },
      { replace: true },
    )

  // `?create=1` (the command palette's «Новое поручение…», 7.F3) opens the
  // create dialog once the project's states are loaded; closing it drops the flag.
  const wantsCreate = searchParams.get('create') === '1' && !readOnly
  const createDialogOpen =
    createOpen || (wantsCreate && !loading && states.length > 0)
  function setCreateDialogOpen(open: boolean) {
    setCreateOpen(open)
    if (!open && (searchParams.has('create') || searchParams.has('draft'))) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('create')
          next.delete('draft')
          return next
        },
        { replace: true },
      )
    }
  }

  // The panel reads its issue straight from the board's list, so edits made
  // anywhere stay in sync with a single source of truth.
  const selectedIssue = issues.find((i) => i.id === selectedId) ?? null

  // Live board (8.F1): changes made by others — in another browser, in Telegram,
  // by the reminder scheduler — arrive over SSE; the touched issue is re-read
  // and put in place. `resync` (missed events) reloads the whole board.
  const [reloadTick, setReloadTick] = useState(0)
  // Этапы and модули of the project (4.F3, 4.F4): the banner, bulk bar and chips.
  const scopes = useProjectScopes(slug, projectId, reloadTick)
  const refetchTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const timers = refetchTimers.current
    return () => timers.forEach((timer) => clearTimeout(timer))
  }, [])

  function upsert(issue: Issue) {
    setIssues((prev) => {
      const next = prev.some((i) => i.id === issue.id)
        ? prev.map((i) => (i.id === issue.id ? issue : i))
        : [...prev, issue]
      return [...next].sort((a, b) => a.sort_order - b.sort_order)
    })
  }

  function refetchSoon(issueId: string) {
    const timers = refetchTimers.current
    clearTimeout(timers.get(issueId))
    timers.set(
      issueId,
      setTimeout(async () => {
        timers.delete(issueId)
        if (!slug || !projectId) return
        try {
          upsert(await getIssue(slug, projectId, issueId))
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setIssues((prev) => prev.filter((i) => i.id !== issueId))
          }
        }
      }, 250),
    )
  }

  useRealtime((message) => {
    if (message.type === 'resync') {
      setReloadTick((n) => n + 1)
      return
    }
    const id = message.issue_id
    if (message.project_id !== projectId || !id || message.type.startsWith('comment.')) return
    if (isOwnEcho(message)) return
    const byOther = message.actor && message.actor.id !== me
    if (message.type === 'issue.deleted') {
      setIssues((prev) => prev.filter((i) => i.id !== id))
      if (id === selectedId) {
        if (byOther) {
          toast.info(t('Задачу удалил(а) {{name}}', { name: shortName(message.actor) }))
        }
        setSelectedId(null)
      }
      return
    }
    refetchSoon(id)
    if (id === selectedId && byOther) {
      // One toast per issue at a time: a burst of edits does not stack up.
      toast.info(t('Задачу изменил(а) {{name}}', { name: shortName(message.actor) }), {
        id: `changed-${id}`,
      })
    }
  })

  useEffect(() => {
    if (!slug || !projectId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [p, st, all, mem, lab] = await Promise.all([
          getProject(slug, projectId),
          getStates(slug, projectId),
          getAllIssues(slug, projectId, { sort_by: 'sort_order', order: 'asc' }),
          getWorkspaceMembers(slug).catch(() => []),
          getLabels(slug, projectId).catch(() => []),
        ])
        if (cancelled) return
        setProject(p)
        setStates(st)
        setIssues(all)
        setMembers(mem)
        setLabels(lab)
      } catch (err) {
        if (!cancelled) setError(errMsg(err, t('Не удалось загрузить задачи')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, projectId, t, reloadTick])

  useEffect(() => {
    if (!slug || !projectId || view !== 'timeline') return
    let cancelled = false
    getProjectRelations(slug, projectId, 'blocks')
      .then((res) => !cancelled && setRelations(res.data))
      .catch(() => !cancelled && setRelations([]))
    return () => {
      cancelled = true
    }
  }, [slug, projectId, view, reloadTick])

  async function handleCreate(stateId: string, title: string) {
    if (!slug || !projectId) return
    try {
      const issue = await createIssue(slug, projectId, {
        title,
        state_id: stateId,
        priority: 'none',
      })
      setIssues((prev) => [...prev, issue])
    } catch (err) {
      toast.error(errMsg(err, t('Не удалось создать задачу')))
    }
  }

  const myRole = members.find((m) => m.user_id === me)?.role
  /** Controller (or author when there is none) or a workspace admin decides. */
  function isReviewer(issue: Issue) {
    if (myRole === 'owner' || myRole === 'admin') return true
    return (issue.controller_id ?? issue.created_by_id) === me
  }

  async function handleMove(issueId: string, toStateId: string) {
    if (!slug || !projectId) return
    const target = issues.find((i) => i.id === issueId)
    if (!target || target.state_id === toStateId) return
    const toGroup = states.find((s) => s.id === toStateId)?.group
    const fromGroup = states.find((s) => s.id === target.state_id)?.group

    // Execution control (Ф5): a drop on "На проверке" is a hand-in with a report;
    // an assignment can only reach "Готово" through its controller.
    if (toGroup === 'review' && fromGroup !== 'review' && target.kind === 'assignment') {
      setReviewFor({ issue: target })
      return
    }
    if (toGroup === 'completed' && target.requires_review && !isReviewer(target)) {
      setReviewFor({
        issue: target,
        note: t('Поручение закрывает контролёр. Отправьте результат на проверку.'),
      })
      return
    }

    const snapshot = issues
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, state_id: toStateId } : i)),
    )
    try {
      const updated = await updateIssue(slug, projectId, issueId, { state_id: toStateId })
      setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    } catch (err) {
      setIssues(snapshot)
      if (err instanceof ApiError && err.code === 'REVIEW_REQUIRED') {
        setReviewFor({ issue: target, note: err.message })
        return
      }
      toast.error(errMsg(err, t('Не удалось переместить задачу')))
    }
  }

  const filtered =
    filters.quick !== 'all' || Object.keys(boardFilterValues(filters)).length > 0
  const visibleIssues = useMemo(() => {
    if (!filtered) return issues
    return issues.filter((i) =>
      matchesBoard(i, filters, {
        me,
        group: i.state?.group ?? states.find((s) => s.id === i.state_id)?.group,
        timeZone,
      }),
    )
  }, [issues, filtered, filters, me, states, timeZone])

  // ─── Bulk selection (6.F6): only rows on screen count ───
  const listOrder = useMemo(
    () => states.flatMap((s) => visibleIssues.filter((i) => i.state_id === s.id)).map((i) => i.id),
    [states, visibleIssues],
  )
  const selectedIds = useMemo(
    () => (view === 'list' ? listOrder.filter((id) => selection.has(id)) : []),
    [view, listOrder, selection],
  )
  function selectIssue(issue: Issue, shift: boolean) {
    setSelection((prev) => {
      const next = new Set(prev)
      const anchor = lastSelected.current
      if (shift && anchor && anchor !== issue.id && listOrder.includes(anchor)) {
        const [a, b] = [listOrder.indexOf(anchor), listOrder.indexOf(issue.id)].sort((x, y) => x - y)
        for (const id of listOrder.slice(a, b + 1)) next.add(id)
      } else if (next.has(issue.id)) next.delete(issue.id)
      else next.add(issue.id)
      return next
    })
    lastSelected.current = issue.id
  }
  function selectGroup(group: Issue[], select: boolean) {
    setSelection((prev) => {
      const next = new Set(prev)
      for (const i of group) {
        if (select) next.add(i.id)
        else next.delete(i.id)
      }
      return next
    })
  }
  async function afterBulk(result: { updated: string[]; failed: { issue_id: string }[] }) {
    // What failed stays selected, so it can be handled separately.
    setSelection(new Set(result.failed.map((f) => f.issue_id)))
    if (!slug || !projectId || result.updated.length === 0) return
    const all = await getAllIssues(slug, projectId, { sort_by: 'sort_order', order: 'asc' }).catch(() => null)
    if (all) setIssues(all)
  }

  // What a saved view of this page would hold (7.F5).
  const viewFilters = boardFilterValues(filters)
  const filterChips = describeFilters(viewFilters, {
    person: (id) => shortName(members.find((m) => m.user_id === id)?.user),
    label: (id) => labels.find((l) => l.id === id)?.name,
    cycle: (id) => scopes.cycles?.find((c) => c.id === id)?.name,
    module: (id) => scopes.modules?.find((m) => m.id === id)?.name,
  })

  // Issues just added to a cycle or module from the banner: the server's echo of
  // our own write is skipped, so the list is patched the way the server did it.
  function joinIssues(kind: ScopeKind, scopeId: string, ids: string[]) {
    const added = new Set(ids)
    setIssues((prev) => prev.map((i) => (added.has(i.id) ? joinScope(i, kind, scopeId) : i)))
  }

  function scopeBanner(kind: ScopeKind, scopeId: string | null, list: Scope[] | null) {
    if (!scopeId || !slug || !projectId) return null
    return (
      <ScopeBanner
        kind={kind}
        id={scopeId}
        // undefined while the list loads; null — no such cycle / module any more.
        scope={list ? (list.find((x) => x.id === scopeId) ?? null) : undefined}
        slug={slug}
        projectId={projectId}
        identifier={project?.identifier ?? ''}
        issues={issues}
        states={states}
        cycles={scopes.cycles ?? []}
        members={members}
        readOnly={readOnly}
        onClear={() => updateFilters(() => ({ [kind]: null }))}
        onAdded={(ids) => joinIssues(kind, scopeId, ids)}
        onSaved={(item) => scopes.save(kind, item)}
      />
    )
  }

  /** A task's deadline is the assignee's to plan; an assignment's — its controller's (5.B5). */
  function canMoveDeadline(issue: Issue) {
    return !readOnly && (issue.kind !== 'assignment' || isReviewer(issue))
  }

  // Calendar drop (7.F4): the deadline moves to that day, back on refusal.
  async function handleDueChange(issue: Issue, day: string) {
    if (!slug || !projectId) return
    const due = dateInputToIso(day)
    const snapshot = issues
    setIssues((prev) => prev.map((i) => (i.id === issue.id ? { ...i, due_date: due } : i)))
    try {
      const updated = await updateIssue(slug, projectId, issue.id, { due_date: due })
      setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
      const date = longDate(due!)
      toast.success(
        issue.due_date
          ? t('Срок перенесён на {{date}}', { date })
          : t('Срок назначен: {{date}}', { date }),
        { id: `due-${issue.id}` },
      )
    } catch (err) {
      setIssues(snapshot)
      toast.error(errMsg(err, t('Не удалось изменить срок')))
    }
  }

  async function handlePriority(issue: Issue, priority: IssuePriorityValue) {
    if (!slug || !projectId) return
    const snapshot = issues
    setIssues((prev) =>
      prev.map((i) => (i.id === issue.id ? { ...i, priority } : i)),
    )
    try {
      await updateIssue(slug, projectId, issue.id, { priority })
    } catch (err) {
      setIssues(snapshot)
      toast.error(errMsg(err, t('Не удалось изменить приоритет')))
    }
  }

  async function handleDelete(issue: Issue) {
    if (!slug || !projectId) return
    const snapshot = issues
    setIssues((prev) => prev.filter((i) => i.id !== issue.id))
    try {
      await deleteIssue(slug, projectId, issue.id)
      toastIssueTrashed(slug, issue.id)
    } catch (err) {
      setIssues(snapshot)
      toast.error(errMsg(err, t('Не удалось удалить задачу')))
    }
  }

  async function handleAssigneeToggle(
    issue: Issue,
    member: WorkspaceMember,
    alreadyAssigned: boolean,
  ) {
    if (!slug || !projectId) return
    const snapshot = issues
    // Optimistically reflect the change; the API returns the authoritative issue.
    const nextAssignees = alreadyAssigned
      ? issue.assignees.filter((a) => a.user_id !== member.user_id)
      : [...issue.assignees, { user_id: member.user_id, user: member.user }]
    setIssues((prev) =>
      prev.map((i) =>
        i.id === issue.id ? { ...i, assignees: nextAssignees } : i,
      ),
    )
    try {
      const updated = alreadyAssigned
        ? await removeAssignee(slug, projectId, issue.id, member.user_id)
        : await addAssignee(slug, projectId, issue.id, member.user_id)
      setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    } catch (err) {
      setIssues(snapshot)
      toast.error(errMsg(err, t('Не удалось изменить исполнителей')))
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* View bar */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-1.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm"
          style={{ backgroundColor: project?.color ? `${project.color}26` : undefined }}
        >
          {project?.icon ?? '📁'}
        </div>
        <span className="truncate text-sm font-semibold text-foreground">
          {project?.name ?? t('Задачи')}
        </span>
        {project && (
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            {project.identifier}
          </span>
        )}
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {issues.length}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* View switcher */}
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {(
              [
                { mode: 'board', icon: LayoutGrid, label: t('Доска') },
                { mode: 'list', icon: List, label: t('Список') },
                { mode: 'calendar', icon: CalendarDays, label: t('Календарь') },
                { mode: 'timeline', icon: GanttChart, label: t('Таймлайн') },
              ] as const
            ).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                title={label}
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
                  view === mode
                    ? 'bg-nav-active-bg text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon size={14} />
                <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Filters and saved views (7.F5) */}
          {!loading && !error && (
            <FilterPanel filters={filters} onChange={updateFilters} members={members} labels={labels} />
          )}
          {slug && projectId && (
            <ViewsMenu
              slug={slug}
              projectId={projectId}
              filters={viewFilters}
              mode={view}
              chips={filterChips}
            />
          )}

          {/* One assignment for several departments (6.F1) */}
          {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDistributeOpen(true)}
            disabled={loading || !!error || states.length === 0}
            title={t('Разослать подразделениям')}
          >
            <Send size={15} />
            <span className="hidden sm:inline">{t('Разослать')}</span>
          </Button>
          )}

          {/* Add work item */}
          {!readOnly && (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={loading || !!error || states.length === 0}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">{t('Создать')}</span>
          </Button>
          )}
        </div>
      </div>

      {/* The board of one cycle / module (4.F3, 4.F4) */}
      {!loading && !error && (
        <>
          {scopeBanner('cycle', filters.cycle, scopes.cycles)}
          {scopeBanner('module', filters.module, scopes.modules)}
        </>
      )}

      {/* Quick filters */}
      {!loading && !error && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4 py-1.5">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => updateFilters(() => ({ quick: f.key }))}
              className={cn(
                'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                filters.quick === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {f.label()}
            </button>
          ))}
          {filtered && (
            <span className="ml-2 text-xs text-muted-foreground">
              {t('Показано: {{n}} из {{total}}', { n: visibleIssues.length, total: issues.length })}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div className={cn('relative flex-1 overflow-hidden', selectedIds.length > 0 && 'pb-14')}>
        {loading ? (
          <div className="flex gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-72 shrink-0 space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertCircle}
            title={t('Не удалось загрузить задачи')}
            description={error}
          />
        ) : states.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title={t('Нет состояний')}
            description={t('В проекте нет состояний, по которым можно распределить задачи.')}
          />
        ) : view === 'board' ? (
          <BoardView
            states={states}
            issues={visibleIssues}
            project={project}
            members={members}
            onCreate={handleCreate}
            onMove={handleMove}
            onOpen={(issue) => setSelectedId(issue.id)}
            onPriorityChange={handlePriority}
            onAssigneeToggle={handleAssigneeToggle}
            onDelete={handleDelete}
            readOnly={readOnly}
          />
        ) : view === 'calendar' ? (
          <CalendarView
            issues={visibleIssues}
            states={states}
            project={project}
            timeZone={timeZone}
            canMove={canMoveDeadline}
            onDueChange={handleDueChange}
            onOpen={(issue) => setSelectedId(issue.id)}
          />
        ) : view === 'timeline' ? (
          <TimelineView
            issues={visibleIssues}
            states={states}
            project={project}
            timeZone={timeZone}
            relations={relations}
            onOpen={(issue) => setSelectedId(issue.id)}
          />
        ) : (
          <ListView
            states={states}
            issues={visibleIssues}
            project={project}
            onCreate={handleCreate}
            onOpen={(issue) => setSelectedId(issue.id)}
            onDelete={handleDelete}
            readOnly={readOnly}
            selected={selection}
            onSelect={selectIssue}
            onSelectGroup={selectGroup}
          />
        )}
        {!readOnly && selectedIds.length > 0 && slug && projectId && (
          <BulkBar
            slug={slug}
            projectId={projectId}
            selected={selectedIds}
            states={states}
            members={members}
            labels={labels}
            cycles={scopes.cycles ?? []}
            modules={scopes.modules ?? []}
            onDone={afterBulk}
            onClear={() => setSelection(new Set())}
          />
        )}
      </div>

      {slug && projectId && (
        <CreateIssueDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          slug={slug}
          projectId={projectId}
          states={states}
          draftId={wantsCreate ? searchParams.get('draft') : null}
          onCreated={(issue) => setIssues((prev) => [...prev, issue])}
        />
      )}

      {slug && projectId && (
        <DistributeDialog
          open={distributeOpen}
          onOpenChange={setDistributeOpen}
          slug={slug}
          projectId={projectId}
          onCreated={async (parent) => {
            // The children are new rows on the board too.
            const all = await getAllIssues(slug, projectId, { sort_by: 'sort_order', order: 'asc' }).catch(
              () => null,
            )
            setIssues((prev) => all ?? [...prev, parent])
            setSelectedId(parent.id)
          }}
        />
      )}

      {slug && projectId && (
        <IssueDetailPanel
          issue={selectedIssue}
          project={project}
          slug={slug}
          projectId={projectId}
          states={states}
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
          onOpenIssue={setSelectedId}
        />
      )}

      {slug && projectId && reviewFor && (
        <SubmitReviewDialog
          open
          onOpenChange={(v) => !v && setReviewFor(null)}
          slug={slug}
          projectId={projectId}
          issue={reviewFor.issue}
          note={reviewFor.note}
          onDone={(updated) =>
            setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          }
        />
      )}
    </div>
  )
}
