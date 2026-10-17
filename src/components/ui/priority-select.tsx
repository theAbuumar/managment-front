import { useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  Archive,
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  Search,
  SignalHigh,
  SignalLow,
  SignalMedium,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { type IssuePriority } from '@/components/ui/status-badge'

interface PriorityMeta {
  label: string
  icon: LucideIcon
  iconClass: string
  boxClass: string
}

const CONFIG: Record<IssuePriority, PriorityMeta> = {
  urgent: {
    get label() {
      return t('Срочный')
    },
    icon: CircleAlert,
    iconClass: 'text-red-500',
    boxClass: 'bg-red-500/20',
  },
  high: {
    get label() {
      return t('Высокий')
    },
    icon: SignalHigh,
    iconClass: 'text-orange-500',
    boxClass: 'bg-orange-500/20',
  },
  medium: {
    get label() {
      return t('Средний')
    },
    icon: SignalMedium,
    iconClass: 'text-yellow-500',
    boxClass: 'bg-yellow-500/20',
  },
  low: {
    get label() {
      return t('Низкий')
    },
    icon: SignalLow,
    iconClass: 'text-blue-500',
    boxClass: 'bg-blue-500/20',
  },
  none: {
    get label() {
      return t('Без приоритета')
    },
    icon: Ban,
    iconClass: 'text-gray-400',
    boxClass: 'bg-gray-400/15',
  },
  backlog: {
    get label() {
      return t('Бэклог')
    },
    icon: Archive,
    iconClass: 'text-slate-400',
    boxClass: 'bg-slate-500/20',
  },
}

const PRIORITIES: IssuePriority[] = ['urgent', 'high', 'medium', 'low', 'none']

function IconBox({ priority }: { priority: IssuePriority }) {
  const { icon: Icon, iconClass, boxClass } = CONFIG[priority]
  return (
    <span
      className={cn(
        'flex h-[1.25rem] w-[1.25rem] shrink-0 items-center justify-center rounded-sm',
        boxClass,
      )}
    >
      <Icon className={cn('size-3', iconClass)} />
    </span>
  )
}

interface PrioritySelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function PrioritySelect({
  value,
  onChange,
  placeholder = t('Выберите приоритет'),
  disabled,
}: PrioritySelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selected = value as IssuePriority | ''

  const filtered = PRIORITIES.filter((p) =>
    CONFIG[p].label.toLowerCase().includes(search.toLowerCase()),
  )

  function handleSelect(p: IssuePriority) {
    onChange(p)
    setOpen(false)
    setSearch('')
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSearch('')
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {selected ? (
            <>
              <IconBox priority={selected} />
              <span className="flex-1 text-left">{CONFIG[selected].label}</span>
            </>
          ) : (
            <span className="flex-1 text-left text-muted-foreground">
              {placeholder}
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 w-[var(--radix-popover-trigger-width)] min-w-[180px] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border px-2 pb-2 mb-1">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Поиск')}
              className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Options */}
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              No results.
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSelect(p)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <IconBox priority={p} />
                <span className="flex-1 text-left">{CONFIG[p].label}</span>
                {value === p && (
                  <Check className="size-3.5 shrink-0 text-foreground" />
                )}
              </button>
            ))
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
