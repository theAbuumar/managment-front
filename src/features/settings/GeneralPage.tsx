import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, ImageUp } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ImageCropDialog } from '@/components/ui/image-crop-dialog'
import { TimezoneSelect } from '@/components/ui/timezone-select'
import { WorkspaceLogo } from '@/components/ui/workspace-logo'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  updateWorkspace,
  deleteWorkspace,
  leaveWorkspace,
  getWorkspaceMembers,
  type WorkspaceData,
} from '@/api/workspace'
import { uploadLogo } from '@/api/media'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { errorText } from '@/lib/errorMessages'
import { browserTimeZone } from '@/lib/timezones'
import { LANGUAGES } from '@/i18n'

// Workspace settings → General (Ф3 3.F2): logo, name, short name, description,
// time zone (deadlines and reminders are computed in it) and default language.
// Editing is for the owner and admins (PATCH /workspaces/:slug is admin+);
// everyone else sees the same page read-only.

const LIMITS = { name: 100, short_name: 30, description: 1000 }

interface Form {
  name: string
  short_name: string
  description: string
  timezone: string
  locale: 'ru' | 'en'
}

function toForm(w: WorkspaceData | null): Form {
  return {
    name: w?.name ?? '',
    short_name: w?.short_name ?? '',
    description: w?.description ?? '',
    timezone: w?.timezone ?? browserTimeZone(),
    locale: w?.locale === 'en' ? 'en' : 'ru',
  }
}

