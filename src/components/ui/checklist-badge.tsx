import { useTranslation } from 'react-i18next'
import { ListChecks, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'

// Small marks of an issue on cards and rows (Ф6): checklist progress «3/7»
// (6.F5) and «made by a recurring rule» (6.F4).

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
