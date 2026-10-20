import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CalendarRange,
  Clock,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PersonAvatar } from '@/components/ui/person-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteCycle, getCycles, type Cycle } from '@/api/cycle'
import { deleteModule, getModules, type Module } from '@/api/module'
import { getProject, type Project } from '@/api/project'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { t } from '@/i18n'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useMyRole } from '@/stores/summaryStore'
import { errorText } from '@/lib/errorMessages'
import { fullName, shortName } from '@/lib/people'
import { cn } from '@/lib/utils'
import { ScopeDialog } from './ScopeDialog'
import { ScopeProgress } from './ScopeProgress'
import {
  SCOPE_TEXT,
  dateRange,
  scopeBoardPath,
  scopeEnd,
  scopeStatus,
  timeHint,
  type Scope,
  type ScopeKind,
} from './scopes'

interface Section {
  title: string
  items: Scope[]
}

/** Cycles by where they are in time: running, coming, finished (latest first). */
function cycleSections(cycles: Cycle[]): Section[] {
  return [
    {
      title: t('Идут'),
      items: cycles.filter((c) => c.status === 'active'),
    },
    {
      title: t('Впереди'),
      items: cycles.filter((c) => c.status === 'upcoming'),
    },
    {
      title: t('Завершены'),
      items: cycles.filter((c) => c.status === 'completed').reverse(),
    },
  ]
}

function moduleSections(modules: Module[]): Section[] {
  const by = (...statuses: Module['status'][]) =>
    modules.filter((m) => statuses.includes(m.status))
  return [
    { title: t('В работе'), items: by('in_progress') },
    { title: t('Запланированы'), items: by('backlog') },
    { title: t('Приостановлены'), items: by('paused') },
    { title: t('Завершены и отменены'), items: by('completed', 'cancelled') },
  ]
}

/**
 * «Этапы» (4.F3) and «Модули» (4.F4) of a project: cards with status, dates and
 * progress by state group. A card opens the project's board filtered by it.
 * Members create and edit, admins also delete (ADR-031); guests only look.
 */
