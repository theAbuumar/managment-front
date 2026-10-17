import { t } from '@/i18n'
import { pluralize } from '@/lib/plural'
import { useAuthStore } from '@/stores/authStore'

/** Zone dates and times are shown in: the profile's zone (Ф3 3.F1), else the browser's. */
function displayZone(): string | undefined {
  return useAuthStore.getState().user?.timezone || undefined
}

/** "только что", "5 минут назад", "около 3 часов назад", "2 дня назад". */
export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return t('только что')
  if (mins < 60)
    return t('{{n}} назад', {
      n: pluralize(mins, [t('минуту'), t('минуты'), t('минут')]),
    })
  const hrs = Math.round(mins / 60)
  if (hrs < 24)
    return t('{{n}} назад', {
      n: pluralize(hrs, [t('час'), t('часа'), t('часов')]),
    })
  const days = Math.round(hrs / 24)
  return t('{{n}} назад', {
    n: pluralize(days, [t('день'), t('дня'), t('дней')]),
  })
}

/** "17 окт." / "17 окт. 2025" (year only when it differs from the current one). */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('ru-RU', {
    timeZone: displayZone(),
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "17 октября 2026" */
export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    timeZone: displayZone(),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Deadlines travel as an instant but mean a calendar day (end of that day in the
// workspace zone). A date input's "YYYY-MM-DD" is sent as noon UTC, which lands on
// the same calendar day in every zone from UTC−11 to UTC+11.
export function dateInputToIso(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null
}

/** ISO instant → "YYYY-MM-DD" for a date input, in the given zone. */
export function isoToDateInput(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** "17 октября, 14:05" */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: displayZone(),
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
