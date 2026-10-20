import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Settings2, Users, Network, ShieldCheck, History, FileStack } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { enabled, type FeatureFlag } from '@/lib/features'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { WorkspaceLogo } from '@/components/ui/workspace-logo'

interface NavItem {
  label: string
  icon: LucideIcon
  to: string
  feature?: FeatureFlag
}

const ADMIN: NavItem[] = [
  { label: 'Общие', icon: Settings2, to: 'general' },
  { label: 'Сотрудники', icon: Users, to: 'members' },
  { label: 'Оргструктура', icon: Network, to: 'structure', feature: 'orgStructure' },
  { label: 'Контроль исполнения', icon: ShieldCheck, to: 'control' },
  { label: 'Шаблоны', icon: FileStack, to: 'templates' },
  { label: 'Журнал аудита', icon: History, to: 'audit' },
]

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  const { t } = useTranslation()
  return (
    <div className="mb-4">
      <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                isActive
                  ? 'bg-nav-active-bg text-primary font-medium'
                  : 'text-foreground hover:bg-muted',
              )
            }
          >
            <item.icon size={15} className="shrink-0" />
            {t(item.label)}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export function SettingsLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const items = enabled(ADMIN)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background md:flex-row">
      {/* Phones: back button + horizontal section tabs instead of the sidebar. */}
      <div className="shrink-0 border-b border-border bg-card md:hidden">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 pb-2 pt-3 text-sm font-semibold text-foreground"
        >
          <ArrowLeft size={16} />
          {t('Настройки пространства')}
        </button>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm',
                  isActive ? 'bg-nav-active-bg font-medium text-primary' : 'text-foreground',
                )
              }
            >
              <item.icon size={14} />
              {t(item.label)}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Settings sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card md:flex">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-4 text-base font-semibold text-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft size={18} />
          {t('Настройки пространства')}
        </button>

        <div className="flex items-center gap-2.5 px-4 pb-4">
          <WorkspaceLogo workspace={workspace} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {workspace?.name ?? t('Пространство')}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {workspace?.slug}
            </p>
          </div>
        </div>

        <nav className="px-2">
          <NavSection title={t('Администрирование')} items={items} />
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
