import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Table2,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrendPoint } from '@/api/analytics'
import { bucketLabel, fmt, pct, type Delta } from './format'

// Building blocks of the analytics views (Ф10), following the dataviz method:
// one validated categorical pair (--viz-1 / --viz-2), the status red only for
// overdue (always with an icon and a label), thin marks, recessive grid, a
// hover tooltip on every chart and a table view of the same numbers.

// ─── Stat tile ────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  critical,
  onClick,
}: {
  label: string
  value: string
  delta?: Delta | null
  hint?: string
  icon: LucideIcon
  /** Overdue-like figure that is not zero: shown with the status colour. */
  critical?: boolean
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const DeltaIcon =
    !delta || delta.good === null
      ? Minus
      : delta.text.startsWith('+')
        ? ArrowUpRight
        : ArrowDownRight
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon
          size={14}
          className={critical ? 'text-[var(--viz-critical)]' : undefined}
          aria-hidden
        />
        {label}
      </span>
      <span className="mt-1 block text-2xl font-semibold text-foreground">
        {value}
      </span>
      {delta && (
        <span
          className={cn(
            'mt-0.5 flex items-center gap-0.5 text-xs',
            delta.good === null
              ? 'text-muted-foreground'
              : delta.good
                ? 'text-[var(--viz-good-text)]'
                : 'text-[var(--viz-critical)]',
          )}
        >
          <DeltaIcon size={13} aria-hidden />
          <span
            className="whitespace-nowrap"
            title={t('К прошлому периоду такой же длины')}
          >
            {delta.text}
          </span>
        </span>
      )}
      {hint && (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </>
  )
  const cls =
    'rounded-xl border border-border bg-card p-3 text-left print-break-avoid'
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(cls, 'transition-colors hover:border-primary/40')}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

// ─── Card with a chart / table switch ─────────────────────────────────────────

export function ChartCard({
  title,
  subtitle,
  actions,
  table,
  children,
  className,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** The same numbers as a table (accessibility, print, exact values). */
  table?: ReactNode
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const [asTable, setAsTable] = useState(false)
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card p-4 print-break-avoid',
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions}
        {table && (
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted print-hidden"
            aria-pressed={asTable}
          >
            {asTable ? <BarChart3 size={13} /> : <Table2 size={13} />}
            {asTable ? t('График') : t('Таблица')}
          </button>
        )}
      </div>
      {asTable ? table : children}
    </section>
  )
}

