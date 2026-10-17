import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, List, AlertCircle, Plus, Send } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/api/client'
import { errorText } from '@/lib/errorMessages'
import { deadlineInfo } from '@/lib/deadline'
import { t as translate } from '@/i18n'
import { getProject, type Project } from '@/api/project'
import { getStates, type State } from '@/api/state'
import {
  getAllIssues,
  createIssue,
  updateIssue,
  deleteIssue,
  addAssignee,
  removeAssignee,
  type Issue,
  type IssuePriorityValue,
} from '@/api/issue'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { BoardView } from './BoardView'
import { ListView } from './ListView'
import { CreateIssueDialog } from './CreateIssueDialog'
import { DistributeDialog } from './DistributeDialog'
import { IssueDetailPanel } from './IssueDetailPanel'
import { SubmitReviewDialog } from './control/ControlDialogs'

const errMsg = (err: unknown, fallback: string) => errorText(err, fallback)

type ViewMode = 'board' | 'list'

// Quick filters for the board (Ф5): who's responsible, what needs attention.
type QuickFilter = 'all' | 'mine' | 'control' | 'overdue' | 'review' | 'unack'
const QUICK_FILTERS: { key: QuickFilter; label: () => string }[] = [
  { key: 'all', label: () => translate('Все') },
  { key: 'mine', label: () => translate('Мои') },
  { key: 'control', label: () => translate('На контроле') },
  { key: 'overdue', label: () => translate('Просрочено') },
  { key: 'review', label: () => translate('На проверке') },
  { key: 'unack', label: () => translate('Не ознакомлены') },
]

export function WorkItemsPage() {
  const { t } = useTranslation()
  const { id: projectId } = useParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug
  const me = useAuthStore((s) => s.user?.id)
  const timeZone = workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const [quick, setQuick] = useState<QuickFilter>('all')
  // Hand-in dialog opened from a drag to "На проверке" / "Готово".
  const [reviewFor, setReviewFor] = useState<{ issue: Issue; note?: string } | null>(null)

  const [project, setProject] = useState<Project | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('board')
  const [createOpen, setCreateOpen] = useState(false)
  const [distributeOpen, setDistributeOpen] = useState(false)
  // The open issue lives in the URL (?issue=<id>) so notifications, the home page
  // and deep links can open a specific work item.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('issue')
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

  // The panel reads its issue straight from the board's list, so edits made
  // anywhere stay in sync with a single source of truth.
  const selectedIssue = issues.find((i) => i.id === selectedId) ?? null

  useEffect(() => {
    if (!slug || !projectId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [p, st, all, mem] = await Promise.all([
          getProject(slug, projectId),
          getStates(slug, projectId),
          getAllIssues(slug, projectId, { sort_by: 'sort_order', order: 'asc' }),
          getWorkspaceMembers(slug).catch(() => []),
        ])
        if (cancelled) return
        setProject(p)
        setStates(st)
        setIssues(all)
        setMembers(mem)
      } catch (err) {
        if (!cancelled) setError(errMsg(err, t('Не удалось загрузить задачи')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, projectId, t])

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

  const visibleIssues = useMemo(() => {
    if (quick === 'all') return issues
    return issues.filter((i) => {
      const group = i.state?.group ?? states.find((s) => s.id === i.state_id)?.group
      const open = group !== 'completed' && group !== 'cancelled'
      switch (quick) {
        case 'mine':
          return i.assignees.some((a) => a.user_id === me)
        case 'control':
          return open && (i.controller_id ?? (i.kind === 'assignment' ? i.created_by_id : null)) === me
        case 'overdue':
          return open && deadlineInfo(i.due_date, group, timeZone).tone === 'overdue'
        case 'review':
          return group === 'review'
        case 'unack':
          return open && i.kind === 'assignment' && i.assignees.some((a) => !a.acknowledged_at)
        default:
          return true
      }
    })
  }, [issues, quick, me, states, timeZone])

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
      toast.success(t('Задача удалена'))
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
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
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
              ] as const
            ).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
                  view === mode
                    ? 'bg-nav-active-bg text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* One assignment for several departments (6.F1) */}
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

          {/* Add work item */}
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={loading || !!error || states.length === 0}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">{t('Создать')}</span>
          </Button>
        </div>
      </div>

      {/* Quick filters */}
      {!loading && !error && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4 py-1.5">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setQuick(f.key)}
              className={cn(
                'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                quick === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {f.label()}
            </button>
          ))}
          {quick !== 'all' && (
            <span className="ml-2 text-xs text-muted-foreground">
              {t('Показано: {{n}} из {{total}}', { n: visibleIssues.length, total: issues.length })}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
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
          />
        ) : (
          <ListView
            states={states}
            issues={visibleIssues}
            project={project}
            onCreate={handleCreate}
            onOpen={(issue) => setSelectedId(issue.id)}
            onDelete={handleDelete}
          />
        )}
      </div>

      {slug && projectId && (
        <CreateIssueDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          slug={slug}
          projectId={projectId}
          states={states}
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
