import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  updateWorkspace,
  deleteWorkspace,
  leaveWorkspace,
} from '@/api/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { errorText } from '@/lib/errorMessages'

export function GeneralPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const reset = useWorkspaceStore((s) => s.reset)
  const userId = useAuthStore((s) => s.user?.id)

  const [name, setName] = useState(workspace?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)

  const wsInitial = workspace?.name?.[0]?.toUpperCase() ?? 'W'

  // Only the owner may delete it; everyone else may leave. owner_id ships with
  // the workspace, so this is known on first render.
  const isOwner = !!userId && workspace?.owner_id === userId

  // After deleting or leaving: switch to another workspace, or onboard.
  function dropCurrentWorkspace() {
    if (!workspace) return
    const remaining = workspaces.filter((w) => w.id !== workspace.id)
    if (remaining.length > 0) {
      setWorkspaces(remaining)
      setWorkspace(remaining[0])
      navigate('/')
    } else {
      reset()
      navigate('/onboarding/workspace')
    }
  }

  async function remove() {
    if (!workspace) return
    try {
      await deleteWorkspace(workspace.slug)
      toast.success(t('Пространство удалено'))
      dropCurrentWorkspace()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить пространство')))
    }
  }

  async function leave() {
    if (!workspace) return
    try {
      await leaveWorkspace(workspace.slug)
      toast.success(t('Вы покинули «{{name}}»', { name: workspace.name }))
      dropCurrentWorkspace()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось покинуть пространство')))
    }
  }

  async function save() {
    if (!workspace || !name.trim()) return
    setBusy(true)
    try {
      const updated = await updateWorkspace(workspace.slug, {
        name: name.trim(),
      })
      setWorkspace(updated)
      setWorkspaces(workspaces.map((w) => (w.id === updated.id ? updated : w)))
      toast.success(t('Изменения сохранены'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-6 text-sm font-medium">
        <Building2 size={16} />
        {t('Общие')}
      </div>

      <div className="max-w-3xl px-8 py-6">
        {/* Identity */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary text-2xl font-bold text-primary-foreground">
            {wsInitial}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold">{workspace?.name}</p>
            <p className="text-sm text-muted-foreground">{workspace?.slug}</p>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">
              {t('Название пространства')}
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">
              {t('Идентификатор (в адресах)')}
            </label>
            <Input disabled value={workspace?.slug ?? ''} />
          </div>
        </div>

        <Button className="mt-6" onClick={save} disabled={busy || !name.trim()}>
          {busy ? t('Сохраняем…') : t('Сохранить')}
        </Button>

        {isOwner ? (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-semibold">
                {t('Удалить пространство')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  'Все проекты, задачи и файлы пространства будут удалены без возможности восстановления.',
                )}
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
        ) : (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-semibold">
                {t('Покинуть пространство')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  'Вы потеряете доступ к проектам и задачам пространства. Вернуться можно только по новому приглашению.',
                )}
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setLeaveOpen(true)}
            >
              {t('Покинуть')}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Удалить пространство?')}
        description={t(
          'Пространство «{{name}}» будет удалено вместе со всеми проектами и задачами. Это действие нельзя отменить.',
          { name: workspace?.name ?? '' },
        )}
        confirmLabel={t('Удалить')}
        onConfirm={remove}
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t('Покинуть пространство?')}
        description={t('Вы перестанете быть участником «{{name}}».', {
          name: workspace?.name ?? '',
        })}
        confirmLabel={t('Покинуть')}
        onConfirm={leave}
      />
    </div>
  )
}
