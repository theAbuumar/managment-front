import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Circle, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import {
  changePassword,
  getAuthProviders,
  getMe,
  requestPasswordCode,
  setPassword,
  type PasswordResult,
} from '@/api/auth'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { errorText } from '@/lib/errorMessages'
import { t as translate } from '@/i18n'

// Profile → «Пароль» (12.F6, ADR-034): a password as an additional way to sign in
// with the email. The first one (or a new one instead of a forgotten one) is set by a
// code sent to the email; a known one is changed with it. Either way the other
// sessions end and a letter «Пароль изменён» comes. Letters link here (#password).

const REASONS: Record<string, () => string> = {
  too_short: () => translate('Не короче 8 символов'),
  too_long: () => translate('Не длиннее 128 символов'),
  needs_letter: () => translate('Нужна хотя бы одна буква'),
  needs_digit: () => translate('Нужна хотя бы одна цифра'),
  common: () => translate('Слишком простой пароль — его легко подобрать'),
  personal: () => translate('Не используйте в пароле почту или имя'),
  same_as_current: () => translate('Новый пароль совпадает с текущим'),
}

/** The reasons of a WEAK_PASSWORD answer as text, or null for any other error. */
function weakReasons(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== 'WEAK_PASSWORD') return null
  const reasons = (err.details as { reasons?: string[] } | undefined)?.reasons
  const texts = (reasons ?? []).map((r) => REASONS[r]?.()).filter(Boolean)
  return texts.length ? texts.join('. ') + '.' : null
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

type Step = 'idle' | 'change' | 'set' | 'code'

