import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A small label in its own colour on a light tint of it (statuses of tasks,
 * projects, stages and modules). In the light theme the text is a darker shade of the colour, so a light
 * green or blue still reads at 4.5:1 (12.F3); the dark theme keeps the colour itself.
 */
export function ColorChip({
  color,
  className,
  children,
}: {
  color: string
  className?: string
  children: ReactNode
}) {
  return (
    <span
      style={{ '--chip': color } as CSSProperties}
      className={cn(
        'rounded-full px-2 py-0.5',
        'bg-[color-mix(in_srgb,var(--chip)_12%,transparent)]',
        'text-[color-mix(in_oklab,var(--chip)_60%,black)] dark:text-[var(--chip)]',
        className,
      )}
    >
      {children}
    </span>
  )
}
