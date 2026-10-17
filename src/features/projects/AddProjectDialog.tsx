import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createProject } from '@/api/project'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { getDepartments, type Department } from '@/api/department'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { errorText } from '@/lib/errorMessages'
import { dateInputToIso } from '@/lib/dates'
import { ProjectFields } from './ProjectFields'
import { EMPTY_PROJECT, type ProjectFormValue } from './projectForm'

export function AddProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [value, setValue] = useState<ProjectFormValue>(EMPTY_PROJECT)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    getWorkspaceMembers(workspace.slug).then(setMembers).catch(() => setMembers([]))
    getDepartments(workspace.slug).then(setDepartments).catch(() => setDepartments([]))
  }, [open, workspace])

  async function create() {
    if (!workspace || !value.name.trim() || !value.identifier) return
    setBusy(true)
    try {
      await createProject(workspace.slug, {
        name: value.name.trim(),
        identifier: value.identifier,
        description: value.description.trim() || undefined,
        lead_id: value.lead_id || null,
        status: value.status,
        visibility: value.visibility,
        start_date: dateInputToIso(value.start),
        target_date: dateInputToIso(value.target),
        department_id: value.department_id || null,
        icon: value.icon,
        color: value.color,
        member_ids: value.member_ids,
      })
      toast.success(t('Проект «{{name}}» создан', { name: value.name.trim() }))
      setValue(EMPTY_PROJECT)
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось создать проект')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setValue(EMPTY_PROJECT)
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Новый проект')}</DialogTitle>
        </DialogHeader>
        <ProjectFields value={value} onChange={setValue} members={members} departments={departments} mode="create" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Отмена')}
          </Button>
          <Button onClick={create} disabled={busy || !value.name.trim() || !value.identifier}>
            {busy ? t('Создаём…') : t('Создать проект')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
