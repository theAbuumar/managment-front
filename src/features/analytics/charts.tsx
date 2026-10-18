import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Table2,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Delta } from './format'

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
