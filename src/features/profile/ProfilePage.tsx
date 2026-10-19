import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Camera, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { ImageCropDialog } from '@/components/ui/image-crop-dialog'
import { TimezoneSelect } from '@/components/ui/timezone-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  updateMe,
  requestAccountDeletion,
  confirmAccountDeletion,
  type DeleteChallenge,
} from '@/api/auth'
import { uploadAvatar } from '@/api/media'
import {
  getWorkspaceMembers,
  ROLE_LABELS,
  type WorkspaceMember,
} from '@/api/workspace'
import { useAuthStore, type AuthUser } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { clearLocalSession } from '@/lib/session'
import { errorText } from '@/lib/errorMessages'
import { fullName } from '@/lib/people'
import { browserTimeZone, timeZoneLabel } from '@/lib/timezones'
import { LANGUAGES } from '@/i18n'
import { ConnectedAccountsSection } from './ConnectedAccountsSection'
import { NotificationPrefsSection } from './NotificationPrefsSection'
import { NotificationChannelsSection } from './NotificationChannelsSection'
import { SessionsSection } from './SessionsSection'
import { MyDataSection } from './MyDataSection'

// Profile page (Ф3 3.F1): ФИО, phone, language, time zone and avatar. Position and
// department belong to the workspace's org structure and are set by an admin, so
// they are shown read-only here.

// Same rule as the backend (auth/schema.ts → UpdateMeBodySchema.phone).
const PHONE_RE = /^\+?[0-9 ()-]{5,20}$/
const NAME_MAX = 60

interface Form {
  last_name: string
  first_name: string
  middle_name: string
  phone: string
  locale: 'ru' | 'en'
  timezone: string | null
}

function toForm(u: AuthUser | null): Form {
  // Accounts created before Ф3 (or via a provider) only have display_name —
  // seed the ФИО fields from a "Фамилия Имя Отчество" display name.
  const hasParts = !!(u?.last_name || u?.first_name)
  const words = hasParts
    ? []
    : (u?.display_name ?? '').trim().split(/\s+/).filter(Boolean)
  return {
    last_name: (hasParts ? u?.last_name : words[0]) ?? '',
    first_name: (hasParts ? u?.first_name : words[1]) ?? '',
    middle_name: (hasParts ? u?.middle_name : words.slice(2).join(' ')) ?? '',
    phone: u?.phone ?? '',
    locale: u?.locale === 'en' ? 'en' : 'ru',
    timezone: u?.timezone ?? null,
  }
}

