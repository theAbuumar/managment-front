import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, Check, Play, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getControlSettings,
  updateControlSettings,
  runReminders,
  type ControlSettings,
} from '@/api/control'
import { getWorkspaceMembers } from '@/api/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { errorText } from '@/lib/errorMessages'
import { plural, pluralize } from '@/lib/plural'
import { timeZoneLabel } from '@/lib/timezones'
import { cn } from '@/lib/utils'
import { t as translate } from '@/i18n'

// Workspace settings → «Контроль исполнения» (Ф5 5.F7): when deadline reminders
// go out, when an overdue assignment escalates, whether a hand-in needs a
// written report — plus a button that runs the reminder pass right away.

/** Days before the deadline a reminder can be sent on (0 = on the day). */
const DAY_OPTIONS = [14, 7, 5, 3, 2, 1, 0]
const MAX_REMINDERS = 5 // backend limit
const MAX_ESCALATION = 60
const HOURS = Array.from({ length: 24 }, (_, h) => h)

const days = (n: number) =>
  pluralize(n, [translate('день'), translate('дня'), translate('дней')])

function dayLabel(n: number): string {
  return n === 0
    ? translate('в день срока')
    : translate('за {{n}}', { n: days(n) })
}

const sameSettings = (a: ControlSettings, b: ControlSettings) =>
  a.reminder_hour === b.reminder_hour &&
  a.escalation_days === b.escalation_days &&
  a.require_report === b.require_report &&
  [...a.reminder_days].sort().join() === [...b.reminder_days].sort().join()

