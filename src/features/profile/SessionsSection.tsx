import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  type AuthSession,
} from '@/api/auth'
import { errorText } from '@/lib/errorMessages'
import { dateTime, timeAgo } from '@/lib/dates'
import { pluralize } from '@/lib/plural'
import { t as translate } from '@/i18n'

// Profile → «Мои сессии» (Ф12 12.F1, 12.B2): every device the account is signed in
// on — browser, system, IP, how and when it signed in, last activity. A session can
// be ended on its own or all the others at once; the device is cut off at its next
// request, not when its token runs out.

const METHODS: Record<string, () => string> = {
  password: () => translate('по паролю'),
  email_code: () => translate('по коду на почту'),
  google: () => translate('через Google'),
  github: () => translate('через GitHub'),
  telegram: () => translate('через Telegram'),
  demo: () => translate('демо-вход'),
}

function deviceName(s: AuthSession): string {
  const parts = [s.browser, s.os].filter(Boolean)
  return parts.length > 0
    ? parts.join(' · ')
    : translate('Неизвестное устройство')
}

function signedIn(s: AuthSession): string {
  const method = s.method ? METHODS[s.method]?.() : null
  return method
    ? translate('Вход {{date}}, {{method}}', {
        date: dateTime(s.created_at),
        method,
      })
    : translate('Вход {{date}}', { date: dateTime(s.created_at) })
}

export function SessionsSection() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<AuthSession[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    listSessions()
      .then((list) => alive.current && setSessions(list))
      .catch(() => alive.current && setFailed(true))
    return () => {
      alive.current = false
    }
  }, [])

  async function end(s: AuthSession) {
    setBusy(s.id)
    try {
      await revokeSession(s.id)
      setSessions((prev) => (prev ?? []).filter((x) => x.id !== s.id))
      toast.success(
        t('Сеанс на устройстве «{{name}}» завершён', { name: deviceName(s) }),
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось завершить сеанс')))
    } finally {
      setBusy(null)
    }
  }

  async function endOthers() {
    setBusy('all')
    try {
      const { revoked } = await revokeOtherSessions()
      setSessions((prev) => (prev ?? []).filter((x) => x.current))
      toast.success(
        revoked > 0
          ? t('Завершено: {{n}}', {
              n: pluralize(revoked, [t('сеанс'), t('сеанса'), t('сеансов')]),
            })
          : t('Других сеансов нет'),
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось завершить сеансы')))
    } finally {
      setBusy(null)
    }
  }

  if (failed) return null
  const others = sessions?.filter((s) => !s.current).length ?? 0

  return (
    <section className="rounded-lg border border-border p-4 md:p-5">
      <h2 className="text-sm font-semibold">{t('Мои сессии')}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(
          'Устройства, на которых выполнен вход в аккаунт. Если устройство вам незнакомо, завершите его сеанс — оно потеряет доступ сразу.',
        )}
      </p>

      {sessions === null ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {sessions.map((s) => {
            const Icon = s.mobile ? Smartphone : Monitor
            return (
              <li
                key={s.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                      <span
                        className="truncate"
                        title={s.user_agent ?? undefined}
                      >
                        {deviceName(s)}
                      </span>
                      {s.current && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                          {t('Это устройство')}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        signedIn(s),
                        s.ip && t('IP {{ip}}', { ip: s.ip }),
                        s.current
                          ? t('активен сейчас')
                          : t('активность {{ago}}', {
                              ago: timeAgo(s.last_used_at),
                            }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                {!s.current && (
                  <div className="shrink-0 sm:pl-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => end(s)}
                      disabled={busy !== null}
                    >
                      {busy === s.id ? t('Завершаем…') : t('Завершить')}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {others > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            className="border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmAll(true)}
            disabled={busy !== null}
          >
            {busy === 'all'
              ? t('Завершаем…')
              : t('Выйти на всех других устройствах')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('Выйти на всех других устройствах?')}
        description={t(
          'Будет завершено: {{n}}. На этом устройстве вход сохранится.',
          { n: pluralize(others, [t('сеанс'), t('сеанса'), t('сеансов')]) },
        )}
        confirmLabel={t('Выйти')}
        onConfirm={endOthers}
      />
    </section>
  )
}
