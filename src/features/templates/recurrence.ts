import { t } from '@/i18n'
import { plural } from '@/lib/plural'
import type { Frequency, Schedule } from '@/api/recurring'

// Recurring rules on the client (Ф6 6.F4): the words for a schedule — «Каждый
// месяц, 1-го числа, в 09:00» — and its next dates for the form's preview. The
// date math mirrors the server (task-management-backend/src/modules/recurring/
// schedule.ts); the server's `next_run_at` is what actually runs.

export const FREQUENCIES: { key: Frequency; label: () => string }[] = [
  { key: 'daily', label: () => t('Ежедневно') },
  { key: 'weekly', label: () => t('Еженедельно') },
  { key: 'monthly', label: () => t('Ежемесячно') },
  { key: 'quarterly', label: () => t('Ежеквартально') },
  { key: 'yearly', label: () => t('Ежегодно') },
]

/** ISO weekdays 1…7 → short names. */
export const WEEKDAYS: { day: number; short: () => string }[] = [
  { day: 1, short: () => t('пн') },
  { day: 2, short: () => t('вт') },
  { day: 3, short: () => t('ср') },
  { day: 4, short: () => t('чт') },
  { day: 5, short: () => t('пт') },
  { day: 6, short: () => t('сб') },
  { day: 7, short: () => t('вс') },
]

/** Months in the genitive: «1 сентября». */
export const MONTHS_GENITIVE: (() => string)[] = [
  () => t('января'),
  () => t('февраля'),
  () => t('марта'),
  () => t('апреля'),
  () => t('мая'),
  () => t('июня'),
  () => t('июля'),
  () => t('августа'),
  () => t('сентября'),
  () => t('октября'),
  () => t('ноября'),
  () => t('декабря'),
]

export const MONTHS: (() => string)[] = [
  () => t('Январь'),
  () => t('Февраль'),
  () => t('Март'),
  () => t('Апрель'),
  () => t('Май'),
  () => t('Июнь'),
  () => t('Июль'),
  () => t('Август'),
  () => t('Сентябрь'),
  () => t('Октябрь'),
  () => t('Ноябрь'),
  () => t('Декабрь'),
]

/** Today in `timeZone` as "YYYY-MM-DD". */
export function todayIn(timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  )
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** A new rule's schedule: monthly on the start day, 09:00. */
export function defaultSchedule(today: string): Schedule {
  const [, m, d] = today.split('-').map(Number)
  return {
    frequency: 'monthly',
    interval: 1,
    by_weekday: [isoWeekday(today)],
    by_monthday: d!,
    by_month: m!,
    time: '09:00',
    start_date: today,
    until: null,
  }
}

/** The first run date on or after `from` (null after `until`) — as on the server. */
export function occurrenceOnOrAfter(s: Schedule, from: string): string | null {
  const start = s.start_date
  const since = from < start ? start : from
  let found: string | null = null
  if (s.frequency === 'daily') {
    const k = Math.ceil(daysBetween(start, since) / s.interval)
    found = addDays(start, k * s.interval)
  } else if (s.frequency === 'weekly') {
    const days = [
      ...new Set(s.by_weekday.length ? s.by_weekday : [isoWeekday(start)]),
    ].sort()
    const monday = addDays(start, 1 - isoWeekday(start))
    let week = Math.floor(daysBetween(monday, since) / 7)
    week -= week % s.interval
    for (let n = 0; n < 2000 && !found; n += 1, week += s.interval) {
      for (const wd of days) {
        const d = addDays(monday, week * 7 + wd - 1)
        if (d >= since) {
          found = d
          break
        }
      }
    }
  } else {
    const [sy, sm, sd] = start.split('-').map(Number)
    const day = s.by_monthday ?? sd!
    const step =
      s.interval *
      (s.frequency === 'quarterly' ? 3 : s.frequency === 'yearly' ? 12 : 1)
    const anchor =
      sy! * 12 + (s.frequency === 'yearly' && s.by_month ? s.by_month : sm!) - 1
    const [fy, fm] = since.split('-').map(Number)
    let k = Math.max(0, Math.floor((fy! * 12 + fm! - 1 - anchor) / step))
    for (let n = 0; n < 2000 && !found; n += 1, k += 1) {
      const month = anchor + k * step
      const y = Math.floor(month / 12)
      const m = (month % 12) + 1
      const d = iso(y, m, Math.min(day, daysInMonth(y, m)))
      if (d >= since) found = d
    }
  }
  if (!found || (s.until && found > s.until)) return null
  return found
}

/** "2026-11-01" → «1 ноября 2026». */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS_GENITIVE[m! - 1]!()} ${y}`
}

function every(
  n: number,
  one: string,
  forms: [string, string, string],
): string {
  return n === 1
    ? one
    : t('Каждые {{n}} {{unit}}', { n, unit: plural(n, forms) })
}

/** «Каждый месяц, 1-го числа, в 09:00, до 31 декабря 2026». */
export function describeSchedule(s: Schedule): string {
  const parts: string[] = []
  const monthday = (d: number | null) =>
    d === null
      ? ''
      : d >= 31
        ? t('в последний день месяца')
        : d >= 29
          ? t('{{d}}-го числа (в коротком месяце — в последний день)', { d })
          : t('{{d}}-го числа', { d })
  switch (s.frequency) {
    case 'daily':
      parts.push(
        every(s.interval, t('Каждый день'), [t('день'), t('дня'), t('дней')]),
      )
      break
    case 'weekly': {
      parts.push(
        every(s.interval, t('Каждую неделю'), [
          t('неделю'),
          t('недели'),
          t('недель'),
        ]),
      )
      const days = [...s.by_weekday].sort().map((d) => WEEKDAYS[d - 1]!.short())
      if (days.length) parts.push(days.join(', '))
      break
    }
    case 'monthly':
      parts.push(
        every(s.interval, t('Каждый месяц'), [
          t('месяц'),
          t('месяца'),
          t('месяцев'),
        ]),
      )
      parts.push(monthday(s.by_monthday))
      break
    case 'quarterly':
      parts.push(
        every(s.interval, t('Каждый квартал'), [
          t('квартал'),
          t('квартала'),
          t('кварталов'),
        ]),
      )
      parts.push(monthday(s.by_monthday))
      break
    case 'yearly':
      parts.push(
        every(s.interval, t('Каждый год'), [t('год'), t('года'), t('лет')]),
      )
      if (s.by_month && s.by_monthday) {
        parts.push(`${s.by_monthday} ${MONTHS_GENITIVE[s.by_month - 1]!()}`)
      }
      break
  }
  parts.push(t('в {{time}}', { time: s.time }))
  if (s.until) parts.push(t('до {{date}}', { date: dayLabel(s.until) }))
  return parts.filter(Boolean).join(', ')
}

/** Why a rule's latest run made nothing: `last_error` → words. */
export function ruleErrorText(code: string): string {
  switch (code) {
    case 'AUTHOR_NOT_MEMBER':
      return t(
        'Автор правила больше не в пространстве или не видит проект — правило на паузе.',
      )
    case 'GUEST_READ_ONLY':
      return t('У автора правила теперь роль «Гость» — правило на паузе.')
    case 'MEMBER_DEACTIVATED':
      return t(
        'Чей-то доступ отключён: исполнителя или автора. Проверьте правило.',
      )
    case 'GUEST_NOT_ASSIGNABLE':
      return t('Исполнитель или контролёр стал гостем — смените его в правиле.')
    default:
      return t('Последний запуск не создал задачу ({{code}}).', { code })
  }
}
