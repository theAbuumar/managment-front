import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarRange,
  Crosshair,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { deadlineInfo } from '@/lib/deadline'
import { pluralize } from '@/lib/plural'
import type { State } from '@/api/state'
import type { Issue } from '@/api/issue'
import type { Project } from '@/api/project'
import type { ProjectRelation } from '@/api/relation'
import {
  addDays,
  dayLabel,
  dayNumber,
  dayOf,
  daysBetween,
  monthName,
  startOfWeek,
  today as todayIn,
  weekday,
} from './days'

interface TimelineViewProps {
  issues: Issue[]
  states: State[]
  project: Project | null
  timeZone: string
  /** «блокирует» links of the project (GET P/relations?type=blocks). */
  relations: ProjectRelation[]
  onOpen: (issue: Issue) => void
}

type Zoom = 'day' | 'week' | 'month'
/** Width of one day, px. */
const DAY_WIDTH: Record<Zoom, number> = { day: 32, week: 14, month: 5 }
const ROW = 36
const HEAD = 44

interface Row {
  issue: Issue
  key: string
  /** First and last day of the bar (inclusive). */
  start: string
  end: string
  /** Only one of the two dates is set: a one-day mark, not a span. */
  point: boolean
}

interface Arrow {
  id: string
  from: number
  to: number
  /** The blocked work starts before the blocking one is due. */
  broken: boolean
}

/**
 * Gantt chart of a project on CSS grid (7.F4, ADR-014): a bar from the start
 * date to the deadline per task, «блокирует» links as arrows. An arrow turns red
 * when the blocked task starts before the blocking one is due — the plan needs
 * a look. Dates are changed in the card or on the calendar.
 */
