import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface MultiSelectOption {
  label: string
  value: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = t('Выберите…'),
  disabled,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggle(val: string) {
    onChange(
      value.includes(val) ? value.filter((v) => v !== val) : [...value, val],
    )
  }

  function remove(val: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(value.filter((v) => v !== val))
  }

  const selectedLabels = options.filter((o) => value.includes(o.value))

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          open && 'ring-1 ring-ring',
        )}
      >
        {selectedLabels.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          selectedLabels.map((o) => (
            <span
              key={o.value}
              className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {o.label}
              <X
                size={10}
                className="cursor-pointer opacity-60 hover:opacity-100"
                onClick={(e) => remove(o.value, e)}
              />
            </span>
          ))
        )}
        <ChevronDown
          size={14}
          className={cn(
            'ml-auto shrink-0 opacity-50 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border border-input',
                  value.includes(o.value) &&
                    'border-primary bg-primary text-primary-foreground',
                )}
              >
                {value.includes(o.value) && <Check size={10} />}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
