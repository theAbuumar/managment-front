import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  getNotificationSettings,
  updateNotificationSettings,
  sendTestNotification,
  sendDigestNow,
  type NotificationGroup,
  type NotificationSettings,
  type NotificationSettingsPatch,
} from '@/api/notification'
import { errorText } from '@/lib/errorMessages'
import { t as translate } from '@/i18n'

// Which events reach the user outside the app (Ф8 8.F3): event group × channel
// (Telegram, email as the fallback), quiet hours, digests (8.B5) and a test message.
// Saved on the server at once; the in-app inbox always gets everything. Letters link
// here with `/profile#notifications`.

const GROUPS: {
  key: NotificationGroup
  label: () => string
  hint: () => string
}[] = [
  {
    key: 'assigned',
    label: () => translate('Новые задачи и поручения'),
    hint: () => translate('вам поручили или назначили задачу'),
  },
  {
    key: 'review',
    label: () => translate('Проверка работ'),
    hint: () =>
      translate('сдача на проверку, принято, возвращено, ознакомление'),
  },
  {
    key: 'deadlines',
    label: () => translate('Сроки'),
    hint: () => translate('скоро срок, просрочка, переносы срока'),
  },
  {
    key: 'escalation',
    label: () => translate('Эскалации'),
    hint: () => translate('поручение долго просрочено'),
  },
  {
    key: 'digest',
    label: () => translate('Сводки'),
    hint: () => translate('ежедневная и недельная сводка — настраиваются ниже'),
  },
]

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

