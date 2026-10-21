import { t } from '@/i18n'
import type {
  PlannedReport,
  ReportDelivery,
  ReportFrequency,
  ReportPeriod,
  ReportSchedule,
} from '@/api/reportSchedules'

// Words for planned reports (Ф10 10.F7): what goes out, when, for which period,
// why it is paused and how each copy was delivered.

export const REPORTS: {
  key: PlannedReport
  label: () => string
  file: string
}[] = [
  {
    key: 'discipline',
    label: () => t('Справка об исполнении поручений'),
    file: 'PDF',
  },
  { key: 'assignments', label: () => t('Реестр поручений'), file: 'Excel' },
  { key: 'project', label: () => t('Отчёт по проекту'), file: 'PDF' },
]

export const reportLabel = (key: PlannedReport) =>
  REPORTS.find((r) => r.key === key)!.label()

export const REPORT_FREQUENCIES: {
  key: ReportFrequency
  label: () => string
}[] = [
  { key: 'daily', label: () => t('Ежедневно') },
  { key: 'weekly', label: () => t('Еженедельно') },
  { key: 'monthly', label: () => t('Ежемесячно') },
  { key: 'quarterly', label: () => t('Ежеквартально') },
]

export const PERIODS: { key: ReportPeriod; label: () => string }[] = [
  { key: 'previous_week', label: () => t('За прошлую неделю') },
  { key: 'previous_month', label: () => t('За прошлый месяц') },
  { key: 'previous_quarter', label: () => t('За прошлый квартал') },
  { key: 'last_30_days', label: () => t('За последние 30 дней') },
]

/** The period the server picks when none is chosen. */
export const DEFAULT_PERIOD: Record<ReportFrequency, ReportPeriod> = {
  daily: 'last_30_days',
  weekly: 'previous_week',
  monthly: 'previous_month',
  quarterly: 'previous_quarter',
}

export const periodLabel = (key: ReportPeriod) =>
  PERIODS.find((p) => p.key === key)!.label()

/** «каждый понедельник» … in the accusative, for «Каждый …». */
const WEEKDAY_EVERY: (() => string)[] = [
  () => t('каждый понедельник'),
  () => t('каждый вторник'),
  () => t('каждую среду'),
  () => t('каждый четверг'),
  () => t('каждую пятницу'),
  () => t('каждую субботу'),
  () => t('каждое воскресенье'),
]

export const WEEKDAY_NAMES: (() => string)[] = [
  () => t('Понедельник'),
  () => t('Вторник'),
  () => t('Среда'),
  () => t('Четверг'),
  () => t('Пятница'),
  () => t('Суббота'),
  () => t('Воскресенье'),
]

/** «Каждый понедельник в 08:00», «Ежемесячно, 1-го числа в 08:00». */
export function describeTiming(
  s: Pick<ReportSchedule, 'frequency' | 'by_weekday' | 'by_monthday' | 'time'>,
): string {
  const at = t('в {{time}}', { time: s.time })
  switch (s.frequency) {
    case 'daily':
      return t('Ежедневно {{at}}', { at })
    case 'weekly': {
      const days = s.by_weekday.length ? s.by_weekday : [1]
      const text = days.map((d) => WEEKDAY_EVERY[d - 1]!()).join(', ')
      return `${text.charAt(0).toUpperCase()}${text.slice(1)} ${at}`
    }
    case 'monthly':
      return t('Ежемесячно, {{day}}-го числа {{at}}', {
        day: s.by_monthday ?? 1,
        at,
      })
    case 'quarterly':
      return t(
        'Ежеквартально, {{day}}-го числа первого месяца квартала {{at}}',
        {
          day: s.by_monthday ?? 1,
          at,
        },
      )
  }
}

/** "2026-10-12", "2026-10-18" → «12.10–18.10.2026». */
export function runPeriod(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-')
  const [ty, tm, td] = to.split('-')
  if (from === to) return `${td}.${tm}.${ty}`
  return fy === ty
    ? `${fd}.${fm}–${td}.${tm}.${ty}`
    : `${fd}.${fm}.${fy}–${td}.${tm}.${ty}`
}

/** Why the report is paused or why its latest run made nothing. */
export function scheduleErrorText(code: string): string {
  switch (code) {
    case 'AUTHOR_NOT_MEMBER':
      return t('На паузе: у автора больше нет доступа к пространству.')
    case 'MEMBER_DEACTIVATED':
      return t('На паузе: доступ автора отключён администратором.')
    case 'GUEST_READ_ONLY':
      return t('На паузе: автор стал гостем и не может отправлять отчёты.')
    case 'AUTHOR_NOT_ADMIN':
      return t(
        'На паузе: автор больше не администратор, а отчёт уходит и другим сотрудникам. Оставьте получателем только автора или передайте отчёт администратору.',
      )
    case 'FORBIDDEN':
      return t(
        'Последний отчёт не сформирован: подразделение вне зоны ответственности автора.',
      )
    case 'PROJECT_NOT_FOUND':
      return t('Последний отчёт не сформирован: проекта больше нет.')
    default:
      return t('Последний отчёт не сформирован. Попробуйте «Отправить сейчас».')
  }
}

export function deliveryText(d: ReportDelivery): string {
  const channel = d.channel === 'telegram' ? t('Telegram') : t('почта')
  if (d.status === 'sent') return t('{{channel}}: доставлено', { channel })
  if (d.status === 'failed') return t('{{channel}}: не доставлено', { channel })
  switch (d.error) {
    case 'NO_TELEGRAM':
      return t('Telegram не привязан')
    case 'NO_EMAIL':
      return t('Нет адреса почты')
    case 'NOT_MEMBER':
      return t('{{channel}}: не сотрудник пространства', { channel })
    default:
      return t('{{channel}}: пропущено', { channel })
  }
}
