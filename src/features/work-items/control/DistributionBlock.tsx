import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckCircle2, Send, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { DeadlineBadge } from '@/components/ui/deadline-badge'
import { cn } from '@/lib/utils'
import { shortName } from '@/lib/people'
import { errorText } from '@/lib/errorMessages'
import {
  getIssue,
  updateIssue,
  type DistributionProgress,
  type Issue,
} from '@/api/issue'
import type { State } from '@/api/state'

// Сводный прогресс рассылки (Ф6 6.F2): on the parent of a distribution, one row
// per department — who executes it, where it stands, the deadline — with a jump
// into each child. Once every department is done the controller is offered to
// close the parent assignment.
export function DistributionBlock({
  slug,
  projectId,
  issue,
  states,
  canClose,
  onOpenIssue,
  onIssue,
}: {
  slug: string
  projectId: string
  issue: Issue
  states: State[]
  /** The viewer accepts the work (controller, author, admin). */
  canClose: boolean
  onOpenIssue?: (issueId: string) => void
  onIssue: (issue: Issue) => void
}) {
  const { t } = useTranslation()
  const [progress, setProgress] = useState<DistributionProgress | null>(
    issue.distribution ?? null,
  )
  const [closing, setClosing] = useState(false)

  // Rows of a board/list don't carry the progress; fetch it (and refresh on change).
  useEffect(() => {
    let cancelled = false
    getIssue(slug, projectId, issue.id)
      .then((fresh) => !cancelled && setProgress(fresh.distribution ?? null))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [slug, projectId, issue.id, issue.updated_at])

  if (!progress) {
    return (
      <div className="border-b border-border p-4">
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const done = progress.completed + progress.cancelled
  const pct = (n: number) => (progress.total ? (n / progress.total) * 100 : 0)
  const doneState = states.find((s) => s.group === 'completed')

  async function closeParent() {
    if (!doneState) return
    setClosing(true)
    try {
      onIssue(
        await updateIssue(slug, projectId, issue.id, {
          state_id: doneState.id,
        }),
      )
      toast.success(t('Поручение закрыто'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось закрыть поручение')))
    } finally {
      setClosing(false)
    }
  }

  return (
    <section className="border-b border-border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Send size={15} className="text-primary" />
        <h3 className="text-sm font-semibold">
          {t('Рассылка подразделениям')}
        </h3>
        <span className="text-sm text-muted-foreground">
          {t('исполнено {{done}} из {{total}}', {
            done: progress.completed,
            total: progress.total,
          })}
        </span>
        {progress.overdue > 0 && (
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
            {t('просрочено: {{n}}', { n: progress.overdue })}
          </span>
        )}
        {progress.review > 0 && (
          <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
            {t('на проверке: {{n}}', { n: progress.review })}
          </span>
        )}
      </div>

      {/* One bar: done · under review · overdue · still in work. */}
      <div
        className="mb-3 flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={t('Исполнено {{done}} из {{total}}', {
          done,
          total: progress.total,
        })}
      >
        <div className="bg-emerald-500" style={{ width: `${pct(done)}%` }} />
        <div
          className="bg-violet-500"
          style={{ width: `${pct(progress.review)}%` }}
        />
        <div
          className="bg-red-500"
          style={{
            width: `${pct(progress.overdue - countOverdueInReview(progress))}%`,
          }}
        />
      </div>

      {progress.ready_to_close && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 size={16} />
          <span className="flex-1">
            {t('Все подразделения исполнили поручение.')}
          </span>
          {canClose && doneState && (
            <Button size="sm" onClick={closeParent} disabled={closing}>
              {t('Закрыть поручение')}
            </Button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        {progress.items.map((item) => (
          <button
            key={item.issue_id}
            type="button"
            onClick={() => onOpenIssue?.(item.issue_id)}
            disabled={!onOpenIssue}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50 disabled:cursor-default"
          >
            <span className="min-w-0 flex-1 basis-40 truncate font-medium">
              {item.department?.short_name ??
                item.department?.name ??
                t('Без подразделения')}
            </span>
            {item.assignee && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <PersonAvatar person={item.assignee} size={18} />
                {shortName(item.assignee)}
              </span>
            )}
            <span
              className={cn('rounded-full px-2 py-0.5 text-xs')}
              style={{
                background: `${item.state.color}22`,
                color: item.state.color,
              }}
            >
              {item.state.name}
            </span>
            <DeadlineBadge
              dueDate={item.due_date}
              group={item.state.group}
              completedAt={item.completed_at}
            />
            {onOpenIssue && (
              <ChevronRight size={14} className="text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

/** Overdue children already counted in the review segment of the bar. */
function countOverdueInReview(p: DistributionProgress): number {
  return p.items.filter((i) => i.overdue && i.state.group === 'review').length
}