export function NotificationChannelsSection() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [testing, setTesting] = useState(false)
  const [digesting, setDigesting] = useState<'daily' | 'weekly' | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const loaded = settings !== null

  // «Настроить уведомления» in a letter opens /profile#notifications.
  useEffect(() => {
    if (loaded && window.location.hash === '#notifications') {
      sectionRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [loaded])

  // Reload when the tab regains focus: Telegram may have just been linked.
  useEffect(() => {
    let cancelled = false
    const load = () =>
      getNotificationSettings()
        .then((s) => !cancelled && setSettings(s))
        .catch(() => {})
    void load()
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      window.removeEventListener('focus', load)
    }
  }, [])

  // Optimistic: show the change, save it, roll back on failure.
  async function save(
    patch: NotificationSettingsPatch,
    optimistic: NotificationSettings,
  ) {
    const before = settings
    setSettings(optimistic)
    try {
      setSettings(await updateNotificationSettings(patch))
    } catch (err) {
      setSettings(before)
      toast.error(errorText(err, t('Не удалось сохранить настройки')))
    }
  }

  function toggle(
    channel: 'telegram' | 'email',
    group: NotificationGroup,
    on: boolean,
  ) {
    if (!settings) return
    void save(
      { [channel]: { [group]: on } },
      { ...settings, [channel]: { ...settings[channel], [group]: on } },
    )
  }

  function setQuiet(patch: Partial<NotificationSettings['quiet_hours']>) {
    if (!settings) return
    void save(
      { quiet_hours: patch },
      { ...settings, quiet_hours: { ...settings.quiet_hours, ...patch } },
    )
  }

  function setDigest(patch: Partial<NotificationSettings['digest']>) {
    if (!settings) return
    void save(
      { digest: patch },
      { ...settings, digest: { ...settings.digest, ...patch } },
    )
  }

  async function digestNow(kind: 'daily' | 'weekly') {
    setDigesting(kind)
    try {
      const { delivered_to } = await sendDigestNow(kind)
      if (delivered_to === 'telegram')
        toast.success(t('Сводка отправлена в Telegram'))
      else if (delivered_to === 'email')
        toast.success(t('Сводка отправлена на почту'))
      else
        toast.info(
          t(
            'Некуда отправить: включите сводки для Telegram или почты в таблице выше',
          ),
        )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отправить сводку')))
    } finally {
      setDigesting(null)
    }
  }

  async function test() {
    setTesting(true)
    try {
      const { delivered_to } = await sendTestNotification()
      if (delivered_to === 'telegram')
        toast.success(t('Тестовое сообщение отправлено в Telegram'))
      else if (delivered_to === 'email')
        toast.success(t('Тестовое письмо отправлено на почту'))
      else
        toast.info(t('Некуда отправить: подключите Telegram или укажите почту'))
    } catch (err) {
      toast.error(
        errorText(err, t('Не удалось отправить тестовое уведомление')),
      )
    } finally {
      setTesting(false)
    }
  }

  return (
    <section
      ref={sectionRef}
      id="notifications"
      className="scroll-mt-16 rounded-lg border border-border p-4 md:p-5"
    >
      <h2 className="text-sm font-semibold">
        {t('Уведомления в Telegram и на почту')}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(
          'В приложении уведомления приходят всегда. Почта — запасной канал: письмо уходит, если сообщение не отправлено в Telegram.',
        )}
      </p>

      {!settings ? (
        <Skeleton className="mt-4 h-40" />
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-normal">{t('События')}</th>
                  <th className="w-24 pb-2 text-center font-normal">
                    Telegram
                  </th>
                  <th className="w-24 pb-2 text-center font-normal">
                    {t('Почта')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => (
                  <tr key={g.key} className="border-t border-border">
                    <td className="py-2.5 pr-3">
                      <span className="block">{g.label()}</span>
                      <span className="block text-xs text-muted-foreground">
                        {g.hint()}
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      <Switch
                        aria-label={t('{{event}} — Telegram', {
                          event: g.label(),
                        })}
                        checked={
                          settings.channels.telegram && settings.telegram[g.key]
                        }
                        disabled={!settings.channels.telegram}
                        onCheckedChange={(v) => toggle('telegram', g.key, v)}
                      />
                    </td>
                    <td className="py-2.5 text-center">
                      <Switch
                        aria-label={t('{{event}} — почта', {
                          event: g.label(),
                        })}
                        checked={
                          settings.channels.email && settings.email[g.key]
                        }
                        disabled={!settings.channels.email}
                        onCheckedChange={(v) => toggle('email', g.key, v)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!settings.channels.telegram || !settings.channels.email) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {!settings.channels.telegram
                ? t(
                    'Telegram не подключён — подключите его в блоке «Telegram» ниже.',
                  )
                : t('В аккаунте нет почты — письма не отправляются.')}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <label
              htmlFor="quiet-on"
              className="flex items-center gap-3 text-sm"
            >
              <Switch
                id="quiet-on"
                checked={settings.quiet_hours.enabled}
                onCheckedChange={(v) => setQuiet({ enabled: v })}
              />
              {t('Тихие часы')}
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('с')}</span>
              <HourSelect
                value={settings.quiet_hours.from}
                disabled={!settings.quiet_hours.enabled}
                label={t('Начало тихих часов')}
                onChange={(from) => setQuiet({ from })}
              />
              <span className="text-muted-foreground">{t('до')}</span>
              <HourSelect
                value={settings.quiet_hours.to}
                disabled={!settings.quiet_hours.enabled}
                label={t('Конец тихих часов')}
                onChange={(to) => setQuiet({ to })}
              />
            </div>
            <p className="w-full text-xs text-muted-foreground">
              {t(
                'В это время сообщения в Telegram и письма не отправляются — они придут, когда тихие часы закончатся. В приложении уведомления появляются сразу. Время — по часовому поясу профиля.',
              )}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarClock size={15} className="text-muted-foreground" />
              {t('Сводки')}
            </div>
            <label
              htmlFor="digest-daily"
              className="flex items-start justify-between gap-4 text-sm"
            >
              <span>
                <span className="block">
                  {t('Каждый день — о вашей работе')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    'сроки на сегодня, просроченное, поручения без отметки «Ознакомлен», что ждёт вашего решения. Пустая сводка не приходит.',
                  )}
                </span>
              </span>
              <Switch
                id="digest-daily"
                checked={settings.digest.daily}
                onCheckedChange={(v) => setDigest({ daily: v })}
              />
            </label>
            <label
              htmlFor="digest-weekly"
              className="flex items-start justify-between gap-4 text-sm"
            >
              <span>
                <span className="block">
                  {t('По понедельникам — по вашему подразделению')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {settings.is_department_head
                    ? t(
                        'за прошлую неделю: поступило, исполнено в срок и с опозданием, что просрочено сейчас.',
                      )
                    : t('Приходит руководителям подразделений.')}
                </span>
              </span>
              <Switch
                id="digest-weekly"
                checked={settings.is_department_head && settings.digest.weekly}
                disabled={!settings.is_department_head}
                onCheckedChange={(v) => setDigest({ weekly: v })}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('Присылать в')}</span>
              <HourSelect
                value={settings.digest.hour}
                disabled={false}
                label={t('Время отправки сводок')}
                onChange={(hour) => setDigest({ hour })}
              />
              <span className="text-xs text-muted-foreground">
                {t('по часовому поясу профиля')}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void digestNow('daily')}
                disabled={digesting !== null}
              >
                {digesting === 'daily'
                  ? t('Отправляем…')
                  : t('Прислать сводку сейчас')}
              </Button>
              {settings.is_department_head && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void digestNow('weekly')}
                  disabled={digesting !== null}
                >
                  {digesting === 'weekly'
                    ? t('Отправляем…')
                    : t('Прислать недельную сводку')}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={test}
              disabled={testing}
            >
              <Send size={14} />
              {testing ? t('Отправляем…') : t('Отправить тестовое уведомление')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function HourSelect({
  value,
  disabled,
  label,
  onChange,
}: {
  value: number
  disabled: boolean
  label: string
  onChange: (h: number) => void
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 w-[88px]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {HOURS.map((h) => (
          <SelectItem key={h} value={String(h)}>
            {hh(h)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
