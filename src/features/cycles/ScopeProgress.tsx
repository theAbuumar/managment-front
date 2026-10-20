import { useTranslation } from 'react-i18next'
import { STATE_GROUPS, type StateGroup } from '@/api/state'
import type { GroupProgress } from '@/api/cycle'
import { cn } from '@/lib/utils'

// Done first, then what is left from nearest to furthest from done.
const ORDER: StateGroup[] = [
  'completed',
  'cancelled',
  'review',
  'started',
  'unstarted',
  'backlog',
]

// Only done work is drawn solid, so the bar reads as "how much is done" while
// still showing where the rest is: in work paler, not started palest.
const OPACITY: Partial<Record<StateGroup, number>> = {
  review: 0.6,
  started: 0.6,
  unstarted: 0.3,
  backlog: 0.3,
}

/** A bar split by state group colours; the counts are in its tooltip. */
export function ProgressBar({
  progress,
  className,
}: {
  progress: GroupProgress
  className?: string
}) {
  const { t } = useTranslation()
  const parts = ORDER.filter((g) => progress[g] > 0)
  const legend = parts
    .map((g) => `${STATE_GROUPS[g].label()}: ${progress[g]}`)
    .join(' · ')
  return (
    <div
      role="img"
      aria-label={legend || t('Задач пока нет')}
      title={legend || undefined}
      className={cn(
        'flex h-1.5 gap-px overflow-hidden rounded-full bg-muted',
        className,
      )}
    >
      {parts.map((g) => (
        <div
          key={g}
          className="h-full transition-[width] duration-300"
          style={{
            width: `${(progress[g] / progress.total) * 100}%`,
            background: STATE_GROUPS[g].color,
            opacity: OPACITY[g] ?? 1,
          }}
        />
      ))}
    </div>
  )
}

/** «Выполнено 12 из 30» + «40%» over the bar (cards), or in one line (banner). */
export function ScopeProgress({
  progress,
  compact,
  className,
}: {
  progress: GroupProgress
  compact?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const done = progress.completed + progress.cancelled
  const text =
    progress.total === 0
      ? t('Задач пока нет')
      : t('Выполнено {{done}} из {{total}}', { done, total: progress.total })

  if (compact)
    return (
      <span className={cn('flex items-center gap-2 text-xs', className)}>
        <ProgressBar progress={progress} className="w-20 shrink-0 sm:w-28" />
        <span className="whitespace-nowrap text-muted-foreground">
          {text}
          {progress.total > 0 && (
            <span className="tabular-nums">
              {' · '}
              {progress.completion_percentage}%
            </span>
          )}
        </span>
      </span>
    )

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{text}</span>
        {progress.total > 0 && (
          <span className="font-medium tabular-nums text-foreground">
            {progress.completion_percentage}%
          </span>
        )}
      </div>
      <ProgressBar progress={progress} />
    </div>
  )
}
