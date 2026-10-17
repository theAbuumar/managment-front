import {
  Archive,
  Ban,
  CircleAlert,
  SignalHigh,
  SignalLow,
  SignalMedium,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export type IssueStatus =
  'backlog' | 'todo' | 'in-progress' | 'done' | 'cancelled'
export type IssuePriority =
  'urgent' | 'high' | 'medium' | 'low' | 'none' | 'backlog'

const STATUS_CONFIG: Record<IssueStatus, { label: string; className: string }> =
  {
    backlog: {
      get label() {
        return t('Бэклог')
      },
      className:
        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    },
    todo: {
      get label() {
        return t('К выполнению')
      },
      className:
        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
    'in-progress': {
      get label() {
        return t('В работе')
      },
      className:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    },
    done: {
      get label() {
        return t('Готово')
      },
      className:
        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    },
    cancelled: {
      get label() {
        return t('Отменено')
      },
      className: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    },
  }

interface PriorityMeta {
  label: string
  className: string
  icon: LucideIcon
  iconColor: string
}

const PRIORITY_CONFIG: Record<IssuePriority, PriorityMeta> = {
  urgent: {
    get label() {
      return t('Срочный')
    },
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    icon: CircleAlert,
    iconColor: 'text-red-500',
  },
  high: {
    get label() {
      return t('Высокий')
    },
    className:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
    icon: SignalHigh,
    iconColor: 'text-orange-500',
  },
  medium: {
    get label() {
      return t('Средний')
    },
    className:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
    icon: SignalMedium,
    iconColor: 'text-yellow-500',
  },
  low: {
    get label() {
      return t('Низкий')
    },
    className:
      'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
    icon: SignalLow,
    iconColor: 'text-blue-500',
  },
  none: {
    get label() {
      return t('Без приоритета')
    },
    className: 'bg-muted text-muted-foreground',
    icon: Ban,
    iconColor: 'text-gray-400',
  },
  backlog: {
    get label() {
      return t('Бэклог')
    },
    className:
      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    icon: Archive,
    iconColor: 'text-slate-400',
  },
}

export { PRIORITY_CONFIG }

interface StatusBadgeProps {
  status: IssueStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, className: colorClass } = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
        className,
      )}
    >
      {label}
    </span>
  )
}

interface PriorityIconProps {
  priority: IssuePriority
  className?: string
}

export function PriorityIcon({ priority, className }: PriorityIconProps) {
  const { icon: Icon, iconColor } = PRIORITY_CONFIG[priority]
  return <Icon className={cn('size-3.5 shrink-0', iconColor, className)} />
}

interface PriorityBadgeProps {
  priority: IssuePriority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const { label, className: colorClass, icon: Icon } = PRIORITY_CONFIG[priority]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
        className,
      )}
    >
      <Icon className="size-3 shrink-0" />
      {label}
    </span>
  )
}