export function ProfilePage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const workspace = useWorkspaceStore((s) => s.workspace)

  // Keyed by the field values, so an avatar change does not wipe unsaved edits.
  const initialKey = JSON.stringify(toForm(user))
  const initial = useMemo(() => JSON.parse(initialKey) as Form, [initialKey])
  const [form, setForm] = useState<Form>(initial)
  const [seedKey, setSeedKey] = useState(initialKey)
  const [busy, setBusy] = useState(false)
  const [member, setMember] = useState<WorkspaceMember | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Reseed the form when the saved profile changes (e.g. after a save).
  if (seedKey !== initialKey) {
    setSeedKey(initialKey)
    setForm(initial)
  }

  // My place in the current workspace's org structure (read-only here).
  const slug = workspace?.slug
  useEffect(() => {
    if (!slug || !user?.id) return
    let cancelled = false
    getWorkspaceMembers(slug)
      .then((list) => {
        if (!cancelled)
          setMember(list.find((m) => m.user_id === user.id) ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug, user?.id])

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const errors = {
    last_name: !form.last_name.trim() ? t('Укажите фамилию') : null,
    first_name: !form.first_name.trim() ? t('Укажите имя') : null,
    phone:
      form.phone.trim() && !PHONE_RE.test(form.phone.trim())
        ? t('Цифры, пробелы, скобки, дефис и + в начале — от 5 до 20 символов')
        : null,
  }
  const valid = !errors.last_name && !errors.first_name && !errors.phone
  const dirty = (Object.keys(form) as (keyof Form)[]).some(
    (k) => form[k] !== initial[k],
  )

  async function save() {
    if (!valid || !dirty) return
    setBusy(true)
    try {
      const updated = await updateMe({
        last_name: form.last_name.trim(),
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        phone: form.phone.trim() || null,
        locale: form.locale,
        timezone: form.timezone,
      })
      setUser(updated)
      toast.success(t('Профиль сохранён'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить профиль')))
    } finally {
      setBusy(false)
    }
  }

  async function saveAvatar(file: File) {
    try {
      const url = await uploadAvatar(file)
      setUser(await updateMe({ avatar_url: url }))
      toast.success(t('Фото обновлено'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось загрузить фото')))
      throw err
    }
  }

  async function removeAvatar() {
    try {
      setUser(await updateMe({ avatar_url: null }))
      toast.success(t('Фото удалено'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить фото')))
    }
  }

  if (!user) return null

  const wsZone = workspace?.timezone ?? browserTimeZone()
  const department = member?.department
    ? [
        member.department.name,
        member.department.short_name && `(${member.department.short_name})`,
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 text-sm font-semibold md:px-6">
        <UserRound size={15} />
        {t('Профиль')}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
          {/* Identity */}
          <section className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setCropOpen(true)}
              aria-label={t('Изменить фото')}
              className="group relative w-fit shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PersonAvatar person={user} size={88} title={false} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera size={22} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{fullName(user)}</p>
              {user.email && (
                <p className="truncate text-sm text-muted-foreground">
                  {user.email}
                </p>
              )}
              {member?.position && (
                <p className="mt-1 text-sm">{member.position}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCropOpen(true)}
                >
                  <Camera size={14} />
                  {user.avatar_url ? t('Изменить фото') : t('Загрузить фото')}
                </Button>
                {user.avatar_url && (
                  <Button size="sm" variant="ghost" onClick={removeAvatar}>
                    {t('Удалить фото')}
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Personal data */}
          <Section title={t('Личные данные')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field
                label={t('Фамилия')}
                htmlFor="p-last"
                required
                error={errors.last_name}
              >
                <Input
                  id="p-last"
                  value={form.last_name}
                  maxLength={NAME_MAX}
                  autoComplete="family-name"
                  onChange={(e) => set('last_name', e.target.value)}
                />
              </Field>
              <Field
                label={t('Имя')}
                htmlFor="p-first"
                required
                error={errors.first_name}
              >
                <Input
                  id="p-first"
                  value={form.first_name}
                  maxLength={NAME_MAX}
                  autoComplete="given-name"
                  onChange={(e) => set('first_name', e.target.value)}
                />
              </Field>
              <Field label={t('Отчество')} htmlFor="p-middle">
                <Input
                  id="p-middle"
                  value={form.middle_name}
                  maxLength={NAME_MAX}
                  autoComplete="additional-name"
                  onChange={(e) => set('middle_name', e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label={t('Телефон')}
                htmlFor="p-phone"
                error={errors.phone}
              >
                <Input
                  id="p-phone"
                  type="tel"
                  value={form.phone}
                  maxLength={20}
                  placeholder="+998 90 123-45-67"
                  autoComplete="tel"
                  onChange={(e) => set('phone', e.target.value)}
                />
              </Field>
              <Field
                label={t('Email')}
                htmlFor="p-email"
                hint={t('Используется для входа')}
              >
                <Input id="p-email" disabled value={user.email ?? '—'} />
              </Field>
            </div>
          </Section>

          {/* Regional settings */}
          <Section title={t('Язык и время')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('Язык интерфейса')} htmlFor="p-locale">
                <Select
                  value={form.locale}
                  onValueChange={(v) => set('locale', v as Form['locale'])}
                  disabled={LANGUAGES.length < 2}
                >
                  <SelectTrigger id="p-locale">
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
                label={t('Часовой пояс')}
                htmlFor="p-tz"
                hint={t(
                  'В нём показываются даты и время. Сроки задач считаются в поясе пространства.',
                )}
              >
                <TimezoneSelect
                  id="p-tz"
                  value={form.timezone}
                  onChange={(v) => set('timezone', v)}
                  emptyLabel={t('Как в пространстве — {{zone}}', {
                    zone: timeZoneLabel(wsZone),
                  })}
                />
              </Field>
            </div>
          </Section>

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

          {/* Org structure — read-only */}
          {workspace && (
            <Section
              title={t('Место в оргструктуре')}
              description={t(
                'Должность и подразделение задаёт администратор пространства «{{name}}».',
                {
                  name: workspace.name,
                },
              )}
            >
              <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                <ReadOnly label={t('Должность')} value={member?.position} />
                <ReadOnly label={t('Подразделение')} value={department} />
                <ReadOnly
                  label={t('Роль доступа')}
                  value={member ? ROLE_LABELS[member.role]() : ''}
                />
              </dl>
            </Section>
          )}

          <NotificationChannelsSection />

          <NotificationPrefsSection />

          <ConnectedAccountsSection />

          <SessionsSection />

          <MyDataSection />

          {/* Danger zone */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{t('Удалить аккаунт')}</p>
              <p className="text-xs text-muted-foreground">
                {t(
                  'Личные данные будут удалены, войти в аккаунт станет невозможно. Действие нельзя отменить.',
                )}
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              {t('Удалить аккаунт')}
            </Button>
          </div>
        </div>
      </div>

      <ImageCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        title={t('Фото профиля')}
        shape="circle"
        onSave={saveAvatar}
      />
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border p-4 md:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  error?: string | null
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
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function ReadOnly({ label, value }: { label: string; value?: string | null }) {
  const { t } = useTranslation()
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        {value || (
          <span className="text-muted-foreground">{t('не указано')}</span>
        )}
      </dd>
    </div>
  )
}

// Two-step, code-confirmed account deletion:
//   1) POST /auth/account/delete/request → a 6-digit code by email (or Telegram)
//   2) POST /auth/account/delete/confirm { code } → account anonymized, sessions
//      revoked server-side, so local auth is dropped and we go to /login.
function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState<'intro' | 'code'>('intro')
  const [challenge, setChallenge] = useState<DeleteChallenge | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const codeValid = /^\d{6}$/.test(code)

  function handleOpenChange(v: boolean) {
    if (!v) {
      setStep('intro')
      setChallenge(null)
      setCode('')
      setBusy(false)
    }
    onOpenChange(v)
  }

  async function requestCode() {
    setBusy(true)
    try {
      setChallenge(await requestAccountDeletion())
      setCode('')
      setStep('code')
    } catch (err) {
      toast.error(errorText(err, t('Не удалось начать удаление аккаунта')))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!codeValid) return
    setBusy(true)
    try {
      await confirmAccountDeletion(code)
      clearLocalSession()
      toast.success(t('Аккаунт удалён'))
      navigate('/login')
    } catch (err) {
      toast.error(errorText(err, t('Неверный код')))
    } finally {
      setBusy(false)
    }
  }

  const sentTo =
    challenge?.channel === 'telegram'
      ? t('ваш Telegram')
      : (challenge?.email ?? t('вашу почту'))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <Trash2 size={18} />
          </div>
          <div>
            <DialogTitle>{t('Удалить аккаунт?')}</DialogTitle>
            <DialogDescription className="mt-2">
              {step === 'intro'
                ? t(
                    'Аккаунт будет удалён без возможности восстановления. Пространства, где вы единственный владелец, перейдут другому участнику или будут удалены. Для подтверждения мы отправим код.',
                  )
                : t('Введите 6-значный код, отправленный на {{to}}.', {
                    to: sentTo,
                  })}
            </DialogDescription>
          </div>
        </div>

        {step === 'code' && (
          <div className="pl-14">
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmDelete()
              }}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              aria-label={t('Код подтверждения')}
              className="text-center tracking-[0.4em]"
            />
            <button
              type="button"
              onClick={requestCode}
              disabled={busy}
              className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              {t('Отправить код ещё раз')}
            </button>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            {t('Отмена')}
          </Button>
          {step === 'intro' ? (
            <Button variant="destructive" onClick={requestCode} disabled={busy}>
              {busy ? t('Отправляем…') : t('Получить код')}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={busy || !codeValid}
            >
              {busy ? t('Удаляем…') : t('Удалить аккаунт')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
