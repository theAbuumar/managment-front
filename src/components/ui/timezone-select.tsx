import { useMemo, useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { listTimeZones, timeZoneLabel } from '@/lib/timezones'

interface TimezoneSelectProps {
  value: string | null
  onChange: (value: string | null) => void
  /** Offer a "no zone" option (null) with this label, e.g. "Как в пространстве". */
  emptyLabel?: string
  disabled?: boolean
  id?: string
}

/** Searchable IANA time zone picker (search by city, country, id or "+5"). */
export function TimezoneSelect({
  value,
  onChange,
  emptyLabel,
  disabled,
  id,
}: TimezoneSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const zones = useMemo(() => listTimeZones(value), [value])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return zones
    return zones.filter(
      (z) =>
        z.id.toLowerCase().includes(q) ||
        z.name.toLowerCase().includes(q) ||
        z.offset.toLowerCase().includes(q) ||
        z.offset
          .replace(':00', '')
          .replace(/([+-])0/, '$1')
          .toLowerCase()
          .includes(q),
    )
  }, [zones, search])

  function pick(next: string | null) {
    onChange(next)
    setOpen(false)
    setSearch('')
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-sm transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              !value && 'text-muted-foreground',
            )}
          >
            {value
              ? timeZoneLabel(value)
              : (emptyLabel ?? t('Выберите часовой пояс'))}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md"
        >
          <div className="mb-1 flex items-center gap-2 border-b border-border px-2 pb-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Город, страна или +5')}
              className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-72 overflow-y-auto">
            {emptyLabel && !search && (
              <Option selected={value === null} onClick={() => pick(null)}>
                <span className="flex-1">{emptyLabel}</span>
              </Option>
            )}
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                {t('Ничего не найдено')}
              </p>
            ) : (
              filtered.map((z) => (
                <Option
                  key={z.id}
                  selected={value === z.id}
                  scrollIntoView={!search}
                  onClick={() => pick(z.id)}
                >
                  <span className="w-[76px] shrink-0 tabular-nums text-muted-foreground">
                    {z.offset}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{z.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {z.id}
                    </span>
                  </span>
                </Option>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function Option({
  selected,
  scrollIntoView,
  onClick,
  children,
}: {
  selected: boolean
  scrollIntoView?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Bring the current zone into view when the list opens.
      ref={
        selected && scrollIntoView
          ? (el) => el?.scrollIntoView({ block: 'nearest' })
          : undefined
      }
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
      {selected && <Check className="size-3.5 shrink-0" />}
    </button>
  )
}
