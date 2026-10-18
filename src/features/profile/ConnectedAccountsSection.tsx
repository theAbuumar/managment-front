import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  getAuthProviders,
  linkTelegram,
  listIdentities,
  startOAuthLink,
  telegramInit,
  unlinkIdentity,
  type AuthProviders,
  type Identity,
} from '@/api/auth'
import { ApiError } from '@/api/client'
import { errorText } from '@/lib/errorMessages'
import {
  GithubIcon,
  GoogleIcon,
  TelegramIcon,
} from '@/features/auth/ProviderIcons'
import { t as translate } from '@/i18n'

type Provider = Identity['provider']

const ORDER: Provider[] = ['email', 'google', 'github', 'telegram']

const NAMES: Record<Provider, () => string> = {
  email: () => translate('Почта'),
  google: () => 'Google',
  github: () => 'GitHub',
  telegram: () => 'Telegram',
}

const ICONS: Record<Provider, React.ReactNode> = {
  email: <Mail size={16} className="text-muted-foreground" />,
  google: <GoogleIcon />,
  github: <GithubIcon />,
  telegram: <TelegramIcon />,
}

/** Text for the `#link_error=<code>` the provider callback returns with (ADR-025). */
function linkErrorText(code: string): string {
  if (code === 'linked_to_other_account')
    return translate('Этот аккаунт уже привязан к другому пользователю.')
  if (code === 'access_denied') return translate('Привязка отменена.')
  if (code === 'invalid_state')
    return translate(
      'Ссылка привязки устарела или открыта в другом браузере — начните заново.',
    )
  return translate('Не удалось привязать аккаунт — попробуйте ещё раз.')
}

// Profile → «Привязанные аккаунты» (4.F9): every way into the account — email code,
// Google, GitHub, Telegram. Google and GitHub link through the provider's consent page
// (ADR-025) and come back here; Telegram links through the bot (13.P5). A method the
// server doesn't offer is shown only if it is already linked, and the last remaining
// one can't be removed.
export function ConnectedAccountsSection() {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<AuthProviders | null>(null)
  const [identities, setIdentities] = useState<Identity[] | null>(null)
  const [waitingTelegram, setWaitingTelegram] = useState(false)
  const [busy, setBusy] = useState<Provider | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    Promise.all([getAuthProviders(), listIdentities()])
      .then(([available, list]) => {
        if (!alive.current) return
        setProviders(available)
        setIdentities(list)
      })
      .catch(() => setIdentities(null))
    return () => {
      alive.current = false
    }
  }, [])

  // Back from Google/GitHub: /profile#linked=google or #link_error=<code>.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const linked = hash.get('linked')
    const error = hash.get('link_error')
    if (!linked && !error) return
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    )
    if (linked) {
      const name = NAMES[linked as Provider]?.() ?? linked
      toast.success(
        t('{{name}} привязан — теперь через него можно входить', { name }),
      )
    } else {
      toast.error(linkErrorText(error!))
    }
  }, [t])

  if (!providers || !identities) return null

  const linkedOf = (p: Provider) => identities.find((i) => i.provider === p)
  const offered = (p: Provider) => p !== 'email' && providers[p]
  const rows = ORDER.filter((p) => linkedOf(p) || offered(p))
  if (rows.length === 0) return null
  // The server refuses to remove the last sign-in method; say so up front.
  const onlyMethod = identities.length <= 1

  async function link(p: 'google' | 'github') {
    setBusy(p)
    try {
      const { url } = await startOAuthLink(p)
      window.location.assign(url)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось начать привязку')))
      setBusy(null)
    }
  }

  async function connectTelegram() {
    setWaitingTelegram(true)
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
            ...(prev ?? []).filter((x) => x.provider !== 'telegram'),
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
      if (alive.current) setWaitingTelegram(false)
    }
  }

  async function unlink(p: Provider) {
    setBusy(p)
    try {
      await unlinkIdentity(p)
      setIdentities((prev) => (prev ?? []).filter((x) => x.provider !== p))
      toast.success(t('{{name}} отвязан', { name: NAMES[p]() }))
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  function action(p: Provider, linked: Identity | undefined) {
    if (linked) {
      // The email address is the account's own: it is changed, not unlinked.
      if (p === 'email') return null
      if (onlyMethod)
        return (
          <p className="text-xs text-muted-foreground sm:max-w-56 sm:text-right">
            {t('Единственный способ входа — отвязать нельзя')}
          </p>
        )
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => unlink(p)}
          disabled={busy !== null}
        >
          {t('Отвязать')}
        </Button>
      )
    }
    if (p === 'telegram') {
      return waitingTelegram ? (
        <p className="text-xs text-muted-foreground sm:max-w-56 sm:text-right">
          {t('Откройте бота и нажмите «Подтвердить» — мы ждём ответа…')}
        </p>
      ) : (
        <Button size="sm" onClick={connectTelegram}>
          {t('Подключить')}
        </Button>
      )
    }
    if (p === 'google' || p === 'github') {
      return (
        <Button size="sm" onClick={() => link(p)} disabled={busy !== null}>
          {busy === p ? t('Переходим…') : t('Привязать')}
        </Button>
      )
    }
    return null
  }

  return (
    <section className="rounded-lg border border-border p-4 md:p-5">
      <h2 className="text-sm font-semibold">{t('Привязанные аккаунты')}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {rows.includes('telegram')
          ? t(
              'Способы входа в аккаунт. Через Telegram также приходят поручения, напоминания о сроках и кнопки «Ознакомлен», «Сдать на проверку», «Принять».',
            )
          : t('Способы входа в аккаунт.')}
      </p>
      <ul className="mt-4 divide-y divide-border">
        {rows.map((p) => {
          const linked = linkedOf(p)
          return (
            <li
              key={p}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border">
                  {ICONS[p]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{NAMES[p]()}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {linked
                      ? [
                          linked.provider_email,
                          t('привязан {{date}}', {
                            date: new Date(
                              linked.created_at,
                            ).toLocaleDateString('ru-RU', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            }),
                          }),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : t('Не привязан')}
                  </p>
                </div>
              </div>
              <div className="shrink-0 sm:pl-4">{action(p, linked)}</div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
