import { t } from '@/i18n'
import { pluralize } from '@/lib/plural'

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
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "17 октября 2026" */
export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