export function PasswordSection({
  onOthersSignedOut,
}: {
  /** Other sessions ended — «Мои сессии» reloads. */
  onOthersSignedOut?: () => void
}) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [step, setStep] = useState<Step>('idle')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Setting a password takes a code from a letter: without mail on the server only
  // a known password can be changed (no buttons that end in an error).
  const [mailOn, setMailOn] = useState<boolean | null>(null)
  const section = useRef<HTMLElement>(null)

  // The stored user may be older than this section: ask the server once.
  useEffect(() => {
    getMe()
      .then((me) => {
        const now = useAuthStore.getState().user
        if (now) setUser({ ...now, ...me })
      })
      .catch(() => undefined)
  }, [setUser])

  useEffect(() => {
    getAuthProviders()
      .then((p) => setMailOn(p.email))
      .catch(() => setMailOn(true))
  }, [])

  // From the letter «Пароль изменён»: /profile#password.
  useEffect(() => {
    if (window.location.hash === '#password') {
      section.current?.scrollIntoView({ block: 'start' })
    }
  }, [])

  if (!user) return null
  const hasPassword = Boolean(user.has_password)
  const lengthOk = next.length >= 8 && next.length <= 128
  const mixOk = /\p{L}/u.test(next) && /\p{Nd}/u.test(next)
  const repeatOk = next.length > 0 && next === repeat

  function reset(to: Step = 'idle') {
    setStep(to)
    setCurrent('')
    setNext('')
    setRepeat('')
    setCode('')
    setProblem(null)
  }

  function done(result: PasswordResult, message: string) {
    if (user)
      setUser({
        ...user,
        has_password: true,
        password_changed_at: result.password_changed_at,
      })
    const ended = result.signed_out_sessions
    toast.success(
      ended > 0
        ? t('{{message}} Завершено других сеансов: {{n}}.', {
            message,
            n: ended,
          })
        : message,
    )
    if (ended > 0) onOthersSignedOut?.()
    reset()
  }

  function fail(err: unknown, fallback: string) {
    const weak = weakReasons(err)
    if (weak) setProblem(weak)
    else toast.error(errorText(err, fallback))
  }

  async function submitChange(e: React.FormEvent) {
    e.preventDefault()
    if (!lengthOk || !mixOk || !repeatOk || !current) return
    setBusy(true)
    setProblem(null)
    try {
      done(await changePassword(current, next), t('Пароль изменён.'))
    } catch (err) {
      setCurrent('')
      fail(err, t('Не удалось сменить пароль'))
    } finally {
      setBusy(false)
    }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    if (!lengthOk || !mixOk || !repeatOk) return
    setBusy(true)
    setProblem(null)
    try {
      const sent = await requestPasswordCode(next)
      toast.success(t('Код отправлен на {{email}}', { email: sent.email }))
      setStep('code')
    } catch (err) {
      fail(err, t('Не удалось отправить код'))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return
    setBusy(true)
    setProblem(null)
    try {
      done(
        await setPassword(code, next),
        hasPassword ? t('Новый пароль сохранён.') : t('Пароль задан'),
      )
    } catch (err) {
      setCode('')
      fail(err, t('Не удалось сохранить пароль'))
    } finally {
      setBusy(false)
    }
  }

  const hint = (ok: boolean, text: string) => (
    <li
      className={
        'flex items-center gap-1.5 ' +
        (ok
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground')
      }
    >
      {ok ? <Check size={13} aria-hidden /> : <Circle size={13} aria-hidden />}
      <span>
        {text}
        <span className="sr-only">
          {' — '}
          {ok ? t('выполнено') : t('не выполнено')}
        </span>
      </span>
    </li>
  )

  const newFields = (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-new" className="font-normal text-muted-foreground">
          {t('Новый пароль')}
        </Label>
        <PasswordInput
          id="pw-new"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby="pw-rules"
          aria-invalid={problem ? true : undefined}
        />
        <ul id="pw-rules" className="mt-1 grid gap-0.5 text-xs">
          {hint(lengthOk, t('8–128 символов'))}
          {hint(mixOk, t('Буквы и цифры'))}
          <li className="flex items-center gap-1.5 text-muted-foreground">
            <Circle size={13} aria-hidden />
            {t('Не простой пароль и без почты или имени')}
          </li>
        </ul>
      </div>
      <div className="grid gap-1.5">
        <Label
          htmlFor="pw-repeat"
          className="font-normal text-muted-foreground"
        >
          {t('Повторите пароль')}
        </Label>
        <PasswordInput
          id="pw-repeat"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          aria-invalid={repeat.length > 0 && !repeatOk ? true : undefined}
        />
        {repeat.length > 0 && !repeatOk && (
          <p className="text-xs text-destructive" role="alert">
            {t('Пароли не совпадают')}
          </p>
        )}
      </div>
      {problem && (
        <p className="text-sm text-destructive" role="alert">
          {problem}
        </p>
      )}
    </>
  )

  return (
    <section
      id="password"
      ref={section}
      aria-labelledby="password-title"
      className="scroll-mt-16 rounded-lg border border-border p-4 md:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id="password-title"
            className="flex items-center gap-1.5 text-sm font-semibold"
          >
            <KeyRound size={15} className="text-muted-foreground" aria-hidden />
            {t('Пароль')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              'Дополнительный способ входа: почта и пароль. Основной вход остаётся по коду на почту.',
            )}
          </p>
          <p className="mt-2 text-sm">
            {!user.email
              ? t(
                  'Пароль работает вместе с почтой, а у аккаунта её нет — войдите по почте, Google или учётной записи университета.',
                )
              : hasPassword
                ? user.password_changed_at
                  ? t('Пароль задан {{date}}', {
                      date: longDate(user.password_changed_at),
                    })
                  : t('Пароль задан')
                : t('Пароль не задан')}
          </p>
          {user.email && mailOn === false && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                'Задать пароль или заменить забытый можно, когда на сервере настроена почта: пароль подтверждается кодом из письма.',
              )}
            </p>
          )}
        </div>
        {user.email && step === 'idle' && mailOn !== null && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {hasPassword && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => reset('change')}
              >
                {t('Сменить пароль')}
              </Button>
            )}
            {hasPassword && mailOn && (
              <Button size="sm" variant="ghost" onClick={() => reset('set')}>
                {t('Не помню пароль')}
              </Button>
            )}
            {!hasPassword && mailOn && (
              <Button size="sm" onClick={() => reset('set')}>
                {t('Задать пароль')}
              </Button>
            )}
          </div>
        )}
      </div>

      {step === 'change' && (
        <form onSubmit={submitChange} className="mt-4 grid max-w-sm gap-3">
          <div className="grid gap-1.5">
            <Label
              htmlFor="pw-current"
              className="font-normal text-muted-foreground"
            >
              {t('Текущий пароль')}
            </Label>
            <PasswordInput
              id="pw-current"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          {newFields}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={busy || !current || !lengthOk || !mixOk || !repeatOk}
            >
              {busy ? t('Сохраняем…') : t('Сменить пароль')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => reset()}
            >
              {t('Отмена')}
            </Button>
          </div>
        </form>
      )}

      {step === 'set' && (
        <form onSubmit={sendCode} className="mt-4 grid max-w-sm gap-3">
          <p className="text-xs text-muted-foreground">
            {t(
              'Придумайте пароль — подтвердим его кодом, который придёт на {{email}}.',
              { email: user.email },
            )}
          </p>
          {newFields}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={busy || !lengthOk || !mixOk || !repeatOk}
            >
              {busy ? t('Отправляем код…') : t('Получить код')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => reset()}
            >
              {t('Отмена')}
            </Button>
          </div>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={submitCode} className="mt-4 grid max-w-sm gap-3">
          <div className="grid gap-1.5">
            <Label
              htmlFor="pw-code"
              className="font-normal text-muted-foreground"
            >
              {t('Код из письма на {{email}}', { email: user.email })}
            </Label>
            <Input
              id="pw-code"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center text-lg tracking-[0.5em]"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
            />
          </div>
          {problem && (
            <p className="text-sm text-destructive" role="alert">
              {problem}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={busy || code.length !== 6}
            >
              {busy ? t('Сохраняем…') : t('Сохранить пароль')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => sendCode()}
            >
              {t('Отправить код ещё раз')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => reset()}
            >
              {t('Отмена')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('После сохранения другие сеансы входа будут завершены.')}
          </p>
        </form>
      )}
      {step === 'change' && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('После смены другие сеансы входа будут завершены.')}
        </p>
      )}
    </section>
  )
}
