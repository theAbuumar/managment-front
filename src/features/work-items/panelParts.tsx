import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// Small building blocks of the issue panel, shared by its sections (properties,
// relations, sub-issues): a popover with options, a search box, a property row.

export const popCls =
  'z-50 w-64 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'
export const optionCls =
  'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
export const triggerCls =
  'flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm text-foreground transition-colors hover:border-border hover:bg-accent disabled:pointer-events-none'

export function PopContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align="end"
        sideOffset={6}
        className={cn(popCls, className)}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="mb-1 flex items-center gap-2 border-b border-border px-2 pb-2">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

export function PropRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="mt-1.5 w-24 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