export function DataTable({
  head,
  rows,
}: {
  head: string[]
  rows: (string | number)[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th
                key={h}
                className={cn('px-2 py-1.5 font-medium', i > 0 && 'text-right')}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={cn(
                    'px-2 py-1.5',
                    j > 0 && 'text-right tabular-nums',
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Horizontal bar list (ratings) ────────────────────────────────────────────

export interface BarRow {
  id: string
  label: string
  /** 0…max; null = nothing to rate (shown as a dash, no bar). */
  value: number | null
  valueText: string
  /** Secondary figure after the bar, e.g. "3 просрочено". */
  note?: string
  noteCritical?: boolean
  tooltip?: string
  onClick?: () => void
  onNoteClick?: () => void
}

/** Ranked horizontal bars: ≤ 24px thick, 4px rounded end, value at the tip. */
export function BarList({ rows, max }: { rows: BarRow[]; max: number }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li
          key={r.id}
          className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,14rem)_1fr_auto]"
        >
          <button
            type="button"
            onClick={r.onClick}
            disabled={!r.onClick}
            className="truncate text-left text-sm text-foreground hover:text-primary disabled:hover:text-foreground"
            title={r.label}
          >
            {r.label}
          </button>
          <button
            type="button"
            onClick={r.onClick}
            disabled={!r.onClick}
            title={r.tooltip}
            className="group flex h-6 items-center gap-1.5"
          >
            {r.value !== null && (
              <span
                className="h-4 rounded-r-[4px] bg-[var(--viz-1)] transition-opacity group-hover:opacity-80"
                style={{
                  width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`,
                }}
              />
            )}
            <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
              {r.valueText}
            </span>
          </button>
          {r.note ? (
            <button
              type="button"
              onClick={r.onNoteClick}
              disabled={!r.onNoteClick}
              className={cn(
                'shrink-0 text-right text-xs tabular-nums',
                r.noteCritical
                  ? 'text-[var(--viz-critical)] hover:underline'
                  : 'text-muted-foreground',
              )}
            >
              {r.note}
            </button>
          ) : (
            <span />
          )}
        </li>
      ))}
    </ul>
  )
}

// ─── Trend charts ─────────────────────────────────────────────────────────────

const axis = { fill: 'var(--viz-axis)', fontSize: 11 }

function TooltipBox({
  title,
  lines,
}: {
  title: string
  lines: { swatch?: string; label: string; value: string }[]
}) {
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      {lines.map((l) => (
        <p
          key={l.label}
          className="flex items-center gap-1.5 text-muted-foreground"
        >
          {l.swatch && (
            <span
              className="size-2 rounded-full"
              style={{ background: l.swatch }}
            />
          )}
          {l.label}:{' '}
          <span className="font-medium text-foreground">{l.value}</span>
        </p>
      ))}
    </div>
  )
}

interface TooltipArgs {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
}

/** The trend point under the cursor, if any. */
const pointOf = ({ active, payload }: TooltipArgs) =>
  active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined

const range = (p: TrendPoint) =>
  `${p.from.split('-').reverse().join('.')} — ${p.to.split('-').reverse().join('.')}`

/** Discipline % by week or month — one series, so no legend: the title names it. */
export function DisciplineTrend({
  items,
  bucket,
  height = 200,
}: {
  items: TrendPoint[]
  bucket: 'week' | 'month'
  height?: number
}) {
  const { t } = useTranslation()
  const data = items.map((p) => ({ ...p, label: bucketLabel(p.key, bucket) }))
  return (
    <div
      style={{ height }}
      role="img"
      aria-label={t('Исполнительская дисциплина по периодам')}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
        >
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="label"
            tick={axis}
            tickLine={false}
            axisLine={{ stroke: 'var(--viz-grid)' }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={axis}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip
            cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
            content={(args: TooltipArgs) => {
              const p = pointOf(args)
              return p ? (
                <TooltipBox
                  title={range(p)}
                  lines={[
                    {
                      swatch: 'var(--viz-1)',
                      label: t('Дисциплина'),
                      value: pct(p.discipline),
                    },
                    { label: t('Исполнено в срок'), value: fmt(p.on_time) },
                    { label: t('С опозданием'), value: fmt(p.late) },
                  ]}
                />
              ) : null
            }}
          />
          <Line
            type="linear"
            dataKey="discipline"
            stroke="var(--viz-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls
            dot={{
              r: 4,
              fill: 'var(--viz-1)',
              stroke: 'var(--card)',
              strokeWidth: 2,
            }}
            activeDot={{
              r: 5,
              fill: 'var(--viz-1)',
              stroke: 'var(--card)',
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Completed work per bucket, on time vs late — two series, so a legend. */
export function CompletedTrend({
  items,
  bucket,
  onBucketClick,
  height = 200,
}: {
  items: TrendPoint[]
  bucket: 'week' | 'month'
  onBucketClick?: (p: TrendPoint) => void
  height?: number
}) {
  const { t } = useTranslation()
  const data = items.map((p) => ({ ...p, label: bucketLabel(p.key, bucket) }))
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--viz-1)]" />
          {t('В срок')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--viz-2)]" />
          {t('С опозданием')}
        </span>
      </div>
      <div
        style={{ height }}
        role="img"
        aria-label={t('Исполнено в срок и с опозданием по периодам')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
          >
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis
              dataKey="label"
              tick={axis}
              tickLine={false}
              axisLine={{ stroke: 'var(--viz-grid)' }}
            />
            <YAxis
              allowDecimals={false}
              tick={axis}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              content={(args: TooltipArgs) => {
                const p = pointOf(args)
                return p ? (
                  <TooltipBox
                    title={range(p)}
                    lines={[
                      {
                        swatch: 'var(--viz-1)',
                        label: t('В срок'),
                        value: fmt(p.on_time),
                      },
                      {
                        swatch: 'var(--viz-2)',
                        label: t('С опозданием'),
                        value: fmt(p.late),
                      },
                    ]}
                  />
                ) : null
              }}
            />
            <Bar
              dataKey="on_time"
              stackId="done"
              fill="var(--viz-1)"
              stroke="var(--card)"
              strokeWidth={2}
              maxBarSize={24}
              isAnimationActive={false}
              cursor={onBucketClick ? 'pointer' : undefined}
              onClick={(d: { payload?: TrendPoint }) =>
                d.payload && onBucketClick?.(d.payload)
              }
            />
            <Bar
              dataKey="late"
              stackId="done"
              fill="var(--viz-2)"
              stroke="var(--card)"
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
              cursor={onBucketClick ? 'pointer' : undefined}
              onClick={(d: { payload?: TrendPoint }) =>
                d.payload && onBucketClick?.(d.payload)
              }
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
