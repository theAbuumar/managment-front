import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  getAuthProviders,
  linkTelegram,
  listIdentities,
  telegramInit,
  unlinkIdentity,
  type Identity,
} from '@/api/auth'
import { ApiError } from '@/api/client'
import { errorText } from '@/lib/errorMessages'
import { TelegramIcon } from '@/features/auth/ProviderIcons'

// Telegram in the profile (4.F9, Telegram part — 13.P5): an existing account
// connects the bot, so assignments, reminders and the action buttons («Ознакомлен»,
// «Сдать на проверку», «Принять») arrive there. Hidden when the server has no bot.
export function TelegramSection() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [identities, setIdentities] = useState<Identity[]>([])
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    Promise.all([getAuthProviders(), listIdentities()])
      .then(([providers, list]) => {
        if (!alive.current) return
        setEnabled(providers.telegram)
        setIdentities(list)
      })
      .catch(() => setEnabled(false))
    return () => {
      alive.current = false
    }
  }, [])

  if (!enabled) return null
  const linked = identities.find((i) => i.provider === 'telegram')
  // The server refuses to remove the last sign-in method; say so up front.
  const onlyMethod = identities.length <= 1

  async function connect() {
    setWaiting(true)
    try {
      const { deep_link, token } = await telegramInit()
      window.open(deep_link, '_blank')
      // Poll for up to ~3 min; a pending token is not consumed by the check.
      for (let i = 0; i < 90 && alive.current; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        try {
          const identity = await linkTelegram(token)
          if (!alive.current) return
          setIdentities((prev) => [
            ...prev.filter((x) => x.provider !== 'telegram'),
            identity,
          ])
          toast.success(t('Telegram подключён'))
          return
        } catch (err) {
          const pending =
            err instanceof ApiError &&
            err.code === 'TELEGRAM_NOT_CONFIRMED' &&
            (err.details as { status?: string } | undefined)?.status ===
              'pending'
          if (pending) continue
          if (err instanceof ApiError && err.code === 'CONFLICT') {
            toast.error(t('Этот Telegram уже подключён к другому аккаунту.'))
          } else {
            toast.error(errorText(err, t('Не удалось подключить Telegram')))
          }
          return
        }
      }
      if (alive.current)
        toast.error(t('Время ожидания Telegram истекло — попробуйте ещё раз'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось подключить Telegram')))
    } finally {
      if (alive.current) setWaiting(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await unlinkIdentity('telegram')
      setIdentities((prev) => prev.filter((x) => x.provider !== 'telegram'))
      toast.success(t('Telegram отключён'))
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-border p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <TelegramIcon />
        {t('Telegram')}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(
          'Поручения, напоминания о сроках и кнопки «Ознакомлен», «Сдать на проверку», «Принять» приходят в Telegram.',
        )}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {linked ? (
          <>
            <p className="text-sm">
              {t('Подключён {{date}}', {
                date: new Date(linked.created_at).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              })}
            </p>
            {onlyMethod ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  'Это единственный способ входа в аккаунт — отключить его нельзя.',
                )}
              </p>
            ) : (
              <Button variant="outline" onClick={disconnect} disabled={busy}>
                {t('Отключить')}
              </Button>
            )}
          </>
        ) : waiting ? (
          <p className="text-sm text-muted-foreground">
            {t('Откройте бота и нажмите «Подтвердить» — мы ждём ответа…')}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t('Telegram не подключён.')}
            </p>
            <Button onClick={connect}>{t('Подключить Telegram')}</Button>
          </>
        )}
      </div>
    </section>
  )
}
