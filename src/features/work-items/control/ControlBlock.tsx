import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Send,
  Undo2,
  CalendarClock,
  Hourglass,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { cn } from '@/lib/utils'
import { shortName } from '@/lib/people'
import { dateTime, longDate } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import {
  acknowledgeIssue,
  approveReview,
  decideDeadlineRequest,
  type DeadlineRequest,
  type IssueReview,
} from '@/api/control'
import type { Issue } from '@/api/issue'
import type { StateGroup } from '@/api/state'
import { DeadlineRequestDialog, ReturnReviewDialog, SubmitReviewDialog } from './ControlDialogs'

// "Контроль исполнения" (Ф5 5.F1–5.F3): where the assignment stands and the next
// step for whoever is looking — acknowledge, hand in, accept / return, move the
// deadline. Buttons only appear for the people who may press them.
export function ControlBlock({
  slug,
  projectId,
  issue,
  group,
  currentUserId,
  isReviewer,
  reviews,
  deadlineRequests,
  timeZone,
  onIssue,
  onRefresh,
}: {
  slug: string
  projectId: string
  issue: Issue
  group: StateGroup | undefined
  currentUserId: string | undefined
  isReviewer: boolean
  reviews: IssueReview[]
  deadlineRequests: DeadlineRequest[]
  timeZone: string
  onIssue: (issue: Issue) => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [deadlineOpen, setDeadlineOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const isAssignment = issue.kind === 'assignment'
  const mine = issue.assignees.find((a) => a.user_id === currentUserId)
  const open = group !== 'completed' && group !== 'cancelled'
  const pendingReview = reviews.find((r) => r.decision === 'pending')
  const lastReturned = !pendingReview ? reviews.find((r) => r.decision === 'returned') : undefined
  const approved = reviews.find((r) => r.decision === 'approved')
  const pendingDeadline = deadlineRequests.find((d) => d.status === 'pending')

  async function run<T>(fn: () => Promise<T>, ok: string, then?: (v: T) => void) {
    setBusy(true)
    try {
      const v = await fn()
      toast.success(ok)
      then?.(v)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  // Status line.
  let status: { icon: React.ReactNode; text: string; tone: string }
  if (group === 'completed') {
    status = {
      icon: <CheckCircle2 size={16} />,
      text: approved?.decided_by
        ? t('Принято: {{name}}, {{when}}', { name: shortName(approved.decided_by), when: dateTime(approved.decided_at!) })
        : t('Выполнено'),
      tone: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30',
    }
  } else if (pendingReview) {
    status = {
      icon: <Hourglass size={16} />,
      text: t('На проверке с {{when}} — ждёт решения контролёра', { when: dateTime(pendingReview.submitted_at) }),
      tone: 'text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/30',
    }
  } else if (lastReturned && open) {
    status = {
      icon: <Undo2 size={16} />,
      text: t('Возвращено на доработку: «{{comment}}»', { comment: lastReturned.decision_comment ?? '' }),
      tone: 'text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30',
    }
  } else {
    status = {
      icon: <ShieldCheck size={16} />,
      text: isAssignment
        ? issue.controller
          ? t('В работе · контролёр: {{name}}', { name: shortName(issue.controller) })
          : t('В работе')
        : t('Задача в работе'),
      tone: 'text-foreground bg-muted/50 border-border',
    }
  }

  return (
    <div className="border-b border-border p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('Контроль исполнения')}
      </h3>

      <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', status.tone)}>
        <span className="mt-0.5 shrink-0">{status.icon}</span>
        <span>{status.text}</span>
      </div>

      {/* Pending deadline request — the controller decides here. */}
      {pendingDeadline && (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-500/30 dark:bg-blue-500/10">
          <p className="flex items-center gap-1.5 font-medium">
            <CalendarClock size={15} />
            {t('{{name}} просит перенести срок: {{from}} → {{to}}', {
              name: shortName(pendingDeadline.requested_by),
              from: pendingDeadline.old_due_date ? longDate(pendingDeadline.old_due_date) : '—',
              to: longDate(pendingDeadline.new_due_date),
            })}
          </p>
          <p className="mt-0.5 text-muted-foreground">{pendingDeadline.reason}</p>
          {isReviewer && (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () => decideDeadlineRequest(slug, projectId, issue.id, pendingDeadline.id, true),
                    t('Перенос срока одобрен'),
                    () => onRefreshIssue(),
                  )
                }
              >
                {t('Одобрить')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    () => decideDeadlineRequest(slug, projectId, issue.id, pendingDeadline.id, false),
                    t('Перенос срока отклонён'),
                    () => onRefresh(),
                  )
                }
              >
                {t('Отклонить')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {mine && isAssignment && !mine.acknowledged_at && open && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(() => acknowledgeIssue(slug, projectId, issue.id), t('Отмечено: ознакомлен'), onIssue)}
          >
            <Eye size={15} />
            {t('Ознакомлен')}
          </Button>
        )}
        {mine && isAssignment && open && group !== 'review' && (
          <Button size="sm" variant={mine.acknowledged_at ? 'default' : 'outline'} onClick={() => setSubmitOpen(true)}>
            <Send size={15} />
            {t('Сдать на проверку')}
          </Button>
        )}
        {isReviewer && pendingReview && (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => approveReview(slug, projectId, issue.id), t('Результат принят'), onIssue)}
            >
              <CheckCircle2 size={15} />
              {t('Принять')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)}>
              <Undo2 size={15} />
              {t('Вернуть на доработку')}
            </Button>
          </>
        )}
        {mine && isAssignment && open && issue.due_date && !pendingDeadline && (
          <Button size="sm" variant="ghost" onClick={() => setDeadlineOpen(true)}>
            <CalendarClock size={15} />
            {t('Запросить перенос срока')}
          </Button>
        )}
      </div>

      {/* Acknowledgement per assignee */}
      {isAssignment && issue.assignees.length > 0 && (
        <div className="mt-3 space-y-1">
          {issue.assignees.map((a) => (
            <div key={a.user_id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <PersonAvatar person={a.user ? { ...a.user, id: a.user_id } : null} size={18} />
              <span className="text-foreground">{shortName(a.user)}</span>
              {a.is_primary && <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{t('ответственный')}</span>}
              <span className="ml-auto flex items-center gap-1">
                {a.acknowledged_at ? (
                  <>
                    <Eye size={12} className="text-emerald-600" />
                    {t('ознакомлен {{when}}', { when: dateTime(a.acknowledged_at) })}
                  </>
                ) : (
                  <>
                    <EyeOff size={12} className="text-amber-500" />
                    {t('не ознакомлен')}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <SubmitReviewDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        slug={slug}
        projectId={projectId}
        issue={issue}
        onDone={onIssue}
      />
      <ReturnReviewDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        slug={slug}
        projectId={projectId}
        issue={issue}
        onDone={onIssue}
      />
      <DeadlineRequestDialog
        open={deadlineOpen}
        onOpenChange={setDeadlineOpen}
        slug={slug}
        projectId={projectId}
        issue={issue}
        timeZone={timeZone}
        onDone={onRefresh}
      />
    </div>
  )

  // An approved deadline changes the issue itself — reload it through the parent.
  function onRefreshIssue() {
    onRefresh()
  }
}
