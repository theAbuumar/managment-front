import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { LayoutGrid, List, AlertCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useWorkspaceStore } from '@/stores/workspaceStore'
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
import { IssueDetailPanel } from './IssueDetailPanel'

const errMsg = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback

type ViewMode = 'board' | 'list'

export function WorkItemsPage() {
  const { id: projectId } = useParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug

  const [project, setProject] = useState<Project | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('board')
  const [createOpen, setCreateOpen] = useState(false)
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
        if (!cancelled) setError(errMsg(err, 'Failed to load work items'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, projectId])

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
      toast.error(errMsg(err, 'Could not create work item'))
    }
  }

  async function handleMove(issueId: string, toStateId: string) {
    if (!slug || !projectId) return
    const target = issues.find((i) => i.id === issueId)
    if (!target || target.state_id === toStateId) return
    const snapshot = issues
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, state_id: toStateId } : i)),
    )
    try {
      await updateIssue(slug, projectId, issueId, { state_id: toStateId })
    } catch (err) {
      setIssues(snapshot)
      toast.error(errMsg(err, 'Could not move work item'))
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
      toast.error(errMsg(err, 'Could not update priority'))
    }
  }

  async function handleDelete(issue: Issue) {
    if (!slug || !projectId) return
    const snapshot = issues
    setIssues((prev) => prev.filter((i) => i.id !== issue.id))
    try {
      await deleteIssue(slug, projectId, issue.id)
      toast.success('Work item deleted')
    } catch (err) {
      setIssues(snapshot)
      toast.error(errMsg(err, 'Could not delete work item'))
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
      toast.error(errMsg(err, 'Could not update assignees'))
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* View bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-400 text-sm">
          📊
        </div>
        <span className="truncate text-sm font-semibold text-foreground">
          {project?.name ?? 'Work Items'}
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
                { mode: 'board', icon: LayoutGrid, label: 'Board' },
                { mode: 'list', icon: List, label: 'List' },
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

          {/* Add work item */}
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={loading || !!error || states.length === 0}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
      </div>

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
            title="Couldn't load work items"
            description={error}
          />
        ) : states.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No states yet"
            description="This project has no workflow states to organise work items into."
          />
        ) : view === 'board' ? (
          <BoardView
            states={states}
            issues={issues}
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
            issues={issues}
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
        />
      )}
    </div>
  )
}
