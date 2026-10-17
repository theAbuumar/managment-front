import { CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deadlineInfo, TONE_CLASSES } from '@/lib/deadline'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { StateGroup } from '@/api/state'

interface DeadlineBadgeProps {
  dueDate: string | null | undefined
  group: StateGroup | undefined
  completedAt?: string | null
  /** compact: date only for far deadlines; full: always the phrase. */
  variant?: 'compact' | 'full'
  className?: string
}

/** Coloured deadline chip: «осталось 2 дня», «срок сегодня», «просрочено на 5 дней». */
export function DeadlineBadge({
  dueDate,
  group,
  completedAt,
  variant = 'compact',
  className,
}: DeadlineBadgeProps) {
  const timeZone =
    useWorkspaceStore((s) => s.workspace?.timezone) ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const info = deadlineInfo(dueDate, group, timeZone, completedAt)
  if (info.tone === 'none') return null
  const text =
    variant === 'compact' && (info.tone === 'ok' || (info.tone === 'done' && !info.label))
      ? info.date
      : info.label || info.date
  return (
    <span
      title={info.date}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium',
        TONE_CLASSES[info.tone],
        className,
      )}
    >
      <CalendarClock size={11} className="shrink-0" />
      {text}
    </span>
  )
}