export function ScopeListPage({ kind }: { kind: ScopeKind }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id: projectId } = useParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug
  const timeZone =
    workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const role = useMyRole()
  const canEdit = role !== null && role !== 'guest'
  const canDelete = role === 'owner' || role === 'admin'
  const text = SCOPE_TEXT[kind]
  const isCycle = kind === 'cycle'

  const [project, setProject] = useState<Project | null>(null)
  const [items, setItems] = useState<Scope[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [editing, setEditing] = useState<Scope | 'new' | null>(null)
  // Remounts the dialog so its form starts from the item opened.
  const [dialogKey, setDialogKey] = useState(0)
  const [removing, setRemoving] = useState<Scope | null>(null)

  useEffect(() => {
    if (!slug || !projectId) return
    let cancelled = false
    ;(async () => {
      setItems(null)
      setError(null)
      try {
        const [p, list] = await Promise.all([
          getProject(slug, projectId),
          isCycle ? getCycles(slug, projectId) : getModules(slug, projectId),
        ])
        if (cancelled) return
        setProject(p)
        setItems(list)
      } catch (err) {
        if (cancelled) return
        setError(
          errorText(
            err,
            isCycle
              ? t('Не удалось загрузить этапы')
              : t('Не удалось загрузить модули'),
          ),
        )
        setItems([])
      }
    })()
    // Leads are shown by name, the deactivated ones too.
    if (!isCycle)
      getWorkspaceMembers(slug, { includeDeactivated: true }).then(
        (list) => !cancelled && setMembers(list),
        () => !cancelled && setMembers([]),
      )
    return () => {
      cancelled = true
    }
  }, [slug, projectId, isCycle, t])

  function openDialog(item: Scope | 'new') {
    setDialogKey((k) => k + 1)
    setEditing(item)
  }

  function saved(item: Scope) {
    setItems((prev) => {
      if (!prev) return [item]
      if (prev.some((x) => x.id === item.id))
        return prev.map((x) => (x.id === item.id ? item : x))
      return [...prev, item]
    })
  }

  async function remove(item: Scope) {
    if (!slug || !projectId) return
    const snapshot = items
    setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? null)
    try {
      if (isCycle) await deleteCycle(slug, projectId, item.id)
      else await deleteModule(slug, projectId, item.id)
      toast.success(
        isCycle
          ? t('Этап «{{name}}» удалён', { name: item.name })
          : t('Модуль «{{name}}» удалён', { name: item.name }),
      )
    } catch (err) {
      setItems(snapshot)
      toast.error(
        errorText(
          err,
          isCycle
            ? t('Не удалось удалить этап')
            : t('Не удалось удалить модуль'),
        ),
      )
    }
  }

  // Cycles come from the server ordered by start date; modules by creation.
  const sections = (
    items
      ? isCycle
        ? cycleSections(items as Cycle[])
        : moduleSections(items as Module[])
      : []
  ).filter((s) => s.items.length > 0)
  const Icon = isCycle ? RefreshCw : Layers

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 md:px-6">
        <Link
          to={`/projects/${projectId}/work-items`}
          className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          title={t('К задачам проекта')}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-sm"
            style={{
              backgroundColor: project?.color
                ? `${project.color}26`
                : undefined,
            }}
          >
            {project?.icon ?? '📁'}
          </span>
          <span className="hidden truncate sm:inline">
            {project?.name ?? ''}
          </span>
        </Link>
        <span className="hidden text-muted-foreground/60 sm:inline">/</span>
        <h1 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon size={15} className="text-muted-foreground" />
          {text.many()}
        </h1>
        {items && items.length > 0 && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {items.length}
          </span>
        )}
        {canEdit && slug && projectId && (
          <Button
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => openDialog('new')}
            disabled={items === null || !!error}
          >
            <Plus size={15} />
            {text.create()}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-6">
          {items === null ? (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:gap-8"
                >
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-1.5 w-full md:w-64" />
                </div>
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={AlertCircle}
              title={
                isCycle
                  ? t('Не удалось загрузить этапы')
                  : t('Не удалось загрузить модули')
              }
              description={error}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Icon}
              title={isCycle ? t('Этапов пока нет') : t('Модулей пока нет')}
              description={
                isCycle
                  ? t(
                      'Этап — период работы проекта: семестр, квартал, подготовка к проверке. На доске этапа видны только его задачи, а прогресс считается сам.',
                    )
                  : t(
                      'Модуль — постоянное направление работы проекта со своим руководителем: приёмная кампания, аккредитация, сайт. Прогресс по задачам модуля считается сам.',
                    )
              }
              action={
                canEdit
                  ? { label: text.create(), onClick: () => openDialog('new') }
                  : undefined
              }
            />
          ) : (
            sections.map((section) => (
              <section key={section.title} className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {section.title}
                  <span className="text-xs font-normal text-muted-foreground">
                    {section.items.length}
                  </span>
                </h2>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {section.items.map((item) => (
                    <ScopeRow
                      key={item.id}
                      kind={kind}
                      item={item}
                      projectId={projectId!}
                      timeZone={timeZone}
                      lead={
                        'lead_id' in item && item.lead_id
                          ? members.find((m) => m.user_id === item.lead_id)
                          : undefined
                      }
                      onOpen={() =>
                        navigate(scopeBoardPath(kind, projectId!, item.id))
                      }
                      onEdit={canEdit ? () => openDialog(item) : undefined}
                      onDelete={canDelete ? () => setRemoving(item) : undefined}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      {slug && projectId && (
        <ScopeDialog
          key={dialogKey}
          kind={kind}
          item={editing === 'new' ? null : editing}
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          slug={slug}
          projectId={projectId}
          members={members}
          onSaved={saved}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={
          isCycle
            ? t('Удалить этап «{{name}}»?', { name: removing?.name ?? '' })
            : t('Удалить модуль «{{name}}»?', { name: removing?.name ?? '' })
        }
        description={
          isCycle
            ? t(
                'Задачи этапа останутся в проекте, но уже вне этапа. В истории каждой задачи появится запись об этом.',
              )
            : t(
                'Задачи модуля останутся в проекте и в других модулях. В истории каждой задачи появится запись об этом.',
              )
        }
        confirmLabel={t('Удалить')}
        onConfirm={() => removing && void remove(removing)}
      />
    </div>
  )
}

/**
 * One cycle or module: name, status, dates and what they mean today on the
 * left, progress on the right (below on a phone). The row is a link to its board.
 */
function ScopeRow({
  kind,
  item,
  projectId,
  timeZone,
  lead,
  onOpen,
  onEdit,
  onDelete,
}: {
  kind: ScopeKind
  item: Scope
  projectId: string
  timeZone: string
  lead: WorkspaceMember | undefined
  onOpen: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const status = scopeStatus(item)
  const range = dateRange(item.start_date, scopeEnd(item))
  const hint = timeHint(item, timeZone)
  const leadId = 'lead_id' in item ? item.lead_id : null

  return (
    <li className="group relative flex items-start gap-2 px-4 py-3.5 transition-colors focus-within:bg-muted/40 hover:bg-muted/40 md:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {/* The whole row is the link (the pseudo-element covers it). */}
            <Link
              to={scopeBoardPath(kind, projectId, item.id)}
              className="truncate font-medium text-foreground outline-none after:absolute after:inset-0 group-hover:text-primary"
              title={item.name}
            >
              {item.name}
            </Link>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: `${status.color}1f`, color: status.color }}
            >
              {status.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {range && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <CalendarRange size={12} />
                {range}
              </span>
            )}
            {hint && (
              <span
                className={cn(
                  'flex items-center gap-1 whitespace-nowrap',
                  hint.overdue && 'text-destructive',
                )}
              >
                <Clock size={12} />
                {hint.text}
              </span>
            )}
            {kind === 'module' &&
              (lead ? (
                <span
                  className="flex min-w-0 items-center gap-1.5"
                  title={t('Руководитель: {{name}}', {
                    name: fullName(lead.user),
                  })}
                >
                  <PersonAvatar
                    person={{ ...lead.user, id: lead.user_id }}
                    size={16}
                    title={false}
                  />
                  <span className="truncate text-foreground">
                    {shortName(lead.user)}
                  </span>
                </span>
              ) : (
                // Until the members arrive a set lead shows nothing, not «нет».
                !leadId && <span>{t('Руководитель не назначен')}</span>
              ))}
          </div>
          {item.description && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground md:line-clamp-1">
              {item.description}
            </p>
          )}
        </div>
        <ScopeProgress
          progress={item.progress}
          className="w-full shrink-0 md:w-56 lg:w-72"
        />
      </div>

      {(onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="relative z-10 -mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={
                kind === 'cycle'
                  ? t('Действия с этапом «{{name}}»', { name: item.name })
                  : t('Действия с модулем «{{name}}»', { name: item.name })
              }
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onOpen}>
              <LayoutGrid size={14} />
              {t('Открыть доску')}
            </DropdownMenuItem>
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil size={14} />
                {t('Изменить')}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 size={14} />
                  {t('Удалить')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}
