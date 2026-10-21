import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { getCycleBurndown, type Burndown, type BurndownDay } from '@/api/cycle'
import { getModuleBurndown } from '@/api/module'
import { errorText } from '@/lib/errorMessages'
import { pluralize } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { ScopeKind } from './scopes'

// График сгорания и накопления этапа или модуля (Ф10 10.F5, ADR-032). One axis
// (issues), so the two views share it: «Сгорание» — what is left against the
// ideal line, «Накопление» — the scope against what is done. Its own chunk with
// the chart library, loaded when the board's banner opens it (12.F4).

type Mode = 'burndown' | 'burnup'

const axis = { fill: 'var(--viz-axis)', fontSize: 11 }

/** "2026-10-21" → "21.10". */
const dayMonth = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`

/** "2026-10-21" → "21 октября". */
const longDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  })

interface TooltipArgs {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      className="inline-block h-0 w-4 shrink-0 border-t-2"
      style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }}
    />
  )
}

function Point({ day, mode }: { day: BurndownDay; mode: Mode }) {
  const { t } = useTranslation()
  const rows: {
    color: string
    dashed?: boolean
    label: string
    value: number | null
  }[] =
    mode === 'burndown'
      ? [
          { color: 'var(--viz-1)', label: t('Осталось'), value: day.remaining },
          {
            color: 'var(--viz-axis)',
            dashed: true,
            label: t('По плану'),
            value: day.ideal,
          },
        ]
      : [
          { color: 'var(--viz-2)', label: t('В составе'), value: day.scope },
          { color: 'var(--viz-1)', label: t('Готово'), value: day.done },
        ]
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{longDay(day.date)}</p>
      {rows
        .filter((r) => r.value !== null)
        .map((r) => (
          <p
            key={r.label}
            className="flex items-center gap-1.5 text-muted-foreground"
          >
            <Swatch color={r.color} dashed={r.dashed} />
            {r.label}:{' '}
            <span className="font-medium tabular-nums text-foreground">
              {r.value!.toLocaleString('ru-RU')}
            </span>
          </p>
        ))}
      {day.scope === null && (
        <p className="text-muted-foreground">{t('Этот день ещё впереди')}</p>
      )}
    </div>
  )
}

/** The chart of one cycle or module; `version` reloads it (the board changed). */
export function BurndownChart({
  kind,
  slug,
  projectId,
  id,
  version,
}: {
  kind: ScopeKind
  slug: string
  projectId: string
  id: string
  version: string
}) {
  const { t } = useTranslation()
  const [data, setData] = useState<Burndown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('burndown')

  useEffect(() => {
    let cancelled = false
    const load = kind === 'cycle' ? getCycleBurndown : getModuleBurndown
    load(slug, projectId, id).then(
      (b) => {
        if (cancelled) return
        setData(b)
        setError(null)
      },
      (err) =>
        !cancelled &&
        setError(errorText(err, t('Не удалось построить график'))),
    )
    return () => {
      cancelled = true
    }
  }, [kind, slug, projectId, id, version, t])

  if (error)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <AlertCircle size={16} />
        {error}
      </p>
    )
  if (!data)
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-44 w-full" />
      </div>
    )

  const { current } = data
  const left = pluralize(current.remaining, [
    t('задача'),
    t('задачи'),
    t('задач'),
  ])
  const showsToday = data.today >= data.from && data.today <= data.to
  const idealToday = data.days.find((d) => d.date === data.today)?.ideal ?? null
  // Ahead of the plan or behind it, today.
  const pace =
    idealToday === null || !showsToday
      ? null
      : current.remaining <= idealToday
        ? { text: t('Идём по плану или быстрее'), behind: false }
        : {
            text: t('Отстаём от плана на {{n}}', {
              n: pluralize(Math.ceil(current.remaining - idealToday), [
                t('задачу'),
                t('задачи'),
                t('задач'),
              ]),
            }),
            behind: true,
          }
  const ariaLabel =
    mode === 'burndown'
      ? t('График сгорания: осталось задач по дням и линия плана')
      : t('График накопления: задач в составе и готово по дням')

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-foreground">
          <span className="font-semibold tabular-nums">
            {t('Осталось {{left}}', { left })}
          </span>
          <span className="text-muted-foreground">
            {' '}
            {t('из {{scope}} · готово {{pct}}%', {
              scope: current.scope,
              pct: current.completion_percentage,
            })}
          </span>
        </p>
        {pace && (
          <span
            className={cn(
              'text-xs',
              pace.behind ? 'text-destructive' : 'text-[var(--viz-good-text)]',
            )}
          >
            {pace.text}
          </span>
        )}
        <div
          role="radiogroup"
          aria-label={t('Вид графика')}
          className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5"
        >
          {(
            [
              { key: 'burndown', label: t('Сгорание') },
              { key: 'burnup', label: t('Накопление') },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                mode === m.key
                  ? 'bg-nav-active-bg text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {mode === 'burndown' ? (
          <>
            <span className="flex items-center gap-1.5">
              <Swatch color="var(--viz-1)" />
              {t('Осталось')}
            </span>
            {data.has_ideal && (
              <span className="flex items-center gap-1.5">
                <Swatch color="var(--viz-axis)" dashed />
                {t('По плану')}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <Swatch color="var(--viz-2)" />
              {t('В составе')}
            </span>
            <span className="flex items-center gap-1.5">
              <Swatch color="var(--viz-1)" />
              {t('Готово')}
            </span>
          </>
        )}
      </div>

      <div className="h-48 sm:h-56" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data.days}
            margin={{ top: 12, right: 12, bottom: 0, left: -18 }}
          >
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis
              dataKey="date"
              tickFormatter={dayMonth}
              tick={axis}
              tickLine={false}
              axisLine={{ stroke: 'var(--viz-grid)' }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={axis}
              tickLine={false}
              axisLine={false}
            />
            {showsToday && (
              <ReferenceLine
                x={data.today}
                stroke="var(--viz-axis)"
                strokeDasharray="2 3"
                label={{
                  value: t('Сегодня'),
                  position: 'insideTopRight',
                  fill: 'var(--viz-axis)',
                  fontSize: 11,
                }}
              />
            )}
            <Tooltip
              cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
              content={(args: TooltipArgs) => {
                const day = args.active
                  ? (args.payload?.[0]?.payload as BurndownDay | undefined)
                  : undefined
                return day ? <Point day={day} mode={mode} /> : null
              }}
            />
            {mode === 'burndown' ? (
              <>
                {data.has_ideal && (
                  <Line
                    type="linear"
                    dataKey="ideal"
                    stroke="var(--viz-axis)"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  type="linear"
                  dataKey="remaining"
                  stroke="var(--viz-1)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: 'var(--viz-1)',
                    stroke: 'var(--card)',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </>
            ) : (
              <>
                <Line
                  type="stepAfter"
                  dataKey="scope"
                  stroke="var(--viz-2)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: 'var(--viz-2)',
                    stroke: 'var(--card)',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="done"
                  stroke="var(--viz-1)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: 'var(--viz-1)',
                    stroke: 'var(--card)',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!data.has_ideal && (
        <p className="mt-2 text-xs text-muted-foreground">
          {kind === 'cycle'
            ? t(
                'Линия плана появится, когда у этапа будут даты начала и окончания.',
              )
            : t(
                'Линия плана появится, когда у модуля будут дата начала и целевая дата.',
              )}
        </p>
      )}

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          {t('Показать таблицей')}
        </summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1 font-medium">
                  {t('День')}
                </th>
                <th scope="col" className="px-2 py-1 text-right font-medium">
                  {t('В составе')}
                </th>
                <th scope="col" className="px-2 py-1 text-right font-medium">
                  {t('Готово')}
                </th>
                <th scope="col" className="px-2 py-1 text-right font-medium">
                  {t('Осталось')}
                </th>
                {data.has_ideal && (
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    {t('По плану')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.days
                .filter((d) => d.scope !== null)
                .map((d) => (
                  <tr key={d.date} className="border-t border-border">
                    <td className="px-2 py-1">{dayMonth(d.date)}</td>
                    <td className="px-2 py-1 text-right">{d.scope}</td>
                    <td className="px-2 py-1 text-right">{d.done}</td>
                    <td className="px-2 py-1 text-right">{d.remaining}</td>
                    {data.has_ideal && (
                      <td className="px-2 py-1 text-right">
                        {d.ideal?.toLocaleString('ru-RU')}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
