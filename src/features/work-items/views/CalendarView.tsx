import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { deadlineInfo } from '@/lib/deadline'
import { pluralize } from '@/lib/plural'
import type { State } from '@/api/state'
import type { Issue } from '@/api/issue'
import type { Project } from '@/api/project'
import {
  addMonths,
  dayLabel,
  dayNumber,
  dayOf,
  monthTitle,
  monthWeeks,
  today as todayIn,
  weekday,
} from './days'

interface CalendarViewProps {
  issues: Issue[]
  states: State[]
  project: Project | null
  timeZone: string
  /** May this person move the deadline (a task, or an assignment they control)? */
  canMove: (issue: Issue) => boolean
  /** A card was dropped on `day` ("YYYY-MM-DD"). */
  onDueChange: (issue: Issue, day: string) => void
  onOpen: (issue: Issue) => void
}

/** Chips a day cell shows before «ещё N» (desktop). */
const CELL_LIMIT = 3

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// A deadline chip in a day cell or in the side list: state colour, key, title.
// Overdue work is red, closed work is struck through.
const CalendarChip = memo(function CalendarChip({
  issue,
  group,
  color,
  identifier,
  timeZone,
  draggable,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  wide = false,
}: {
  issue: Issue
  group: State['group'] | undefined
  color: string | undefined
  identifier: string
  timeZone: string
  draggable: boolean
  dragging: boolean
  onOpen: (issue: Issue) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  wide?: boolean
}) {
  const { t } = useTranslation()
  const info = deadlineInfo(issue.due_date, group, timeZone, issue.completed_at)
  const closed = group === 'completed' || group === 'cancelled'
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', issue.id)
        onDragStart(issue.id)
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(issue)
      }}
      title={[`${identifier} · ${issue.title}`, info.label]
        .filter(Boolean)
        .join('\n')}
      data-issue={identifier}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded border-l-[3px] bg-background px-1.5 py-0.5 text-left text-xs shadow-xs ring-1 ring-border transition-colors hover:bg-muted',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        info.tone === 'overdue' &&
          'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
        closed && 'text-muted-foreground line-through',
        dragging && 'opacity-40',
        wide && 'py-1.5 text-sm',
      )}
      style={{ borderLeftColor: color }}
    >
      {issue.kind === 'assignment' && (
        <ShieldCheck
          size={wide ? 13 : 11}
          className="shrink-0 text-primary"
          aria-label={t('Поручение')}
        />
      )}
      {wide && (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {identifier}
        </span>
      )}
      <span className="truncate">{issue.title}</span>
    </button>
  )
})

/**
 * Month grid of deadlines (7.F4). A card dropped on another day moves the
 * deadline; work without a deadline waits in the side list and gets one the same
 * way. An assignment's deadline moves only by its controller (5.B5) — others ask
 * for a deadline change from the card.
 */
