import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Settings2, Users, CircleDot, Tag, FileStack, Repeat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { enabled, type FeatureFlag } from '@/lib/features'
import { getProject } from '@/api/project'
import { useWorkspaceStore } from '@/stores/workspaceStore'

interface NavItem {
  label: string
  icon: LucideIcon
  to: string
  feature?: FeatureFlag
}

const GENERAL: NavItem[] = [
  { label: 'Общие', icon: Settings2, to: 'general' },
  { label: 'Участники', icon: Users, to: 'members', feature: 'projectMembers' },
]
const WORK: NavItem[] = [
  { label: 'Состояния', icon: CircleDot, to: 'states', feature: 'projectStates' },
  { label: 'Метки', icon: Tag, to: 'labels' },
  { label: 'Шаблоны', icon: FileStack, to: 'templates' },
  { label: 'Повторяющиеся', icon: Repeat, to: 'recurring' },
]

function NavSection({
  title,
  items,
}: {
  title: string
  items: NavItem[]
}) {
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

export function ProjectSettingsLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [name, setName] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!workspace || !projectId) return
      const p = await getProject(workspace.slug, projectId).catch(() => null)
      if (!cancelled && p) setName(p.name)
    })()
    return () => {
      cancelled = true
    }
  }, [workspace?.slug, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background md:flex-row">
      {/* Phones: back button + horizontal section tabs instead of the sidebar. */}
      <div className="shrink-0 border-b border-border bg-card md:hidden">
        <button
          onClick={() => navigate('/projects-list')}
          className="flex max-w-full items-center gap-2 px-4 pb-2 pt-3 text-sm font-semibold text-foreground"
        >
          <ArrowLeft size={16} className="shrink-0" />
          <span className="truncate">{name || t('Настройки проекта')}</span>
        </button>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {[...enabled(GENERAL), ...enabled(WORK)].map((item) => (
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

      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card md:flex">
        <button
          onClick={() => navigate('/projects-list')}
          className="flex items-center gap-2 px-4 py-4 text-base font-semibold text-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft size={18} />
          {t('Настройки проекта')}
        </button>

        <div className="flex items-center gap-2.5 px-4 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-lg">
            📊
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {name || t('Проект')}
            </p>
          </div>
        </div>

        <nav className="px-2 pb-6">
          <NavSection title={t('Проект')} items={enabled(GENERAL)} />
          <NavSection title={t('Структура работы')} items={enabled(WORK)} />
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
