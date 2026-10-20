import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** The first swatch: what a new label starts with. */
export const DEFAULT_COLOR = '#6366f1'

// A tidy default palette; a native colour input covers anything else.
// Shared by labels and states so both pages offer the same colours.
const PALETTE = [
  DEFAULT_COLOR,
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#64748b',
]

export function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'size-5 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110',
            value.toLowerCase() === c.toLowerCase() && 'ring-2 ring-ring',
          )}
          style={{ background: c }}
          aria-label={t('Цвет {{c}}', { c })}
        />
      ))}
      <label
        className="relative size-5 shrink-0 cursor-pointer rounded-full border border-border"
        style={{ background: value }}
        title={t('Свой цвет')}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}
