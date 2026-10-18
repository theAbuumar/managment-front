import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VirtualStack } from '@/components/ui/virtual-stack'
import type { State } from '@/api/state'
import type { Issue, IssuePriorityValue } from '@/api/issue'
import type { Project } from '@/api/project'
import type { WorkspaceMember } from '@/api/workspace'
import { IssueCard } from './IssueCard'
import { InlineComposer } from './InlineComposer'

interface BoardViewProps {
  states: State[]
  issues: Issue[]
  project: Project | null
  members: WorkspaceMember[]
  onCreate: (stateId: string, title: string) => void
  onMove: (issueId: string, toStateId: string) => void
  onOpen: (issue: Issue) => void
  onPriorityChange: (issue: Issue, p: IssuePriorityValue) => void
  onAssigneeToggle: (
    issue: Issue,
    member: WorkspaceMember,
    alreadyAssigned: boolean,
  ) => void
  onDelete: (issue: Issue) => void
  /** Guest: no create, no drag-and-drop, no card menu (12.B4). */
  readOnly?: boolean
}

/** First guess of a card's height for the windowed column (measured after render). */
const CARD_HEIGHT = 128

// A column's scrolling card area; the ref lets a long column render only the
// cards on screen (12.F4).
function ColumnScroll({
  children,
}: {
  children: (scrollElement: HTMLDivElement | null) => React.ReactNode
}) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  )
  return (
    <div
      ref={setScrollElement}
      className="flex-1 space-y-2 overflow-y-auto px-2 pb-2"
    >
      {children(scrollElement)}
    </div>
  )
}

// A card with callbacks that take the issue, memoized: scrolling a long column
// re-renders only the cards that come into view, not every visible one (12.F4).
const BoardCard = memo(function BoardCard({
  issue,
  project,
  states,
  members,
  readOnly,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onPriorityChange,
  onMove,
  onAssigneeToggle,
  onDelete,
}: Pick<
  BoardViewProps,
  | 'project'
  | 'states'
  | 'members'
  | 'onOpen'
  | 'onPriorityChange'
  | 'onMove'
  | 'onAssigneeToggle'
  | 'onDelete'
> & {
  issue: Issue
  readOnly: boolean
  dragging: boolean
  onDragStart: (issueId: string) => void
  onDragEnd: () => void
}) {
  return (
    <IssueCard
      issue={issue}
      project={project}
      states={states}
      members={members}
      readOnly={readOnly}
      dragging={dragging}
      onOpen={() => onOpen(issue)}
      onDragStart={() => onDragStart(issue.id)}
      onDragEnd={onDragEnd}
      onPriorityChange={(p) => onPriorityChange(issue, p)}
      onStateChange={(stateId) => onMove(issue.id, stateId)}
      onAssigneeToggle={(member, assigned) =>
        onAssigneeToggle(issue, member, assigned)
      }
      onDelete={() => onDelete(issue)}
    />
  )
})

export function BoardView({
  states,
  issues,
  project,
  members,
  onCreate,
  onMove,
  onOpen,
  onPriorityChange,
  onAssigneeToggle,
  onDelete,
  readOnly = false,
}: BoardViewProps) {
  const { t } = useTranslation()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [composerFor, setComposerFor] = useState<string | null>(null)

  function endDrag() {
    setDraggingId(null)
    setDragOver(null)
  }

  function handleDrop(stateId: string) {
    if (draggingId) onMove(draggingId, stateId)
    setDraggingId(null)
    setDragOver(null)
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {states.map((state) => {
        const columnIssues = issues.filter((i) => i.state_id === state.id)
        const isOver = dragOver === state.id
        return (
          <div
            key={state.id}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragOver !== state.id) setDragOver(state.id)
            }}
            onDragLeave={(e) => {
              // Only clear when the cursor actually leaves the column bounds.
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragOver((s) => (s === state.id ? null : s))
            }}
            onDrop={() => !readOnly && handleDrop(state.id)}
            className={cn(
              'flex max-h-full w-72 shrink-0 flex-col rounded-xl border border-transparent bg-muted/40 transition-colors',
              // "На проверке" stands out: that's where the controller looks.
              state.group === 'review' &&
                'border-violet-300/60 bg-violet-50/60 dark:border-violet-500/30 dark:bg-violet-500/5',
              isOver && 'border-primary/40 bg-primary/5',
            )}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: state.color }}
              />
              <span className="text-sm font-medium text-foreground">
                {state.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {columnIssues.length}
              </span>
              <button
                type="button"
                onClick={() => setComposerFor(state.id)}
                className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t('Добавить задачу')}
              >
                <Plus size={15} />
              </button>
            </div>

            {/* Cards */}
            <ColumnScroll>
              {(scrollElement) => (
                <>
                  <VirtualStack
                    items={columnIssues}
                    getKey={(issue) => issue.id}
                    scrollElement={scrollElement}
                    estimateSize={() => CARD_HEIGHT}
                    gap={8}
                    render={(issue) => (
                      <BoardCard
                        issue={issue}
                        project={project}
                        states={states}
                        members={members}
                        readOnly={readOnly}
                        dragging={draggingId === issue.id}
                        onOpen={onOpen}
                        onDragStart={setDraggingId}
                        onDragEnd={endDrag}
                        onPriorityChange={onPriorityChange}
                        onMove={onMove}
                        onAssigneeToggle={onAssigneeToggle}
                        onDelete={onDelete}
                      />
                    )}
                  />

                  {composerFor === state.id ? (
                    <InlineComposer
                      placeholder={t('Что нужно сделать?')}
                      onCreate={(title) => onCreate(state.id, title)}
                      onClose={() => setComposerFor(null)}
                    />
                  ) : (
                    columnIssues.length === 0 && (
                      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                        {t('Нет задач')}
                      </p>
                    )
                  )}
                </>
              )}
            </ColumnScroll>

            {/* Column footer add */}
            {!readOnly && (
              <button
                type="button"
                onClick={() =>
                  setComposerFor((s) => (s === state.id ? null : state.id))
                }
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {composerFor === state.id ? (
                  <>
                    <X size={13} /> {t('Закрыть')}
                  </>
                ) : (
                  <>
                    <Plus size={13} /> {t('Новая задача')}
                  </>
                )}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
