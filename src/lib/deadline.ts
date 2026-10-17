import { t } from '@/i18n'
import { pluralize } from '@/lib/plural'
import type { StateGroup } from '@/api/state'

// Deadline indicators (Ф5 5.F4). A deadline is the END of that calendar day in the
// workspace time zone, so "today / in 2 days / overdue by 5 days" are computed on
// local calendar dates, the same way the backend's reminders do.

export type DeadlineTone = 'none' | 'ok' | 'soon' | 'today' | 'overdue' | 'done' | 'late'

export interface DeadlineInfo {
  tone: DeadlineTone
  /** Days until the deadline (negative = overdue); null without a deadline. */
  days: number | null
  label: string
  /** "17 окт." */
  date: string
}

function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

const DAYS: [string, string, string] = ['день', 'дня', 'дней']

export function deadlineInfo(
  dueDate: string | null | undefined,
  group: StateGroup | undefined,
  timeZone: string,
  completedAt?: string | null,
): DeadlineInfo {
  if (!dueDate) return { tone: 'none', days: null, label: '', date: '' }
  const due = new Date(dueDate)
  const dueLocal = localDate(due, timeZone)
  const date = due.toLocaleDateString('ru-RU', { timeZone, day: 'numeric', month: 'short' })

  if (group === 'completed' || group === 'cancelled') {
    if (group === 'completed' && completedAt) {
      const late = daysBetween(dueLocal, localDate(new Date(completedAt), timeZone))
      if (late > 0) {
        return {
          tone: 'late',
          days: -late,
          label: t('выполнено с опозданием на {{n}}', { n: pluralize(late, DAYS) }),
          date,
        }
      }
      return { tone: 'done', days: 0, label: t('выполнено в срок'), date }
    }
    return { tone: 'done', days: 0, label: '', date }
  }

  const days = daysBetween(localDate(new Date(), timeZone), dueLocal)
  if (days < 0) {
    return { tone: 'overdue', days, label: t('просрочено на {{n}}', { n: pluralize(-days, DAYS) }), date }
  }
  if (days === 0) return { tone: 'today', days, label: t('срок сегодня'), date }
  if (days <= 3) return { tone: 'soon', days, label: t('осталось {{n}}', { n: pluralize(days, DAYS) }), date }
  return { tone: 'ok', days, label: t('до {{date}}', { date }), date }
}

/** Tailwind classes per tone (text + soft background). */
export const TONE_CLASSES: Record<DeadlineTone, string> = {
  none: 'text-muted-foreground',
  ok: 'text-muted-foreground bg-muted',
  soon: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15',
  today: 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-500/15',
  overdue: 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-500/15',
  done: 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15',
  late: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15',
}
