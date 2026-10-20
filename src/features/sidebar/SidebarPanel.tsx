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
  ShieldCheck,
  Hourglass,
  Activity,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getProjects, type Project } from '@/api/project'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { enabled, type FeatureFlag } from '@/lib/features'
import { useMySummary, useReadOnly } from '@/stores/summaryStore'

interface NavItem {
  label: string
  icon: LucideIcon
  to: string
  feature?: FeatureFlag
  /** Hidden from guests: they only read, so the section is always empty for them. */
  noGuest?: boolean
  /** Only for admins and department heads (the workspace feed, 7.F9). */
  managers?: boolean
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
  { label: 'Виды', icon: PanelsTopLeft, to: '/views', feature: 'views' },
  { label: 'Лента событий', icon: Activity, to: '/activity', feature: 'activity', managers: true },
  { label: 'Корзина', icon: Trash2, to: '/trash', feature: 'trash', noGuest: true },
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

  const summary = useMySummary()
  const readOnly = useReadOnly()
  const manager =
    summary?.role === 'owner' || summary?.role === 'admin' || !!summary?.heads_department
  const workTab = location.pathname === '/your-work' ? new URLSearchParams(location.search).get('tab') : null

  function isActive(to: string) {
    if (to === '/') return location.pathname === '/'
    if (to === '/your-work') return location.pathname === to && workTab !== 'control' && workTab !== 'review'
    return location.pathname.startsWith(to)
  }

  // Counters next to «Мои задачи» and its control rows (Ф5 5.F6). The control
  // rows appear only for people who actually control or review something.
  const counters: Record<string, { value: number; alert?: number; alertTitle?: string } | undefined> = summary
    ? {
        '/your-work': {
          value: summary.assigned,
          alert: summary.overdue,
          alertTitle: t('Просрочено: {{n}}', { n: summary.overdue }),
        },
      }
    : {}
  const controlRows = summary
    ? [
        {
          tab: 'control',
          label: t('На контроле'),
          icon: ShieldCheck,
          value: summary.control,
          alert: summary.control_overdue,
          alertTitle: t('Просрочено: {{n}}', { n: summary.control_overdue }),
        },
        {
          tab: 'review',
          label: t('Ждут проверки'),
          icon: Hourglass,
          value: 0,
          alert: summary.review_pending,
          alertTitle: t('Ждут вашего решения: {{n}}', { n: summary.review_pending }),
          tone: 'violet' as const,
        },
      ].filter((r) => r.value > 0 || r.alert > 0)
    : []

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
            <div key={item.to} className="space-y-0.5">
              <button
                onClick={() => navigate(item.to)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  isActive(item.to)
                    ? 'bg-nav-active-bg font-medium text-primary'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <item.icon size={14} className="shrink-0" />
                <span className="flex-1 truncate text-left">{t(item.label)}</span>
                {counters[item.to] && <Counter {...counters[item.to]!} />}
              </button>
              {item.to === '/your-work' &&
                controlRows.map((row) => (
                  <button
                    key={row.tab}
                    onClick={() => navigate(`/your-work?tab=${row.tab}`)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-sm transition-colors',
                      workTab === row.tab
                        ? 'bg-nav-active-bg font-medium text-primary'
                        : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <row.icon size={13} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-left">{row.label}</span>
                    <Counter value={row.value} alert={row.alert} alertTitle={row.alertTitle} tone={row.tone} />
                  </button>
                ))}
            </div>
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
              {enabled(WORKSPACE_ITEMS)
                .filter((item) => !(readOnly && item.noGuest))
                .filter((item) => !item.managers || manager)
                .map((item) => (
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

/** Muted total plus an attention pill (red overdue / violet "your decision"). */
function Counter({
  value,
  alert = 0,
  alertTitle,
  tone = 'red',
}: {
  value: number
  alert?: number
  alertTitle?: string
  tone?: 'red' | 'violet'
}) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums">
      {alert > 0 && (
        <span
          title={alertTitle}
          className={cn(
            'min-w-[18px] rounded-full px-1.5 py-px text-center font-semibold text-white',
            tone === 'red' ? 'bg-red-500' : 'bg-violet-500',
          )}
        >
          {alert}
        </span>
      )}
      {value > 0 && <span className="text-muted-foreground">{value}</span>}
    </span>
  )
}
