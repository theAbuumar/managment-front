import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, AlertCircle, ListFilter, Inbox } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import {
  getAllWorkspaceIssues,
  type Issue,
  type IssueKind,
  type WorkspaceListParams,
} from '@/api/issue'
import { errorText } from '@/lib/errorMessages'
import { pluralize } from '@/lib/plural'
import { IssueRow } from '@/features/issues/IssueRow'
import { WorkspaceIssuePanel } from '@/features/issues/WorkspaceIssuePanel'
import { nextDay, startOfLocalDayIso } from './format'

// The list behind a chart (Ф10 10.F2): every bar, tile and count on the
// analytics views links here with its filters in the URL, and the rows come
// from GET WS/issues (7.B1) — the same scope rules as the rest of the app.

const TASKS: [string, string, string] = ['задача', 'задачи', 'задач']

export function IssuesDrilldownPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug
  const timeZone =
    workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const query = params.toString()

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    const p = new URLSearchParams(query)
    const filter: WorkspaceListParams = { sort_by: 'due_date', order: 'asc' }
    if (p.get('department')) filter.department = p.get('department')!
    if (p.get('project')) filter.project = p.get('project')!
    if (p.get('kind')) filter.kind = p.get('kind') as IssueKind
    if (p.get('assignee')) filter.assignee = p.get('assignee')!
    if (p.get('overdue') === 'true') filter.overdue = 'true'
    if (p.get('open') === 'true') filter.open = 'true'
    const from = p.get('completed_from')
    const to = p.get('completed_to')
    if (from && to) {
      filter.state_group = 'completed'
      filter.completed_after = startOfLocalDayIso(from, timeZone)
      filter.completed_before = new Date(
        Date.parse(startOfLocalDayIso(nextDay(to), timeZone)) - 1,
      ).toISOString()
    }
    getAllWorkspaceIssues(slug, filter)
      .then((rows) => {
        if (cancelled) return
        setIssues(rows)
        setError(null)
      })
      .catch(
        (err) =>
          !cancelled &&
          setError(errorText(err, t('Не удалось загрузить задачи'))),
      )
    return () => {
      cancelled = true
    }
  }, [slug, query, timeZone, t])

  const title = params.get('title') || t('Задачи')
  const selected = issues?.find((i) => i.id === selectedId) ?? null

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={t('Назад')}
        >
          <ArrowLeft size={16} />
        </button>
        <ListFilter size={15} className="text-muted-foreground" />
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        {issues && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {pluralize(issues.length, TASKS)}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-4 sm:p-6">
          {error ? (
            <EmptyState
              icon={AlertCircle}
              title={t('Не удалось загрузить задачи')}
              description={error}
            />
          ) : issues === null ? (
            <Skeleton className="h-64" />
          ) : issues.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t('Здесь пусто')}
              description={t('Под эти условия задач нет.')}
            />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  onOpen={() => setSelectedId(issue.id)}
                />
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
            setIssues(
              (prev) =>
                prev?.map((i) => (i.id === updated.id ? updated : i)) ?? prev,
            )
          }
          onDeleted={(id) => {
            setIssues((prev) => prev?.filter((i) => i.id !== id) ?? prev)
            setSelectedId(null)
          }}
        />
      )}
    </div>
  )
}
