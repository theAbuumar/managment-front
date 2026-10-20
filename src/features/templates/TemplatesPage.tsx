import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FileStack,
  ListChecks,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useMyRole } from '@/stores/summaryStore'
import {
  deleteTemplate,
  getTemplates,
  type IssueTemplate,
} from '@/api/templates'
import { TemplateDialog } from './TemplateDialog'

// «Шаблоны» (Ф6 6.F3): in the project settings — the templates usable in the
// project (the workspace ones and its own); in the workspace settings — all of
// them, workspace templates first. Change and delete what you may (`can_edit`).

export function TemplatesPage({ scope }: { scope: 'workspace' | 'project' }) {
  const { t } = useTranslation()
  const { projectId } = useParams()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const role = useMyRole()
  const admin = role === 'owner' || role === 'admin'
  const inProject = scope === 'project' && projectId ? projectId : null
  const [templates, setTemplates] = useState<IssueTemplate[] | null>(null)
  const [editing, setEditing] = useState<IssueTemplate | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<IssueTemplate | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      const res = await getTemplates(slug, inProject ?? undefined).catch(
        () => ({ data: [] }),
      )
      if (!cancelled) setTemplates(res.data)
    })()
    return () => {
      cancelled = true
    }
  }, [slug, inProject])

  async function remove(tpl: IssueTemplate) {
    if (!slug) return
    try {
      await deleteTemplate(slug, tpl.id)
      setTemplates((list) => list?.filter((x) => x.id !== tpl.id) ?? null)
      toast.success(t('Шаблон удалён'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить шаблон')))
    }
  }

  function saved(tpl: IssueTemplate) {
    setTemplates((list) => {
      const rest = (list ?? []).filter((x) => x.id !== tpl.id)
      return [...rest, tpl].sort(
        (a, b) =>
          Number(a.project_id !== null) - Number(b.project_id !== null) ||
          a.name.localeCompare(b.name, 'ru'),
      )
    })
  }

  // Workspace settings: only admins create there (workspace templates).
  const canCreate = scope === 'project' || admin
  const groups = [
    {
      title: t('Шаблоны пространства'),
      items: (templates ?? []).filter((x) => !x.project_id),
    },
    {
      title: inProject ? t('Шаблоны проекта') : t('Шаблоны проектов'),
      items: (templates ?? []).filter((x) => x.project_id),
    },
  ].filter((g) => g.items.length > 0)

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <FileStack size={16} />
        {t('Шаблоны')}
        {canCreate && slug && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setEditing('new')}
          >
            <Plus size={14} />
            {t('Новый шаблон')}
          </Button>
        )}
      </div>

      <div className="max-w-3xl px-4 py-6 md:px-8">
        <p className="mb-5 text-sm text-muted-foreground">
          {scope === 'project'
            ? t(
                'Типовые задачи и поручения: в форме создания нажмите «Шаблон», и поля, контролёр, срок и чек-лист заполнятся сами. Шаблоны пространства доступны во всех проектах, их ведут администраторы.',
              )
            : t(
                'Шаблоны пространства доступны в каждом проекте. Создают и меняют их администраторы; шаблоны отдельных проектов ведут сами проекты.',
              )}
        </p>

        {templates === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={FileStack}
            title={t('Шаблонов пока нет')}
            description={t(
              'Шаблон экономит время на типовых поручениях: отчёты, справки, подготовка к проверкам.',
            )}
            action={
              canCreate
                ? { label: t('Новый шаблон'), onClick: () => setEditing('new') }
                : undefined
            }
          />
        ) : (
          groups.map((g) => (
            <section key={g.title} className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.title}
              </h2>
              <ul className="space-y-2" data-testid="templates">
                {g.items.map((tpl) => (
                  <li
                    key={tpl.id}
                    className="group flex items-start gap-3 rounded-md border border-border px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {tpl.data.kind === 'assignment' && (
                          <ShieldCheck
                            size={14}
                            className="shrink-0 text-primary"
                            aria-label={t('Поручение')}
                          />
                        )}
                        <span className="truncate">{tpl.name}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {tpl.data.title}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                        {tpl.project && !inProject && (
                          <span>
                            {tpl.project.icon ? `${tpl.project.icon} ` : ''}
                            {tpl.project.name}
                          </span>
                        )}
                        {tpl.due_in_days !== null && (
                          <span>
                            {t('срок — через {{n}} дн.', {
                              n: tpl.due_in_days,
                            })}
                          </span>
                        )}
                        {(tpl.data.checklist?.length ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5">
                            <ListChecks size={11} />
                            {tpl.data.checklist!.length}
                          </span>
                        )}
                        {tpl.created_by && (
                          <span>{shortName(tpl.created_by)}</span>
                        )}
                      </p>
                    </div>
                    {tpl.can_edit && (
                      <div className="flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          onClick={() => setEditing(tpl)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title={t('Изменить')}
                          aria-label={t('Изменить шаблон «{{name}}»', {
                            name: tpl.name,
                          })}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setToDelete(tpl)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title={t('Удалить')}
                          aria-label={t('Удалить шаблон «{{name}}»', {
                            name: tpl.name,
                          })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {editing && slug && (
        <TemplateDialog
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          slug={slug}
          projectId={inProject}
          template={editing === 'new' ? null : editing}
          canWorkspace={admin}
          onSaved={saved}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('Удалить шаблон «{{name}}»?', { name: toDelete?.name ?? '' })}
        description={t('Задачи, созданные по шаблону, останутся.')}
        confirmLabel={t('Удалить')}
        onConfirm={() => toDelete && void remove(toDelete)}
      />
    </div>
  )
}

export function ProjectTemplatesPage() {
  return <TemplatesPage scope="project" />
}

export function WorkspaceTemplatesPage() {
  return <TemplatesPage scope="workspace" />
}
