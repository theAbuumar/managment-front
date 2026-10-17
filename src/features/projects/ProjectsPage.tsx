import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Briefcase,
  Search,
  MoreHorizontal,
  Settings,
  LayoutGrid,
  Lock,
  Users,
  ListChecks,
  CalendarRange,
  Building2,
  Plus,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PersonAvatar } from '@/components/ui/person-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { shortName } from '@/lib/people'
import { shortDate } from '@/lib/dates'
import { pluralize } from '@/lib/plural'
import { getProjects, PROJECT_STATUSES, type Project, type ProjectStatus } from '@/api/project'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { AddProjectDialog } from './AddProjectDialog'

type StatusFilter = 'all' | ProjectStatus

export function ProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [addOpen, setAddOpen] = useState(false)

  async function load() {
    if (!workspace) return
    setProjects(await getProjects(workspace.slug).catch(() => []))
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!workspace) return
      const list = await getProjects(workspace.slug).catch(() => [])
      if (!cancelled) setProjects(list)
    })().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [workspace?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase()
  const rows = projects.filter(
    (p) =>
      (status === 'all' || p.status === status) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.identifier.toLowerCase().includes(q) ||
        (p.department?.name ?? '').toLowerCase().includes(q)),
  )

  const counts: Record<StatusFilter, number> = {
    all: projects.length,
    planned: projects.filter((p) => p.status === 'planned').length,
    active: projects.filter((p) => p.status === 'active').length,
    paused: projects.filter((p) => p.status === 'paused').length,
    completed: projects.filter((p) => p.status === 'completed').length,
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Briefcase size={15} /> {t('Проекты')}
        </span>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Поиск по названию, ключу, подразделению')}
            className="h-8 w-72 pl-8"
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={15} />
          {t('Новый проект')}
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-1.5">
        {(['all', 'active', 'planned', 'paused', 'completed'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              status === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {s === 'all' ? t('Все') : PROJECT_STATUSES[s].label()} · {counts[s]}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
                <Skeleton className="h-20 rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2 w-full" />
                </div>
              </div>
            ))}
          {!loading && rows.map((p) => <ProjectCard key={p.id} project={p} onOpen={() => navigate(`/projects/${p.id}/work-items`)} onSettings={() => navigate(`/projects/${p.id}/settings`)} />)}
        </div>

        {!loading && rows.length === 0 && (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            {projects.length === 0 ? t('Проектов пока нет. Создайте первый.') : t('По запросу ничего не найдено.')}
          </p>
        )}
      </div>

      <AddProjectDialog open={addOpen} onOpenChange={setAddOpen} onCreated={load} />
    </div>
  )
}

function ProjectCard({ project: p, onOpen, onSettings }: { project: Project; onOpen: () => void; onSettings: () => void }) {
  const { t } = useTranslation()
  const color = p.color ?? '#3B82F6'
  const total = p.stats?.issues ?? 0
  const done = total - (p.stats?.open_issues ?? 0)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const status = PROJECT_STATUSES[p.status]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Colour band */}
      <div className="relative flex h-20 items-end px-4 pb-3" style={{ background: `linear-gradient(135deg, ${color}33, ${color}11)` }}>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-card text-2xl shadow-sm">{p.icon ?? '📁'}</div>
        <div className="absolute right-3 top-3 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {p.visibility === 'private' && (
            <span title={t('Приватный проект')} className="rounded-md bg-card/80 p-1 text-muted-foreground">
              <Lock size={13} />
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-md bg-card/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100">
                <MoreHorizontal size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onOpen}>
                <LayoutGrid size={14} className="mr-2" />
                {t('Открыть доску')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSettings}>
                <Settings size={14} className="mr-2" />
                {t('Настройки')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{p.name}</p>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{p.identifier}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: `${status.color}1f`, color: status.color }}>
              {status.label()}
            </span>
            {p.department && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Building2 size={12} />
                <span className="max-w-[180px] truncate">{p.department.short_name || p.department.name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{t('Выполнено {{done}} из {{total}}', { done, total })}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {p.lead && (
            <span className="flex min-w-0 items-center gap-1.5" title={t('Руководитель проекта')}>
              <PersonAvatar person={p.lead} size={18} />
              <span className="truncate">{shortName(p.lead)}</span>
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1" title={t('Участники')}>
            <Users size={12} />
            {p.stats?.members ?? 0}
          </span>
          <span className="flex shrink-0 items-center gap-1" title={t('Открытых задач')}>
            <ListChecks size={12} />
            {pluralize(p.stats?.open_issues ?? 0, [t('открытая'), t('открытые'), t('открытых')])}
          </span>
        </div>
        {(p.start_date || p.target_date) && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarRange size={12} />
            {p.start_date ? shortDate(p.start_date) : '…'} — {p.target_date ? shortDate(p.target_date) : '…'}
          </p>
        )}
      </div>
    </div>
  )
}