export function TimelineView({
  issues,
  states,
  project,
  timeZone,
  relations,
  onOpen,
}: TimelineViewProps) {
  const { t } = useTranslation()
  const today = todayIn(timeZone)
  const [zoom, setZoom] = useState<Zoom>('week')
  const scroller = useRef<HTMLDivElement | null>(null)
  const dayW = DAY_WIDTH[zoom]

  const stateById = useMemo(
    () => new Map(states.map((s) => [s.id, s])),
    [states],
  )
  const groupOf = (issue: Issue) =>
    issue.state?.group ?? stateById.get(issue.state_id)?.group
  const colorOf = (issue: Issue) =>
    issue.state?.color ??
    stateById.get(issue.state_id)?.color ??
    'var(--color-primary)'

  const { rows, undated } = useMemo(() => {
    const rows: Row[] = []
    let undated = 0
    for (const issue of issues) {
      const start = dayOf(issue.start_date, timeZone)
      const due = dayOf(issue.due_date, timeZone)
      if (!start && !due) {
        undated++
        continue
      }
      const a = start ?? due!
      const b = due ?? start!
      rows.push({
        issue,
        key: project
          ? `${project.identifier}-${issue.sequence_id}`
          : `#${issue.sequence_id}`,
        start: a <= b ? a : b,
        end: a <= b ? b : a,
        point: !start || !due,
      })
    }
    rows.sort(
      (x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end),
    )
    return { rows, undated }
  }, [issues, timeZone, project])

  // From the Monday before the earliest bar (or today) to a week past the latest.
  const { from, days } = useMemo(() => {
    let min = today
    let max = today
    for (const r of rows) {
      if (r.start < min) min = r.start
      if (r.end > max) max = r.end
    }
    const from = startOfWeek(addDays(min, -3))
    const days = Math.max(daysBetween(from, addDays(max, 7)) + 1, 35)
    return { from, days }
  }, [rows, today])

  const index = (day: string) => daysBetween(from, day)
  const rowOf = useMemo(
    () => new Map(rows.map((r, i) => [r.issue.id, i])),
    [rows],
  )

  const arrows = useMemo<Arrow[]>(
    () =>
      relations.flatMap((rel) => {
        if (rel.relation_type !== 'blocks') return []
        const a = rowOf.get(rel.issue_id)
        const b = rowOf.get(rel.related_issue_id)
        if (a === undefined || b === undefined) return []
        return [
          {
            id: rel.id,
            from: a,
            to: b,
            broken: rows[b]!.start <= rows[a]!.end,
          },
        ]
      }),
    [relations, rowOf, rows],
  )
  const brokenFor = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const arrow of arrows) {
      if (!arrow.broken) continue
      const blocked = rows[arrow.to]!.issue.id
      map.set(blocked, [...(map.get(blocked) ?? []), rows[arrow.from]!.key])
    }
    return map
  }, [arrows, rows])

  // Header: months over the whole range; days (or week starts) under them.
  const months = useMemo(() => {
    const spans: { label: string; start: number; length: number }[] = []
    for (let i = 0; i < days; i++) {
      const day = addDays(from, i)
      const label = `${monthName(day, zoom === 'month' ? 'short' : 'long')} ${day.slice(0, 4)}`
      const last = spans[spans.length - 1]
      if (last && last.label === label) last.length++
      else spans.push({ label, start: i, length: 1 })
    }
    return spans
  }, [from, days, zoom])

  function scrollToToday(smooth = true) {
    const el = scroller.current
    if (!el) return
    const x = index(today) * dayW - el.clientWidth / 3
    el.scrollTo({ left: Math.max(0, x), behavior: smooth ? 'smooth' : 'auto' })
  }
  // Open on today, and keep it in view when the scale changes.
  useEffect(() => {
    scrollToToday(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, from])

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title={t('Нет задач со сроками')}
        description={t(
          'Таймлайн строится по дате начала и сроку. Задайте их в карточке задачи.',
        )}
      />
    )
  }

  const width = days * dayW
  const todayX = (index(today) + 0.5) * dayW
  // The label column (--label) is narrower on a phone; bars keep their scale.
  const label = 'w-[var(--label)]'

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <div
          className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
          role="group"
          aria-label={t('Масштаб')}
        >
          {(
            [
              ['day', t('Дни')],
              ['week', t('Недели')],
              ['month', t('Месяцы')],
            ] as const
          ).map(([z, text]) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                zoom === z
                  ? 'bg-nav-active-bg text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {text}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => scrollToToday()}
        >
          <Crosshair size={14} />
          {t('Сегодня')}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {pluralize(rows.length, [t('задача'), t('задачи'), t('задач')])}
          {undated > 0 && ` · ${t('без дат: {{n}}', { n: undated })}`}
          {arrows.length > 0 &&
            ` · ${t('зависимостей: {{n}}', { n: arrows.length })}`}
        </span>
      </div>

      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-auto [--label:8rem] sm:[--label:16rem]"
        data-testid="timeline"
      >
        <div
          className="relative"
          style={{ width: `calc(${width}px + var(--label))` }}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex border-b border-border bg-background"
            style={{ height: HEAD }}
          >
            <div
              className={cn(
                label,
                'sticky left-0 z-10 flex shrink-0 items-end border-r border-border bg-background px-3 pb-1 text-[11px] font-medium uppercase text-muted-foreground',
              )}
            >
              {t('Задача')}
            </div>
            <div className="relative" style={{ width }}>
              <div
                className="grid h-1/2"
                style={{ gridTemplateColumns: `repeat(${days}, ${dayW}px)` }}
              >
                {months.map((m) => (
                  <div
                    key={m.start}
                    className="truncate border-l border-border px-1.5 pt-1 text-[11px] font-medium capitalize text-foreground"
                    style={{ gridColumn: `${m.start + 1} / span ${m.length}` }}
                  >
                    {m.length * dayW > 40 ? m.label : ''}
                  </div>
                ))}
              </div>
              {zoom !== 'month' && (
                <div
                  className="grid h-1/2"
                  style={{ gridTemplateColumns: `repeat(${days}, ${dayW}px)` }}
                >
                  {Array.from({ length: days }, (_, i) => {
                    const day = addDays(from, i)
                    if (zoom === 'week' && weekday(day) !== 0) return null
                    return (
                      <div
                        key={day}
                        className={cn(
                          'border-l border-border/60 pt-0.5 text-center text-[10px] text-muted-foreground',
                          day === today && 'font-semibold text-primary',
                          zoom === 'day' &&
                            weekday(day) >= 5 &&
                            'text-muted-foreground/60',
                        )}
                        style={{
                          gridColumn: `${i + 1} / span ${zoom === 'week' ? 7 : 1}`,
                        }}
                      >
                        {zoom === 'week' ? dayLabel(day) : dayNumber(day)}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {rows.map((row) => {
              const group = groupOf(row.issue)
              const info = deadlineInfo(
                row.issue.due_date,
                group,
                timeZone,
                row.issue.completed_at,
              )
              const closed = group === 'completed' || group === 'cancelled'
              const broken = brokenFor.get(row.issue.id)
              const length = daysBetween(row.start, row.end) + 1
              const color = colorOf(row.issue)
              const title = [
                `${row.key} · ${row.issue.title}`,
                row.point
                  ? dayLabel(row.end)
                  : `${dayLabel(row.start)} — ${dayLabel(row.end)}`,
                info.label,
                broken &&
                  t('Начинается раньше срока блокирующей: {{keys}}', {
                    keys: broken.join(', '),
                  }),
              ]
                .filter(Boolean)
                .join('\n')
              return (
                <div
                  key={row.issue.id}
                  className="flex border-b border-border/60"
                  style={{ height: ROW }}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(row.issue)}
                    className={cn(
                      label,
                      'sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-background px-3 text-left text-xs hover:bg-muted',
                    )}
                    title={title}
                  >
                    <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                      {row.key}
                    </span>
                    {row.issue.kind === 'assignment' && (
                      <ShieldCheck
                        size={12}
                        className="shrink-0 text-primary"
                        aria-label={t('Поручение')}
                      />
                    )}
                    <span
                      className={cn(
                        'truncate text-foreground',
                        closed && 'text-muted-foreground line-through',
                      )}
                    >
                      {row.issue.title}
                    </span>
                    {broken && (
                      <AlertTriangle
                        size={13}
                        className="ml-auto shrink-0 text-amber-600"
                        aria-label={t('Нарушена зависимость')}
                      />
                    )}
                  </button>
                  <div
                    className="relative grid items-center"
                    style={{
                      width,
                      gridTemplateColumns: `repeat(${days}, ${dayW}px)`,
                      // Weekends shaded (the range starts on a Monday).
                      backgroundImage:
                        zoom === 'month'
                          ? undefined
                          : `repeating-linear-gradient(to right, transparent 0 ${5 * dayW}px, color-mix(in oklab, var(--color-muted) 45%, transparent) ${5 * dayW}px ${7 * dayW}px)`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(row.issue)}
                      title={title}
                      data-bar={row.key}
                      className={cn(
                        'relative z-[1] flex h-6 min-w-0 items-center overflow-hidden rounded-md px-1.5 text-left text-[11px] font-medium text-foreground ring-1 transition-shadow hover:shadow-md',
                        row.point && 'justify-center px-0',
                        info.tone === 'overdue'
                          ? 'ring-red-500'
                          : 'ring-black/10 dark:ring-white/15',
                        closed && 'opacity-60',
                      )}
                      style={{
                        gridColumn: `${index(row.start) + 1} / span ${length}`,
                        background: `color-mix(in oklab, ${color} 35%, var(--color-background))`,
                        borderLeft: `3px solid ${color}`,
                        minWidth: row.point ? Math.max(dayW, 10) : undefined,
                      }}
                    >
                      {!row.point && length * dayW > 70 && (
                        <span className="truncate">{row.issue.title}</span>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Today line and dependency arrows, under the bars: an elbow passing other rows hides behind their bars */}
            <svg
              className="pointer-events-none absolute top-0 z-0 overflow-visible"
              style={{ left: 'var(--label)', width, height: rows.length * ROW }}
              aria-hidden
            >
              <defs>
                <marker
                  id="tl-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path
                    d="M0,0 L8,4 L0,8 z"
                    fill="var(--color-muted-foreground)"
                  />
                </marker>
                <marker
                  id="tl-arrow-red"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--color-destructive)" />
                </marker>
              </defs>
              <line
                x1={todayX}
                x2={todayX}
                y1={0}
                y2={rows.length * ROW}
                stroke="var(--color-primary)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              {arrows.map((arrow) => {
                const a = rows[arrow.from]!
                const b = rows[arrow.to]!
                const x1 = (index(a.end) + 1) * dayW
                const y1 = arrow.from * ROW + ROW / 2
                const x2 = index(b.start) * dayW
                const y2 = arrow.to * ROW + ROW / 2
                // Straight elbow when there is room; otherwise around, between the rows.
                const d =
                  x2 - x1 >= 12
                    ? `M${x1},${y1} H${x1 + 6} V${y2} H${x2}`
                    : `M${x1},${y1} H${x1 + 6} V${(arrow.from < arrow.to ? arrow.to : arrow.to + 1) * ROW} H${x2 - 8} V${y2} H${x2}`
                return (
                  <path
                    key={arrow.id}
                    d={d}
                    fill="none"
                    stroke={
                      arrow.broken
                        ? 'var(--color-destructive)'
                        : 'var(--color-muted-foreground)'
                    }
                    strokeWidth={1.25}
                    markerEnd={`url(#${arrow.broken ? 'tl-arrow-red' : 'tl-arrow'})`}
                    opacity={0.85}
                  />
                )
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