export function CalendarView({
  issues,
  states,
  project,
  timeZone,
  canMove,
  onDueChange,
  onOpen,
}: CalendarViewProps) {
  const { t } = useTranslation()
  const today = todayIn(timeZone)
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [selected, setSelected] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const stateById = useMemo(
    () => new Map(states.map((s) => [s.id, s])),
    [states],
  )
  const { byDay, unscheduled } = useMemo(() => {
    const byDay = new Map<string, Issue[]>()
    const unscheduled: Issue[] = []
    for (const issue of issues) {
      const day = dayOf(issue.due_date, timeZone)
      if (!day) {
        unscheduled.push(issue)
        continue
      }
      byDay.set(day, [...(byDay.get(day) ?? []), issue])
    }
    return { byDay, unscheduled }
  }, [issues, timeZone])

  const weeks = useMemo(() => monthWeeks(month), [month])
  const inMonth = weeks.flat().filter((d) => d.startsWith(month))
  const monthCount = inMonth.reduce(
    (n, d) => n + (byDay.get(d)?.length ?? 0),
    0,
  )

  const issueById = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues],
  )
  const key = (issue: Issue) =>
    project
      ? `${project.identifier}-${issue.sequence_id}`
      : `#${issue.sequence_id}`
  const groupOf = (issue: Issue) =>
    issue.state?.group ?? stateById.get(issue.state_id)?.group
  const colorOf = (issue: Issue) =>
    issue.state?.color ?? stateById.get(issue.state_id)?.color

  function endDrag() {
    setDraggingId(null)
    setDragOver(null)
  }

  function drop(day: string, id: string | undefined) {
    const issue = id ? issueById.get(id) : undefined
    endDrag()
    if (!issue || !canMove(issue) || dayOf(issue.due_date, timeZone) === day)
      return
    onDueChange(issue, day)
  }

  const chip = (issue: Issue, wide = false) => (
    <CalendarChip
      key={issue.id}
      issue={issue}
      group={groupOf(issue)}
      color={colorOf(issue)}
      identifier={key(issue)}
      timeZone={timeZone}
      draggable={canMove(issue)}
      dragging={draggingId === issue.id}
      onOpen={onOpen}
      onDragStart={setDraggingId}
      onDragEnd={endDrag}
      wide={wide}
    />
  )

  const selectedIssues = selected ? (byDay.get(selected) ?? []) : []

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3 sm:p-4">
        {/* Month navigation */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              aria-label={t('Предыдущий месяц')}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label={t('Следующий месяц')}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
          <h2
            className="text-base font-semibold capitalize text-foreground"
            data-testid="calendar-month"
          >
            {monthTitle(month)}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t('сроков в месяце: {{n}}', { n: monthCount })}
          </span>
          {month !== today.slice(0, 7) && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-8"
              onClick={() => setMonth(today.slice(0, 7))}
            >
              {t('Сегодня')}
            </Button>
          )}
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-border pb-1 text-center text-[11px] font-medium uppercase text-muted-foreground">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className={cn(i >= 5 && 'text-muted-foreground/70')}>
              {t(d)}
            </span>
          ))}
        </div>

        {/* Month grid */}
        <div
          className="grid flex-1 grid-cols-7 border-l border-border"
          style={{
            gridTemplateRows: `repeat(${weeks.length}, minmax(4.5rem, 1fr))`,
          }}
        >
          {weeks.flat().map((day) => {
            const dayIssues = byDay.get(day) ?? []
            const outside = !day.startsWith(month)
            const isToday = day === today
            const overdue = dayIssues.filter(
              (i) =>
                deadlineInfo(i.due_date, groupOf(i), timeZone).tone ===
                'overdue',
            ).length
            return (
              <div
                key={day}
                role="gridcell"
                data-day={day}
                aria-label={dayLabel(day)}
                aria-selected={selected === day}
                onClick={() => setSelected((s) => (s === day ? null : day))}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOver !== day) setDragOver(day)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                    setDragOver((d) => (d === day ? null : d))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  drop(
                    day,
                    e.dataTransfer.getData('text/plain') ||
                      draggingId ||
                      undefined,
                  )
                }}
                className={cn(
                  'flex min-w-0 cursor-pointer flex-col gap-1 border-r border-b border-border p-1 transition-colors',
                  weekday(day) >= 5 && 'bg-muted/30',
                  outside && 'bg-muted/50 text-muted-foreground/60',
                  selected === day &&
                    'bg-primary/5 ring-1 ring-inset ring-primary/40',
                  dragOver === day &&
                    'bg-primary/10 ring-2 ring-inset ring-primary/50',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-xs',
                      isToday &&
                        'bg-primary font-semibold text-primary-foreground',
                    )}
                  >
                    {dayNumber(day)}
                  </span>
                  {/* Phone: dots instead of chips */}
                  {dayIssues.length > 0 && (
                    <span
                      className={cn(
                        'rounded px-1 text-[10px] font-medium md:hidden',
                        overdue > 0
                          ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {dayIssues.length}
                    </span>
                  )}
                </div>
                <div className="hidden min-w-0 flex-col gap-1 md:flex">
                  {dayIssues.slice(0, CELL_LIMIT).map((i) => chip(i))}
                  {dayIssues.length > CELL_LIMIT && (
                    <span className="px-1 text-[11px] font-medium text-primary">
                      {t('ещё {{n}}', { n: dayIssues.length - CELL_LIMIT })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Side list: the chosen day, and work without a deadline (drag it onto a day). */}
      <aside className="flex max-h-[45%] shrink-0 flex-col gap-4 overflow-y-auto border-t border-border p-3 lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l">
        {selected && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              {dayLabel(selected)}
              <span className="ml-1.5 font-normal text-muted-foreground">
                {pluralize(selectedIssues.length, [
                  t('срок'),
                  t('срока'),
                  t('сроков'),
                ])}
              </span>
            </h3>
            {selectedIssues.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('В этот день сроков нет.')}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {selectedIssues.map((i) => chip(i, true))}
              </div>
            )}
          </section>
        )}
        <section>
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarX2 size={14} className="text-muted-foreground" />
            {t('Без срока')}
            <span className="font-normal text-muted-foreground">
              {unscheduled.length}
            </span>
          </h3>
          {unscheduled.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('У всех задач есть срок.')}
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('Перетащите задачу на день, чтобы назначить срок.')}
              </p>
              <div className="flex flex-col gap-1.5">
                {unscheduled.map((i) => chip(i, true))}
              </div>
            </>
          )}
        </section>
      </aside>
    </div>
  )
}