export function GeneralPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const reset = useWorkspaceStore((s) => s.reset)
  const userId = useAuthStore((s) => s.user?.id)

  const initialKey = JSON.stringify(toForm(workspace))
  const initial = useMemo(() => JSON.parse(initialKey) as Form, [initialKey])
  const [form, setForm] = useState<Form>(initial)
  const [seedKey, setSeedKey] = useState(initialKey)
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [logoOpen, setLogoOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)

  // Reseed after a save or a workspace switch.
  if (seedKey !== initialKey) {
    setSeedKey(initialKey)
    setForm(initial)
  }

  // Only the owner may delete it; everyone else may leave. owner_id ships with
  // the workspace, so this is known on first render.
  const isOwner = !!userId && workspace?.owner_id === userId
  const canEdit = isOwner || role === 'admin'

  const slug = workspace?.slug
  useEffect(() => {
    if (!slug || !userId) return
    let cancelled = false
    getWorkspaceMembers(slug)
      .then((list) => {
        if (!cancelled)
          setRole(list.find((m) => m.user_id === userId)?.role ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug, userId])

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const valid = form.name.trim().length > 0
  const dirty = (Object.keys(form) as (keyof Form)[]).some(
    (k) => form[k] !== initial[k],
  )

  function applyUpdated(updated: WorkspaceData) {
    setWorkspace(updated)
    setWorkspaces(workspaces.map((w) => (w.id === updated.id ? updated : w)))
  }

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
    if (!workspace || !valid || !dirty) return
    setBusy(true)
    try {
      applyUpdated(
        await updateWorkspace(workspace.slug, {
          name: form.name.trim(),
          short_name: form.short_name.trim() || null,
          description: form.description.trim() || null,
          timezone: form.timezone,
          locale: form.locale,
        }),
      )
      toast.success(t('Изменения сохранены'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить')))
    } finally {
      setBusy(false)
    }
  }

  async function saveLogo(file: File) {
    if (!workspace) return
    try {
      const url = await uploadLogo(workspace.slug, file)
      applyUpdated(await updateWorkspace(workspace.slug, { logo_url: url }))
      toast.success(t('Логотип обновлён'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось загрузить логотип')))
      throw err
    }
  }

  async function removeLogo() {
    if (!workspace) return
    try {
      applyUpdated(await updateWorkspace(workspace.slug, { logo_url: null }))
      toast.success(t('Логотип удалён'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить логотип')))
    }
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <Building2 size={16} />
        {t('Общие')}
      </div>

      <div className="max-w-3xl space-y-6 px-4 py-6 md:px-8">
        {/* Identity + logo */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <WorkspaceLogo workspace={workspace} size={72} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{workspace?.name}</p>
            {workspace?.short_name && (
              <p className="truncate text-sm text-muted-foreground">
                {workspace.short_name}
              </p>
            )}
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLogoOpen(true)}
                >
                  <ImageUp size={14} />
                  {workspace?.logo_url
                    ? t('Заменить логотип')
                    : t('Загрузить логотип')}
                </Button>
                {workspace?.logo_url && (
                  <Button size="sm" variant="ghost" onClick={removeLogo}>
                    {t('Удалить логотип')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {!canEdit && role !== null && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t(
              'Изменять настройки пространства могут владелец и администраторы.',
            )}
          </p>
        )}

        {/* Fields */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label={t('Название организации')} htmlFor="ws-name" required>
            <Input
              id="ws-name"
              value={form.name}
              maxLength={LIMITS.name}
              disabled={!canEdit}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field
            label={t('Краткое название')}
            htmlFor="ws-short"
            hint={t('Аббревиатура, например «ГУ»')}
          >
            <Input
              id="ws-short"
              value={form.short_name}
              maxLength={LIMITS.short_name}
              disabled={!canEdit}
              onChange={(e) => set('short_name', e.target.value)}
            />
          </Field>
          <div className="md:col-span-2">
            <Field
              label={t('Описание')}
              htmlFor="ws-desc"
              hint={
                canEdit
                  ? t('{{n}} из {{max}} символов', {
                      n: form.description.length,
                      max: LIMITS.description,
                    })
                  : undefined
              }
            >
              <Textarea
                id="ws-desc"
                value={form.description}
                maxLength={LIMITS.description}
                rows={3}
                disabled={!canEdit}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
          </div>
          <Field
            label={t('Часовой пояс')}
            htmlFor="ws-tz"
            hint={t(
              'В нём считаются сроки задач, просрочка и время напоминаний.',
            )}
          >
            <TimezoneSelect
              id="ws-tz"
              value={form.timezone}
              disabled={!canEdit}
              onChange={(v) => v && set('timezone', v)}
            />
          </Field>
          <Field label={t('Язык по умолчанию')} htmlFor="ws-locale">
            <Select
              value={form.locale}
              onValueChange={(v) => set('locale', v as Form['locale'])}
              disabled={!canEdit || LANGUAGES.length < 2}
            >
              <SelectTrigger id="ws-locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={t('Идентификатор (в адресах)')}
            htmlFor="ws-slug"
            hint={t('Не меняется: на него ведут ссылки из писем и Telegram.')}
          >
            <Input id="ws-slug" disabled value={workspace?.slug ?? ''} />
          </Field>
        </div>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={busy || !dirty || !valid}>
              {busy ? t('Сохраняем…') : t('Сохранить')}
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => setForm(initial)}
                disabled={busy}
              >
                {t('Отменить изменения')}
              </Button>
            )}
          </div>
        )}

        {isOwner ? (
          <DangerRow
            title={t('Удалить пространство')}
            text={t(
              'Все проекты, задачи и файлы пространства будут удалены без возможности восстановления.',
            )}
            action={t('Удалить')}
            onClick={() => setConfirmOpen(true)}
          />
        ) : (
          <DangerRow
            title={t('Покинуть пространство')}
            text={t(
              'Вы потеряете доступ к проектам и задачам пространства. Вернуться можно только по новому приглашению.',
            )}
            action={t('Покинуть')}
            onClick={() => setLeaveOpen(true)}
          />
        )}
      </div>

      <ImageCropDialog
        open={logoOpen}
        onOpenChange={setLogoOpen}
        title={t('Логотип пространства')}
        shape="square"
        onSave={saveLogo}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Удалить пространство?')}
        description={t(
          'Пространство «{{name}}» будет удалено вместе со всеми проектами и задачами. Это действие нельзя отменить.',
          { name: workspace?.name ?? '' },
        )}
        confirmLabel={t('Удалить')}
        cancelLabel={t('Отмена')}
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
        cancelLabel={t('Отмена')}
        onConfirm={leave}
      />
    </div>
  )
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm text-muted-foreground"
      >
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function DangerRow({
  title,
  text,
  action,
  onClick,
}: {
  title: string
  text: string
  action: string
  onClick: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      <Button
        variant="outline"
        className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
        onClick={onClick}
      >
        {action}
      </Button>
    </div>
  )
}
