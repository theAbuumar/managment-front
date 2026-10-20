// Calendar-day arithmetic for the calendar and the timeline (7.F4). A day is a
// "YYYY-MM-DD" key in the workspace time zone — the same calendar day a deadline
// means (end of that day there, lib/deadline) — and arithmetic runs on UTC
// midnights, so no daylight-saving shift can skip or repeat a day.

import { isoToDateInput } from '@/lib/dates'

const DAY_MS = 86_400_000

/** The calendar day of an instant in `timeZone`; null for no date. */
export function dayOf(
  iso: string | null | undefined,
  timeZone: string,
): string | null {
  return iso ? isoToDateInput(iso, timeZone) : null
}

export function today(timeZone: string): string {
  return isoToDateInput(new Date().toISOString(), timeZone)
}

function toUtc(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS)
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

/** 0 = Monday … 6 = Sunday (the week starts on Monday, as in Russia). */
export function weekday(day: string): number {
  return (new Date(toUtc(day)).getUTCDay() + 6) % 7
}

export function startOfWeek(day: string): string {
  return addDays(day, -weekday(day))
}

/** "2026-10" → the Monday-first weeks covering that month (5 or 6 rows of 7 days). */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`
  const last = addDays(addMonths(month, 1) + '-01', -1)
  const weeks: string[][] = []
  for (let d = startOfWeek(first); d <= last; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
  }
  return weeks
}

/** "2026-10" + 3 → "2027-01". */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** "октябрь 2026" (capitalised by the caller's CSS). */
export function monthTitle(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  })
}

/** "окт." / "октябрь" for a day key. */
export function monthName(
  day: string,
  style: 'short' | 'long' = 'short',
): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    month: style,
  })
}

/** "17 окт." for a day key. */
export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  })
}

/** Day number of a key: "2026-10-07" → 7. */
export function dayNumber(day: string): number {
  return Number(day.slice(8, 10))
}
