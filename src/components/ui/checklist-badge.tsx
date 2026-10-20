import { useTranslation } from 'react-i18next'
import { AlertTriangle, ListChecks, ListTree, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'

// Small marks of an issue on cards and rows: checklist progress «3/7» (6.F5),
// «made by a recurring rule» (6.F4), «blocked» (4.F6) and sub-issues (4.F7).

export function ChecklistBadge({
  done,
  total,
  className,
}: {
  done?: number
  total?: number
  className?: string
}) {
  const { t } = useTranslation()
  if (!total) return null
  const complete = (done ?? 0) >= total
  return (
    <span
      title={t('Чек-лист: выполнено {{done}} из {{total}}', {
        done: done ?? 0,
        total,
      })}
      className={cn(
        'flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums',
        complete
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground',
        className,
      )}
    >
      <ListChecks size={11} />
      {done ?? 0}/{total}
    </span>
  )
}

export function RecurringMark({
  ruleId,
  className,
}: {
  ruleId?: string | null
  className?: string
}) {
  const { t } = useTranslation()
  if (!ruleId) return null
  return (
    <span
      title={t('Создано повторяющимся правилом')}
      aria-label={t('Создано повторяющимся правилом')}
      className={cn('shrink-0 text-muted-foreground', className)}
    >
      <Repeat size={11} />
    </span>
  )
}

/** «Заблокирована»: open issues block this one (4.F6, `_count.outgoing_links`). */
export function BlockedMark({
  count,
  className,
}: {
  count?: number
  className?: string
}) {
  const { t } = useTranslation()
  if (!count) return null
  const text = t('Заблокирована: ждёт незакрытых задач — {{n}}', { n: count })
  return (
    <span
      title={text}
      aria-label={text}
      className={cn(
        'flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      <AlertTriangle size={12} />
    </span>
  )
}

/** Number of sub-issues (4.F7); a distribution shows its departments elsewhere. */
export function SubtaskBadge({
  count,
  className,
}: {
  count?: number
  className?: string
}) {
  const { t } = useTranslation()
  if (!count) return null
  return (
    <span
      title={t('Подзадач: {{n}}', { n: count })}
      className={cn(
        'flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground',
        className,
      )}
    >
      <ListTree size={11} />
      {count}
    </span>
  )
}
