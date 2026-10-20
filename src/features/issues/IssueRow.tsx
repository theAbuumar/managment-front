import { useTranslation } from 'react-i18next'
import { ShieldCheck, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { DeadlineBadge } from '@/components/ui/deadline-badge'
import { ChecklistBadge } from '@/components/ui/checklist-badge'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { shortName } from '@/lib/people'
import { issueKey } from '@/lib/links'
import type { Issue } from '@/api/issue'

// One line of a workspace-wide issue list (rows of GET WS/issues carry their
// project and state): priority, key, title, project, state, deadline, person.
export function IssueRow({
  issue,
  person = 'assignee',
  onOpen,
}: {
  issue: Issue
  /** Who to show at the end of the row. */
  person?: 'assignee' | 'controller'
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const meta = PRIORITY_CONFIG[issue.priority]
  const PIcon = meta.icon
  const who =
    person === 'controller' ? issue.controller : issue.assignees[0]?.user
  return (
    <button
      onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <PIcon size={14} className={cn('shrink-0', meta.iconColor)} />
      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground sm:w-20">
        {issueKey(issue)}
      </span>
      {issue.is_distribution ? (
        <Send
          size={13}
          className="shrink-0 text-primary"
          aria-label={t('Рассылка подразделениям')}
        />
      ) : (
        issue.kind === 'assignment' && (
          <ShieldCheck
            size={13}
            className="shrink-0 text-primary"
            aria-label={t('Поручение')}
          />
        )
      )}
      {/* On a phone the deadline wraps under the title instead of squeezing it. */}
      <span className="min-w-[9rem] flex-1 basis-0 truncate text-sm">
        {issue.title}
      </span>
      {issue.project && (
        <span className="hidden max-w-[160px] truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground lg:inline">
          {issue.project.icon ? `${issue.project.icon} ` : ''}
          {issue.project.name}
        </span>
      )}
      {issue.state && (
        <span className="hidden text-[11px] text-muted-foreground md:inline">
          {issue.state.name}
        </span>
      )}
      <ChecklistBadge
        done={issue.checklist_done}
        total={issue.checklist_total}
        className="hidden sm:flex"
      />
      <DeadlineBadge
        dueDate={issue.due_date}
        group={issue.state?.group}
        completedAt={issue.completed_at}
      />
      {who && (
        <span
          className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex"
          title={person === 'controller' ? t('Контролёр') : t('Ответственный')}
        >
          <PersonAvatar person={who} size={18} />
          {shortName(who)}
        </span>
      )}
    </button>
  )
}
