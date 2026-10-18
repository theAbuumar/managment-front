import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, MoreHorizontal, Trash2, ShieldCheck } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { DeadlineBadge } from '@/components/ui/deadline-badge'
import { shortName } from '@/lib/people'
import { cn } from '@/lib/utils'
import { VirtualStack } from '@/components/ui/virtual-stack'
import type { State } from '@/api/state'
import type { Issue } from '@/api/issue'
import type { Project } from '@/api/project'
import { InlineComposer } from './InlineComposer'

interface ListViewProps {
  states: State[]
  issues: Issue[]
  project: Project | null
  onCreate: (stateId: string, title: string) => void
  onOpen: (issue: Issue) => void
  onDelete: (issue: Issue) => void
  /** Guest: no create, no row menu (12.B4). */
  readOnly?: boolean
}

// Memoized with callbacks that take the issue: scrolling a long list re-renders
// only the rows that come into view, not every visible one (12.F4).
const IssueRow = memo(function IssueRow({
  issue,
  group,
  project,
  onOpen: open,
  onDelete: remove,
}: {
  issue: Issue
  group: State['group']
  project: Project | null
  onOpen: (issue: Issue) => void
  /** Absent for a guest: the row has no menu (12.B4). */
  onDelete?: (issue: Issue) => void
}) {
  const onOpen = () => open(issue)
  const onDelete = remove && (() => remove(issue))
  const { t } = useTranslation()
  const meta = PRIORITY_CONFIG[issue.priority]
  const PIcon = meta.icon
  const identifier = project
    ? `${project.identifier}-${issue.sequence_id}`
    : `#${issue.sequence_id}`
  const primary = issue.assignees[0]

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/60"
    >
      <PIcon size={14} className={meta.iconColor} />
      <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
        {identifier}
      </span>
      {issue.kind === 'assignment' && (
        <ShieldCheck
          size={13}
          className="shrink-0 text-primary"
          aria-label={t('Поручение')}
        />
      )}
      <span className="flex-1 truncate text-sm text-foreground">
        {issue.title}
      </span>
      <DeadlineBadge
        dueDate={issue.due_date}
        group={group}
        completedAt={issue.completed_at}
      />
      {primary && (
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <PersonAvatar
            person={
              primary.user ? { ...primary.user, id: primary.user_id } : null
            }
            size={20}
          />
          <span className="max-w-[140px] truncate">
            {shortName(primary.user)}
          </span>
          {issue.assignees.length > 1 && (
            <span>+{issue.assignees.length - 1}</span>
          )}
        </span>
      )}
      {onDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 focus:opacity-100"
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
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
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
})

// The list as one flat run of lines — group header, its rows, then the composer or
// the "new task" button — so a long project can render only what is on screen
// (12.F4) while a small one stays plain DOM.
type Line =
  | { kind: 'header'; state: State; count: number; first: boolean }
  | { kind: 'row'; state: State; issue: Issue }
  | { kind: 'composer'; state: State }
  | { kind: 'add'; state: State }

const LINE_HEIGHT: Record<Line['kind'], number> = {
  header: 37,
  row: 40,
  composer: 76,
  add: 32,
}

export function ListView({
  states,
  issues,
  project,
  onCreate,
  onOpen,
  onDelete,
  readOnly = false,
}: ListViewProps) {
  const { t } = useTranslation()
  const [composerFor, setComposerFor] = useState<string | null>(null)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  )

  const lines: Line[] = []
  states.forEach((state, index) => {
    const groupIssues = issues.filter((i) => i.state_id === state.id)
    lines.push({
      kind: 'header',
      state,
      count: groupIssues.length,
      first: index === 0,
    })
    for (const issue of groupIssues) lines.push({ kind: 'row', state, issue })
    if (composerFor === state.id) lines.push({ kind: 'composer', state })
    else if (!readOnly && groupIssues.length === 0)
      lines.push({ kind: 'add', state })
  })

  function renderLine(line: Line) {
    switch (line.kind) {
      case 'header':
        return (
          <div
            className={cn(
              'flex items-center gap-2 bg-muted/40 px-4 py-2',
              !line.first && 'border-t border-border',
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: line.state.color }}
            />
            <span className="text-sm font-medium text-foreground">
              {line.state.name}
            </span>
            <span className="text-xs text-muted-foreground">{line.count}</span>
            <button
              type="button"
              onClick={() => setComposerFor(line.state.id)}
              className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t('Добавить задачу')}
            >
              <Plus size={15} />
            </button>
          </div>
        )
      case 'row':
        return (
          <div className="px-1 py-px">
            <IssueRow
              issue={line.issue}
              group={line.state.group}
              project={project}
              onOpen={onOpen}
              onDelete={readOnly ? undefined : onDelete}
            />
          </div>
        )
      case 'composer':
        return (
          <div className="px-3 py-1.5">
            <InlineComposer
              placeholder={t('Что нужно сделать?')}
              onCreate={(title) => onCreate(line.state.id, title)}
              onClose={() => setComposerFor(null)}
            />
          </div>
        )
      case 'add':
        return (
          <div className="px-1">
            <button
              type="button"
              onClick={() => setComposerFor(line.state.id)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus size={13} /> {t('Новая задача')}
            </button>
          </div>
        )
    }
  }

  return (
    <div
      ref={setScrollElement}
      className="h-full overflow-y-auto border-b border-border"
    >
      <VirtualStack
        items={lines}
        getKey={(line) =>
          line.kind === 'row' ? line.issue.id : `${line.kind}:${line.state.id}`
        }
        scrollElement={scrollElement}
        estimateSize={(line) => LINE_HEIGHT[line.kind]}
        threshold={150}
        // The composer sits at the end of its group, possibly far down: keep it
        // (and the rows just created above it) in view.
        scrollToKey={composerFor ? `composer:${composerFor}` : null}
        render={renderLine}
      />
    </div>
  )
}
