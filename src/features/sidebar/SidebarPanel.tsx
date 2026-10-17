import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  Home,
  PencilLine,
  User,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  CircleDot,
  RefreshCw,
  Layers,
  PanelsTopLeft,
  Trash2,
  BarChart3,
  Mail,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getProjects, type Project } from '@/api/project'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { enabled, type FeatureFlag } from '@/lib/features'

interface NavItem {
  label: string
  icon: LucideIcon
  to: string
  feature?: FeatureFlag
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Главная', icon: Home, to: '/' },
  { label: 'Мои задачи', icon: User, to: '/your-work' },
  { label: 'Черновики', icon: PencilLine, to: '/drafts', feature: 'drafts' },
  { label: 'Аналитика', icon: BarChart3, to: '/analytics', feature: 'analytics' },
]

const WORKSPACE_ITEMS: NavItem[] = [
  { label: 'Проекты', icon: FolderOpen, to: '/projects-list' },
  { label: 'Приглашения', icon: Mail, to: '/invitations' },
  { label: 'Корзина', icon: Trash2, to: '/trash', feature: 'trash' },
]

// Sub-rows revealed when a project is expanded.
const PROJECT_SUBNAV: (Omit<NavItem, 'to'> & { seg: string })[] = [
  { label: 'Задачи', icon: CircleDot, seg: 'work-items' },
  { label: 'Этапы', icon: RefreshCw, seg: 'cycles', feature: 'cycles' },
  { label: 'Модули', icon: Layers, seg: 'modules', feature: 'modules' },
  { label: 'Виды', icon: PanelsTopLeft, seg: 'views', feature: 'views' },
]

// Deterministic accent per project so its avatar tile stays stable across loads.
const PROJECT_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
]
function projectColor(id: string) {
  let hash = 0
  for (const ch of id) hash = (hash + ch.charCodeAt(0)) % PROJECT_COLORS.length
  return PROJECT_COLORS[hash]
}

export function SidebarPanel({ className }: { className?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!workspace) return setProjects([])
      const list = await getProjects(workspace.slug).catch(() => [])
      if (!cancelled) setProjects(list)
    })()
    return () => {
      cancelled = true
    }
  }, [workspace?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleProject(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function isActive(to: string) {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  const subnav = enabled(PROJECT_SUBNAV)

  return (
    <div
      className={cn(
        'flex w-[240px] shrink-0 flex-col border-r border-border bg-card',
        className,
      )}
    >
      {/* Panel header */}
      <div className="flex h-10 items-center border-b border-border px-3">
        <span className="truncate text-sm font-semibold">
          {workspace?.name ?? t('Пространство')}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Primary nav */}
        <nav className="mb-3 space-y-0.5">
          {enabled(NAV_ITEMS).map((item) => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                isActive(item.to)
                  ? 'bg-nav-active-bg font-medium text-primary'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              <item.icon size={14} className="shrink-0" />
              {t(item.label)}
            </button>
          ))}
        </nav>

        {/* Workspace section */}
        <div className="mb-3">
          <button
            onClick={() => setWorkspaceOpen((o) => !o)}
            className="flex w-full items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>{t('Пространство')}</span>
            {workspaceOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
          {workspaceOpen && (
            <div className="mt-0.5 space-y-0.5">
              {enabled(WORKSPACE_ITEMS).map((item) => (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    isActive(item.to)
                      ? 'bg-nav-active-bg font-medium text-primary'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  <item.icon
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                  {t(item.label)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Projects section */}
        <div>
          <button
            onClick={() => setProjectsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>{t('Проекты')}</span>
            {projectsOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
          {projectsOpen && (
            <div className="mt-0.5 space-y-0.5">
              {projects.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t('Проектов пока нет')}
                </p>
              )}
              {projects.map((project) => {
                const isOpen = expanded.has(project.id)
                const projectActive = location.pathname.startsWith(
                  `/projects/${project.id}`,
                )
                return (
                  <div key={project.id}>
                    <div
                      className={cn(
                        'group flex w-full items-center gap-1 rounded-md pr-1 transition-colors',
                        projectActive ? 'bg-nav-active-bg' : 'hover:bg-muted',
                      )}
                    >
                      {subnav.length > 1 && (
                        <button
                          onClick={() => toggleProject(project.id)}
                          className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          aria-label={isOpen ? t('Свернуть') : t('Развернуть')}
                        >
                          {isOpen ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          navigate(`/projects/${project.id}/work-items`)
                        }
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 py-1.5 text-sm text-foreground',
                          subnav.length <= 1 && 'pl-2',
                        )}
                      >
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                          style={{ backgroundColor: projectColor(project.id) }}
                        >
                          {project.identifier[0]}
                        </div>
                        <span className="flex-1 truncate text-left">
                          {project.name}
                        </span>
                      </button>
                    </div>

                    {isOpen && subnav.length > 1 && (
                      <div className="ml-4 border-l border-border pl-2">
                        {subnav.map((sub) => {
                          const to = `/projects/${project.id}/${sub.seg}`
                          const active = location.pathname === to
                          return (
                            <button
                              key={sub.seg}
                              onClick={() => navigate(to)}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                                active
                                  ? 'bg-nav-active-bg font-medium text-primary'
                                  : 'text-foreground hover:bg-muted',
                              )}
                            >
                              <sub.icon
                                size={14}
                                className="shrink-0 text-muted-foreground"
                              />
                              {t(sub.label)}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
