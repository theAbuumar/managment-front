import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { LayoutGrid, Sparkles, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { enabled, type FeatureFlag } from '@/lib/features'

interface RailItem {
  label: string
  icon: LucideIcon
  to: string
  match: (p: string) => boolean
  feature?: FeatureFlag
}

const RAIL_NAV: RailItem[] = [
  {
    label: 'Работа',
    icon: LayoutGrid,
    to: '/',
    match: (p) => !p.startsWith('/ai') && !p.startsWith('/settings'),
  },
  {
    label: 'AI',
    icon: Sparkles,
    to: '/ai',
    match: (p) => p.startsWith('/ai'),
    feature: 'ai',
  },
]

export function SidebarRail({ className }: { className?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div
      className={cn(
        'flex w-14 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-sidebar py-2',
        className,
      )}
    >
      {enabled(RAIL_NAV).map((item) => {
        const active = item.match(pathname)
        return (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className={cn(
              'flex w-full flex-col items-center gap-0.5 px-1 py-2 transition-colors',
              active
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <item.icon size={17} />
            <span className="text-[9px] font-medium">{t(item.label)}</span>
          </button>
        )
      })}

      <div className="my-1 w-8 border-t border-border" />

      <button
        onClick={() => navigate('/settings')}
        className={cn(
          'flex w-full flex-col items-center gap-0.5 px-1 py-2 transition-colors',
          pathname.startsWith('/settings')
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Settings size={17} />
        <span className="text-[9px] font-medium">{t('Настройки')}</span>
      </button>
    </div>
  )
}
