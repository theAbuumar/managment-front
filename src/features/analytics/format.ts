import { t } from '@/i18n'
import type { AnalyticsFilters, Counters } from '@/api/analytics'

// Formatting and periods shared by the analytics page, the home dashboard and
// the drill-down list (Ф10). Numbers in ru-RU, deltas against the previous
// period of the same length (the backend's `previous`).

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

export const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : nf.format(n)
export const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${nf.format(n)} %`

/** "18.09 — 17.10.2026" */
export function periodLabel(p: { from: string; to: string }): string {
  const [fy, fm, fd] = p.from.split('-')
  const [ty, tm, td] = p.to.split('-')
  return fy === ty
    ? `${fd}.${fm} — ${td}.${tm}.${ty}`
    : `${fd}.${fm}.${fy} — ${td}.${tm}.${ty}`
}

export interface Delta {
  text: string
  /** Did it get better? null = no change or nothing to compare. */
  good: boolean | null
}

/**
 * Signed change against the previous period. `upIsGood` says whether a rise is
 * an improvement (discipline: yes, overdue: no). Percent values change in п. п.
 */
export function delta(
  cur: number | null,
  prev: number | null,
  { upIsGood, points = false }: { upIsGood: boolean; points?: boolean },
): Delta | null {
  if (cur === null || prev === null) return null
  const d = Math.round((cur - prev) * 10) / 10
  if (d === 0) return { text: t('без изменений'), good: null }
  const sign = d > 0 ? '+' : '−'
  const value = `${sign}${nf.format(Math.abs(d))}${points ? ' п. п.' : ''}`
  return { text: value, good: d > 0 === upIsGood }
}

/** Local date of the browser as YYYY-MM-DD. */
export function todayLocal(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export type PresetKey = '30d' | 'month' | 'prev_month' | 'quarter' | 'year'

export const PRESETS: { key: PresetKey; label: () => string }[] = [
  { key: '30d', label: () => t('30 дней') },
  { key: 'month', label: () => t('Этот месяц') },
  { key: 'prev_month', label: () => t('Прошлый месяц') },
  { key: 'quarter', label: () => t('Квартал') },
  { key: 'year', label: () => t('Год') },
]

/** Period of a preset in the workspace zone. */
export function presetPeriod(
  key: PresetKey,
  timeZone: string,
): { from: string; to: string } {
  const today = todayLocal(timeZone)
  const [y, m] = today.split('-').map(Number) as [number, number]
  const monthStart = (yy: number, mm: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-01`
  switch (key) {
    case 'month':
      return { from: monthStart(y, m), to: today }
    case 'prev_month': {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1]
      return { from: monthStart(py, pm), to: shift(monthStart(y, m), -1) }
    }
    case 'quarter': {
      const qm = Math.floor((m - 1) / 3) * 3 + 1
      return { from: monthStart(y, qm), to: today }
    }
    case 'year':
      return { from: `${y}-01-01`, to: today }
    default:
      return { from: shift(today, -29), to: today }
  }
}

/** Short label of a trend bucket: "28.09" (week start) or "окт." (month). */
export function bucketLabel(key: string, bucket: 'week' | 'month'): string {
  const d = new Date(`${key}T00:00:00Z`)
  return bucket === 'month'
    ? d.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' })
    : d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
      })
}

/** Is there anything to show for these counters. */
export const hasWork = (c: Counters) => c.created + c.completed + c.open > 0

/**
 * Link into the drill-down list (10.F2, GET WS/issues): the same department /
 * project / kind as the chart plus what was clicked.
 */
export function issuesLink(
  filters: AnalyticsFilters,
  what: {
    overdue?: boolean
    open?: boolean
    assignee?: string
    department?: string
    project?: string
    completed?: { from: string; to: string }
    title: string
  },
): string {
  const q = new URLSearchParams()
  const department = what.department ?? filters.department
  const project = what.project ?? filters.project
  if (department) q.set('department', department)
  if (project) q.set('project', project)
  if (filters.kind) q.set('kind', filters.kind)
  if (what.overdue) q.set('overdue', 'true')
  if (what.open) q.set('open', 'true')
  if (what.assignee) q.set('assignee', what.assignee)
  if (what.completed) {
    q.set('completed_from', what.completed.from)
    q.set('completed_to', what.completed.to)
  }
  q.set('title', what.title)
  return `/issues?${q.toString()}`
}

/** UTC instant (ISO) at which local date `date` begins in `timeZone` — for API date filters. */
export function startOfLocalDayIso(date: string, timeZone: string): string {
  const guess = new Date(`${date}T00:00:00Z`)
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(guess)
      .map((x) => [x.type, x.value]),
  )
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
  )
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString()
}

export const nextDay = (date: string) => shift(date, 1)
