import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bookmark,
  MoreHorizontal,
  Pencil,
  PanelsTopLeft,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteView, getViews, updateView, type SavedView } from '@/api/views'
import { getProjects, type Project } from '@/api/project'
import { getDepartments, type Department } from '@/api/department'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { VIEW_LABELS, describeFilters, viewHref } from './filters'

/**
 * «Виды» (7.F5): saved selections — shared first, then mine. `/views` lists every
 * view, `/projects/:id/views` those of one project. A view opens its page with
 * its filters; renaming and deleting are offered to whoever may change it (a
 * personal view — its author, a shared one — admins; checked by the API).
 */
export function ViewsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id: projectId } = useParams()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const [views, setViews] = useState<SavedView[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [removing, setRemoving] = useState<SavedView | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setViews(null)
      try {
        const res = await getViews(slug, projectId)
        if (!cancelled) setViews(res.data)
      } catch (err) {
        if (cancelled) return
        toast.error(errorText(err, t('Не удалось загрузить виды')))
        setViews([])
      }
    })()
    getProjects(slug).then(setProjects, () => setProjects([]))
    getDepartments(slug).then(setDepartments, () => setDepartments([]))
    getWorkspaceMembers(slug).then(setMembers, () => setMembers([]))
    return () => {
      cancelled = true
    }
  }, [slug, projectId, t])

  const project = projects.find((p) => p.id === projectId)
  const names = useMemo(
    () => ({
      person: (id: string) =>
        shortName(members.find((m) => m.user_id === id)?.user) || undefined,
      department: (id: string) => {
        const d = departments.find((x) => x.id === id)
        return d ? d.short_name || d.name : undefined
      },
      project: (id: string) => projects.find((p) => p.id === id)?.name,
    }),
    [members, departments, projects],
  )

  async function rename() {
    if (!slug || !renaming || !renaming.name.trim()) return
    try {
      const updated = await updateView(slug, renaming.id, {
        name: renaming.name.trim(),
      })
      setViews(
        (prev) => prev?.map((v) => (v.id === updated.id ? updated : v)) ?? null,
      )
      setRenaming(null)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось переименовать вид')))
    }
  }

  async function remove(view: SavedView) {
    if (!slug) return
    const snapshot = views
    setViews((prev) => prev?.filter((v) => v.id !== view.id) ?? null)
    try {
      await deleteView(slug, view.id)
      toast.success(t('Вид «{{name}}» удалён', { name: view.name }))
    } catch (err) {
      setViews(snapshot)
      toast.error(errorText(err, t('Не удалось удалить вид')))
    }
  }

  const groups = [
    {
      title: t('Общие'),
      hint: t('Видны всем сотрудникам, меняют администраторы'),
      items: views?.filter((v) => v.is_shared) ?? [],
    },
    {
      title: t('Мои'),
      hint: t('Видны только вам'),
      items: views?.filter((v) => !v.is_shared) ?? [],
    },
  ]

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <PanelsTopLeft size={16} />
        {project
          ? t('Виды проекта «{{name}}»', { name: project.name })
          : t('Виды')}
      </div>

      <div className="max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <p className="text-sm text-muted-foreground">
          {t(
            'Сохранённые выборки: фильтры и способ показа открываются одним щелчком. Сохранить вид — кнопка «Виды» на доске проекта или в списке задач.',
          )}
        </p>

        {views === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : views.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={t('Сохранённых видов пока нет')}
            description={t(
              'Настройте фильтры на доске проекта и нажмите «Виды» → «Сохранить вид…».',
            )}
            action={
              projectId
                ? {
                    label: t('К задачам проекта'),
                    onClick: () =>
                      navigate(`/projects/${projectId}/work-items`),
                  }
                : undefined
            }
          />
        ) : (
          groups
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <section key={group.title} className="space-y-2">
                <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                  {group.title}
                  <span className="text-xs font-normal text-muted-foreground">
                    {group.hint}
                  </span>
                </h2>
                <ul
                  className="divide-y divide-border rounded-lg border border-border"
                  data-testid="views-list"
                >
                  {group.items.map((view) => {
                    const chips = describeFilters(view.filters, names)
                    return (
                      <li
                        key={view.id}
                        className="flex items-start gap-3 px-3 py-3 sm:px-4"
                      >
                        <button
                          type="button"
                          onClick={() => navigate(viewHref(view))}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
                            {view.is_shared && (
                              <Users
                                size={13}
                                className="shrink-0 text-muted-foreground"
                              />
                            )}
                            <span className="truncate">{view.name}</span>
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {view.project
                                ? `${view.project.icon ?? '📁'} ${view.project.name}`
                                : t('Все проекты')}
                            </span>
                            {view.project && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                                {VIEW_LABELS[view.display.view ?? 'board']()}
                              </span>
                            )}
                            {chips.map((c) => (
                              <span
                                key={c}
                                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
                              >
                                {c}
                              </span>
                            ))}
                          </span>
                        </button>
                        {view.can_edit && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-muted"
                                aria-label={t('Действия с видом «{{name}}»', {
                                  name: view.name,
                                })}
                              >
                                <MoreHorizontal size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() =>
                                  setRenaming({ id: view.id, name: view.name })
                                }
                              >
                                <Pencil size={14} />
                                {t('Переименовать')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setRemoving(view)}
                              >
                                <Trash2 size={14} />
                                {t('Удалить')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
        )}
      </div>

      <Dialog
        open={!!renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('Переименовать вид')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void rename()
            }}
          >
            <Input
              autoFocus
              maxLength={80}
              value={renaming?.name ?? ''}
              aria-label={t('Название')}
              onChange={(e) =>
                renaming && setRenaming({ ...renaming, name: e.target.value })
              }
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenaming(null)}
              >
                {t('Отмена')}
              </Button>
              <Button type="submit" disabled={!renaming?.name.trim()}>
                {t('Сохранить')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('Удалить вид «{{name}}»?', { name: removing?.name ?? '' })}
        description={
          removing?.is_shared
            ? t('Вид пропадёт у всех сотрудников. Задачи не изменятся.')
            : t('Задачи не изменятся.')
        }
        confirmLabel={t('Удалить')}
        onConfirm={() => removing && void remove(removing)}
      />
    </div>
  )
}
