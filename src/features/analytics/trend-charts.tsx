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
import type { TrendPoint } from '@/api/analytics'
import { bucketLabel, fmt, pct } from './format'

// Trend charts of the analytics views (Ф10), on recharts. Kept apart from the
// tiles and lists in ./charts so a page that only shows numbers (home, a
// department) doesn't load the chart library (12.F4).

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