export function ControlSettingsPage() {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const userId = useAuthStore((s) => s.user?.id)
  const slug = workspace?.slug

  const [saved, setSaved] = useState<ControlSettings | null>(null)
  const [form, setForm] = useState<ControlSettings | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    Promise.all([
      getControlSettings(slug),
      getWorkspaceMembers(slug).catch(() => []),
    ])
      .then(([settings, members]) => {
        if (cancelled) return
        setSaved(settings)
        setForm(settings)
        const role = members.find((m) => m.user_id === userId)?.role
        setCanEdit(role === 'owner' || role === 'admin')
      })
      .catch((err) =>
        toast.error(errorText(err, t('Не удалось загрузить настройки'))),
      )
    return () => {
      cancelled = true
    }
  }, [slug, userId, t])

  const dirty = !!form && !!saved && !sameSettings(form, saved)
  const escalationValid =
    !!form &&
    Number.isInteger(form.escalation_days) &&
    form.escalation_days >= 0 &&
    form.escalation_days <= MAX_ESCALATION

  function toggleDay(n: number) {
    setForm((f) => {
      if (!f) return f
      const on = f.reminder_days.includes(n)
      if (!on && f.reminder_days.length >= MAX_REMINDERS) {
        toast.info(
          t('Можно выбрать не больше {{n}} напоминаний', { n: MAX_REMINDERS }),
        )
        return f
      }
      const next = on
        ? f.reminder_days.filter((d) => d !== n)
        : [...f.reminder_days, n]
      return { ...f, reminder_days: next.sort((a, b) => b - a) }
    })
  }

  async function save() {
    if (!slug || !form || !dirty || !escalationValid) return
    setBusy(true)
    try {
      const next = await updateControlSettings(slug, form)
      setSaved(next)
      setForm(next)
      toast.success(t('Настройки контроля сохранены'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить')))
    } finally {
      setBusy(false)
    }
  }

  async function runNow() {
    if (!slug) return
    setRunning(true)
    try {
      const { sent } = await runReminders(slug)
      const total = sent.due_soon + sent.overdue + sent.escalated
      const text =
        total === 0
          ? t('Новых напоминаний нет: всё, что положено, уже отправлено.')
          : t(
              'Отправлено: о сроке — {{a}}, о просрочке — {{b}}, эскалаций — {{c}}.',
              {
                a: sent.due_soon,
                b: sent.overdue,
                c: sent.escalated,
              },
            )
      setLastRun(text)
      toast.success(text)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось запустить напоминания')))
    } finally {
      setRunning(false)
    }
  }

  const zone = workspace?.timezone ? timeZoneLabel(workspace.timezone) : ''

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <ShieldCheck size={16} />
        {t('Контроль исполнения')}
      </div>

      <div className="max-w-3xl space-y-6 px-4 py-6 md:px-8">
        <p className="text-sm text-muted-foreground">
          {t(
            'Правила для поручений этого пространства: когда исполнители получают напоминания о сроке, когда просрочка уходит руководителю и что нужно приложить при сдаче на проверку.',
          )}
        </p>

        {!form ? (
          <div className="space-y-4">
            <Skeleton className="h-36" />
            <Skeleton className="h-28" />
          </div>
        ) : (
          <>
            {!canEdit && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {t('Изменять настройки могут владелец и администраторы.')}
              </p>
            )}

            <Section
              title={t('Напоминания о сроке')}
              description={t(
                'Исполнители получают уведомление в системе и в Telegram. После срока напоминание о просрочке приходит ежедневно, пока поручение открыто, — исполнителям и контролёру.',
              )}
            >
              <p className="mb-2 text-sm text-muted-foreground">
                {t('Когда напоминать')}
              </p>
              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((n) => {
                  const on = form.reminder_days.includes(n)
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={on}
                      onClick={() => toggleDay(n)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        on
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-border text-foreground hover:bg-muted',
                      )}
                    >
                      {on && <Check size={13} />}
                      {dayLabel(n)}
                    </button>
                  )
                })}
              </div>
              {form.reminder_days.length === 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  {t(
                    'Напоминания до срока выключены — останутся только уведомления о просрочке.',
                  )}
                </p>
              )}

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="ctl-hour"
                    className="mb-1.5 block text-sm text-muted-foreground"
                  >
                    {t('Время отправки')}
                  </label>
                  <Select
                    value={String(form.reminder_hour)}
                    onValueChange={(v) =>
                      setForm({ ...form, reminder_hour: Number(v) })
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger id="ctl-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {HOURS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {`${String(h).padStart(2, '0')}:00`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {zone && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('По часовому поясу пространства: {{zone}}', { zone })}
                    </p>
                  )}
                </div>
              </div>
            </Section>

            <Section
              title={t('Эскалация просрочки')}
              description={t(
                'Если поручение просрочено на указанное число дней, уведомление получают руководитель подразделения ответственного исполнителя и контролёр. Один раз на каждый срок.',
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="ctl-esc" className="text-sm">
                  {t('Через')}
                </label>
                <Input
                  id="ctl-esc"
                  type="number"
                  min={0}
                  max={MAX_ESCALATION}
                  value={
                    Number.isNaN(form.escalation_days)
                      ? ''
                      : form.escalation_days
                  }
                  disabled={!canEdit}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      escalation_days: e.target.valueAsNumber,
                    })
                  }
                  className="w-20"
                />
                <span className="text-sm">
                  {plural(
                    Number.isNaN(form.escalation_days)
                      ? 0
                      : form.escalation_days,
                    [t('день'), t('дня'), t('дней')],
                  )}{' '}
                  {t('просрочки')}
                </span>
              </div>
              <p
                className={cn(
                  'mt-1 text-xs',
                  escalationValid
                    ? 'text-muted-foreground'
                    : 'text-destructive',
                )}
              >
                {escalationValid
                  ? form.escalation_days === 0
                    ? t('0 — эскалация выключена.')
                    : t('0 — выключить эскалацию.')
                  : t('Целое число от 0 до {{max}}', { max: MAX_ESCALATION })}
              </p>
            </Section>

            <Section title={t('Сдача на проверку')}>
              <label className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-sm">
                    {t('Обязательный отчёт')}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      'Исполнитель не сможет отправить поручение на проверку без текста отчёта.',
                    )}
                  </span>
                </span>
                <Switch
                  checked={form.require_report}
                  disabled={!canEdit}
                  onCheckedChange={(v) =>
                    setForm({ ...form, require_report: v })
                  }
                />
              </label>
            </Section>

            {canEdit && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={save}
                  disabled={busy || !dirty || !escalationValid}
                >
                  {busy ? t('Сохраняем…') : t('Сохранить')}
                </Button>
                {dirty && saved && (
                  <Button
                    variant="ghost"
                    onClick={() => setForm(saved)}
                    disabled={busy}
                  >
                    {t('Отменить изменения')}
                  </Button>
                )}
              </div>
            )}

            {canEdit && (
              <Section
                title={t('Проверить сроки сейчас')}
                description={t(
                  'Система проверяет сроки каждые 5 минут и рассылает напоминания в выбранный час. Кнопка запускает проверку немедленно, без учёта часа. Одно и то же напоминание дважды не отправляется.',
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button variant="outline" onClick={runNow} disabled={running}>
                    {running ? (
                      <BellRing size={15} className="animate-pulse" />
                    ) : (
                      <Play size={15} />
                    )}
                    {running
                      ? t('Проверяем…')
                      : t('Запустить напоминания сейчас')}
                  </Button>
                  {lastRun && (
                    <p className="text-sm text-muted-foreground">{lastRun}</p>
                  )}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
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
