import { useTranslation } from 'react-i18next'
import {
  MoreHorizontal,
  Trash2,
  Check,
  UserPlus,
  EyeOff,
  ShieldCheck,
  CalendarSync,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { DeadlineBadge } from '@/components/ui/deadline-badge'
import { BlockedMark, ChecklistBadge, RecurringMark, SubtaskBadge } from '@/components/ui/checklist-badge'
import { cn } from '@/lib/utils'
import { shortName } from '@/lib/people'
import { issueLink } from '@/lib/links'
import type { Issue, IssuePriorityValue } from '@/api/issue'
import type { State } from '@/api/state'
import type { Project } from '@/api/project'
import type { WorkspaceMember } from '@/api/workspace'

const PRIORITIES: IssuePriorityValue[] = ['urgent', 'high', 'medium', 'low', 'none']

// Shared look for the small interactive chips along the bottom of a card.
const chipBtn =
  'flex h-6 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent'

// Change an issue's priority straight from the card.
function PriorityMenu({
  value,
  onChange,
}: {
  value: IssuePriorityValue
  onChange: (p: IssuePriorityValue) => void
}) {
  const { t } = useTranslation()
  const meta = PRIORITY_CONFIG[value]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t('Приоритет: {{p}}', { p: meta.label })}
          onClick={(e) => e.stopPropagation()}
          className={chipBtn}
        >
          <Icon size={13} className={meta.iconColor} />
          {value !== 'none' && <span>{meta.label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {PRIORITIES.map((p) => {
          const m = PRIORITY_CONFIG[p]
          const PIcon = m.icon
          return (
            <DropdownMenuItem
              key={p}
              onClick={(e) => {
                e.stopPropagation()
                onChange(p)
              }}
            >
              <PIcon size={14} className={cn('mr-2', m.iconColor)} />
              <span className="flex-1">{m.label}</span>
              {value === p && <Check size={14} />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Show the current stage (state) and let the user move the item to another one.
function StateMenu({
  states,
  value,
  onChange,
}: {
  states: State[]
  value: string
  onChange: (stateId: string) => void
}) {
  const { t } = useTranslation()
  const current = states.find((s) => s.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t('Состояние: {{s}}', { s: current?.name ?? '—' })}
          onClick={(e) => e.stopPropagation()}
          className={cn(chipBtn, 'text-foreground')}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: current?.color ?? '#94a3b8' }}
          />
          <span className="max-w-[90px] truncate">{current?.name ?? t('Состояние')}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {states.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={(e) => {
              e.stopPropagation()
              if (s.id !== value) onChange(s.id)
            }}
          >
            <span className="mr-2 size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="flex-1">{s.name}</span>
            {s.id === value && <Check size={14} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Show who's assigned (primary first), and add/remove assignees from the card.
function AssigneeMenu({
  members,
  assignees,
  onToggle,
}: {
  members: WorkspaceMember[]
  assignees: Issue['assignees']
  onToggle: (member: WorkspaceMember, alreadyAssigned: boolean) => void
}) {
  const { t } = useTranslation()
  const assignedIds = new Set(assignees.map((a) => a.user_id))
  const shown = assignees.slice(0, 3)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={
            assignees.length
              ? assignees.map((a) => shortName(a.user)).join(', ')
              : t('Назначить исполнителя')
          }
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'ml-auto flex h-6 items-center rounded px-0.5 transition-colors hover:bg-accent',
            assignees.length === 0 && 'border border-border px-1.5',
          )}
        >
          {assignees.length > 0 ? (
            <span className="flex -space-x-1.5">
              {shown.map((a) => (
                <PersonAvatar
                  key={a.user_id}
                  person={a.user ? { ...a.user, id: a.user_id } : null}
                  size={20}
                  title={false}
                  className="ring-2 ring-card"
                />
              ))}
              {assignees.length > 3 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium ring-2 ring-card">
                  +{assignees.length - 3}
                </span>
              )}
            </span>
          ) : (
            <UserPlus size={13} className="text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 w-60 overflow-y-auto">
        {members.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('Нет участников.')}</p>
        )}
        {members.map((m) => {
          const selected = assignedIds.has(m.user_id)
          return (
            <DropdownMenuItem
              key={m.user_id}
              // Keep the menu open so several people can be toggled at once.
              onSelect={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                onToggle(m, selected)
              }}
            >
              <PersonAvatar person={{ ...m.user, id: m.user_id }} size={20} className="mr-2" />
              <span className="flex-1 truncate">{shortName(m.user)}</span>
              {selected && <Check size={14} />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function IssueCard({
  issue,
  project,
  states,
  members,
  onOpen,
  onPriorityChange,
  onStateChange,
  onAssigneeToggle,
  onDelete,
  onDragStart,
  onDragEnd,
  dragging,
  readOnly = false,
}: {
  issue: Issue
  project: Project | null
  states: State[]
  members: WorkspaceMember[]
  onOpen: () => void
  onPriorityChange: (p: IssuePriorityValue) => void
  onStateChange: (stateId: string) => void
  onAssigneeToggle: (member: WorkspaceMember, alreadyAssigned: boolean) => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
  /** Guest: not draggable, no «⋯» menu (12.B4). */
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const identifier = project ? `${project.identifier}-${issue.sequence_id}` : `#${issue.sequence_id}`
  const labels = issue.labels.filter((l) => l.label)
  const group = issue.state?.group ?? states.find((s) => s.id === issue.state_id)?.group
  const isAssignment = issue.kind === 'assignment'
  const notAcknowledged =
    isAssignment &&
    group !== 'completed' &&
    group !== 'cancelled' &&
    issue.assignees.some((a) => !a.acknowledged_at)
  const moves = issue._count?.deadline_requests ?? 0

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation()
    if (!project) return
    try {
      await navigator.clipboard.writeText(issueLink(project.identifier, issue.sequence_id))
      toast.success(t('Ссылка скопирована'))
    } catch {
      toast.error(t('Не удалось скопировать ссылку'))
    }
  }

  return (
    <div
      draggable={!readOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', issue.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'group cursor-pointer rounded-lg border border-border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      {/* Top row: identifier · kind · menu */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">{identifier}</span>
        {isAssignment && (
          <span
            title={
              issue.controller
                ? t('Поручение · контролёр: {{name}}', { name: shortName(issue.controller) })
                : t('Поручение')
            }
            className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-primary"
          >
            <ShieldCheck size={10} />
            {t('Поручение')}
          </span>
        )}
        {notAcknowledged && (
          <span title={t('Исполнитель ещё не ознакомился')} className="text-amber-500">
            <EyeOff size={12} />
          </span>
        )}
        {group !== 'completed' && group !== 'cancelled' && (
          <BlockedMark count={issue._count?.outgoing_links} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 focus:opacity-100"
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={copyLink}>
              <Link2 size={14} className="mr-2" />
              {t('Скопировать ссылку')}
            </DropdownMenuItem>
            {!readOnly && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                >
                  <Trash2 size={14} className="mr-2" />
                  {t('Удалить')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Title */}
      <p className="mb-2 line-clamp-3 text-sm text-foreground">{issue.title}</p>

      {/* Labels */}
      {labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {labels.slice(0, 3).map((l) => (
            <span
              key={l.label_id}
              className="flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              <span className="size-2 rounded-full" style={{ background: l.label?.color }} />
              {l.label?.name}
            </span>
          ))}
        </div>
      )}

      {/* Meta row: priority · stage · deadline · moves · assignees */}
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityMenu value={issue.priority} onChange={onPriorityChange} />
        <StateMenu states={states} value={issue.state_id} onChange={onStateChange} />
        <DeadlineBadge dueDate={issue.due_date} group={group} completedAt={issue.completed_at} />
        <ChecklistBadge done={issue.checklist_done} total={issue.checklist_total} />
        {!issue.is_distribution && <SubtaskBadge count={issue._count?.children} />}
        <RecurringMark ruleId={issue.recurring_rule_id} />
        {moves > 0 && (
          <span
            title={t('Срок переносился: {{n}}', { n: moves })}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground"
          >
            <CalendarSync size={11} />
            {moves}
          </span>
        )}
        <AssigneeMenu members={members} assignees={issue.assignees} onToggle={onAssigneeToggle} />
      </div>
    </div>
  )
}
