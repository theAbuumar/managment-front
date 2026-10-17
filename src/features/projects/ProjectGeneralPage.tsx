import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getProject, updateProject, deleteProject, type Project } from '@/api/project'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { getDepartments, type Department } from '@/api/department'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { errorText } from '@/lib/errorMessages'
import { dateInputToIso, isoToDateInput } from '@/lib/dates'
import { ProjectFields } from './ProjectFields'
import { EMPTY_PROJECT, type ProjectFormValue } from './projectForm'

function toForm(p: Project, timeZone: string): ProjectFormValue {
  return {
    ...EMPTY_PROJECT,
    name: p.name,
    identifier: p.identifier,
    description: p.description ?? '',
    status: p.status,
    visibility: p.visibility,
    start: isoToDateInput(p.start_date, timeZone),
    target: isoToDateInput(p.target_date, timeZone),
    department_id: p.department_id ?? '',
    lead_id: p.lead_id ?? '',
    icon: p.icon ?? '📁',
    color: p.color ?? '#3B82F6',
  }
}

export function ProjectGeneralPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const timeZone = workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const [project, setProject] = useState<Project | null>(null)
  const [value, setValue] = useState<ProjectFormValue>(EMPTY_PROJECT)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!workspace || !projectId) return
      const [p, mem, dep] = await Promise.all([
        getProject(workspace.slug, projectId).catch(() => null),
        getWorkspaceMembers(workspace.slug).catch(() => []),
        getDepartments(workspace.slug).catch(() => []),
      ])
      if (cancelled) return
      setMembers(mem)
      setDepartments(dep)
      if (p) {
        setProject(p)
        setValue(toForm(p, timeZone))
      }
    })().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [workspace?.slug, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!workspace || !projectId || !value.name.trim()) return
    setBusy(true)
    try {
      const updated = await updateProject(workspace.slug, projectId, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        status: value.status,
        visibility: value.visibility,
        start_date: dateInputToIso(value.start),
        target_date: dateInputToIso(value.target),
        department_id: value.department_id || null,
        lead_id: value.lead_id || null,
        icon: value.icon,
        color: value.color,
      })
      setProject(updated)
      setValue(toForm(updated, timeZone))
      toast.success(t('Проект сохранён'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить проект')))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!workspace || !projectId) return
    try {
      await deleteProject(workspace.slug, projectId)
      toast.success(t('Проект перемещён в корзину'))
      navigate('/projects-list')
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить проект')))
    }
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-6 text-sm font-medium">
        <Settings size={16} />
        {t('Общие')}
      </div>

      {loading ? (
        <div className="max-w-3xl space-y-4 px-8 py-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-3xl px-8 py-6">
          <ProjectFields value={value} onChange={setValue} members={members} departments={departments} mode="edit" />

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={save} disabled={busy || !value.name.trim()}>
              {busy ? t('Сохраняем…') : t('Сохранить')}
            </Button>
          </div>

          <div className="mt-10 flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-semibold">{t('Удалить проект')}</p>
              <p className="text-xs text-muted-foreground">
                {t('Проект и его задачи перемещаются в корзину. Восстановить можно в течение 30 дней.')}
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmOpen(true)}
            >
              {t('Удалить')}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Удалить проект «{{name}}»?', { name: project?.name ?? '' })}
        description={t('Проект и все его задачи будут перемещены в корзину.')}
        confirmLabel={t('Удалить')}
        cancelLabel={t('Отмена')}
        onConfirm={remove}
      />
    </div>
  )
}
