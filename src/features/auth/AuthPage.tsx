import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ClipboardCheck, Sparkles } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { PasswordInput } from '@/components/ui/password-input'
import { ApiError } from '@/api/client'
import {
  requestEmailCode,
  verifyEmailCode,
  passwordLogin,
  ldapLogin,
  telegramInit,
  telegramStatus,
  OAUTH_URLS,
  getDemoAccounts,
  demoLogin,
  getAuthProviders,
  type AuthProviders,
  type AuthResponse,
  type DemoAccount,
} from '@/api/auth'
import { getWorkspaces } from '@/api/workspace'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { rememberNextPath } from '@/lib/session'
import { errorText } from '@/lib/errorMessages'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { GithubIcon, GoogleIcon, TelegramIcon } from './ProviderIcons'

const loginSchema = z.object({
  email: z.string().email(t('Введите корректный email')),
})
const registerSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(3, t('Укажите фамилию и имя'))
    .max(100, t('Слишком длинное имя')),
  email: z.string().email(t('Введите корректный email')),
})
const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, t('Введите 6-значный код')),
})
const passwordSchema = z.object({
  email: z.string().email(t('Введите корректный email')),
  password: z.string().min(1, t('Введите пароль')),
})
const ldapSchema = z.object({
  login: z.string().trim().min(1, t('Введите логин')),
  password: z.string().min(1, t('Введите пароль')),
})

/** How to sign in on the «Вход» tab: a code by email, a password (12.F6) or LDAP (12.B10). */
type LoginMethod = 'code' | 'password' | 'ldap'

function ProviderButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2.5 rounded-md border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      {icon}
      {label}
    </button>
  )
}

// An older API without /auth/providers: show every method, as before.
const ALL_PROVIDERS: AuthProviders = {
  email: true,
  google: true,
  github: true,
  telegram: true,
  demo: false,
}

/** Sign-in methods configured on this deployment; null while loading. */
function useAuthProviders(): AuthProviders | null {
  const [providers, setProviders] = useState<AuthProviders | null>(null)
  useEffect(() => {
    getAuthProviders()
      .then(setProviders)
      .catch(() => setProviders(ALL_PROVIDERS))
  }, [])
  return providers
}

/** Only same-app paths are honoured as a post-login destination. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

function AuthForm({
  mode,
  available,
}: {
  mode: 'login' | 'register'
  available: AuthProviders
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const setAuth = useAuthStore((s) => s.setAuth)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)

  const [sentTo, setSentTo] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | undefined>()
  // A password is set in the profile after a code sign-in, so it needs email codes;
  // the university account needs only the directory.
  const methods: LoginMethod[] = [
    ...(available.email ? (['code', 'password'] as const) : []),
    ...(available.ldap ? (['ldap'] as const) : []),
  ]
  const [method, setMethod] = useState<LoginMethod>(methods[0] ?? 'code')

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: params.get('email') ?? '' },
  })
  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { display_name: '', email: params.get('email') ?? '' },
  })
  const codeForm = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  })
  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: params.get('email') ?? '', password: '' },
  })
  const ldapForm = useForm<z.infer<typeof ldapSchema>>({
    resolver: zodResolver(ldapSchema),
    defaultValues: { login: '', password: '' },
  })

  // Shared post-login: store session, load workspaces, route.
  async function finishAuth(user: AuthResponse['user'], token: string) {
    setAuth(user, token)
    const workspaces = await getWorkspaces().catch(() => [])
    setWorkspaces(workspaces)
    if (workspaces.length > 0) setWorkspace(workspaces[0])
    if (next) navigate(next, { replace: true })
    else navigate(workspaces.length > 0 ? '/' : '/onboarding/workspace')
  }

  function startOAuth(url: string) {
    // The provider round-trip lands on the home page; come back here afterwards.
    if (next) rememberNextPath(next)
    window.location.assign(url)
  }

  async function telegram() {
    try {
      const { deep_link, token } = await telegramInit()
      window.open(deep_link, '_blank')
      toast.info(t('Подтвердите вход в Telegram — мы ждём ответа бота'))
      // Poll every 2 s for up to ~3 min. The backend also expires the token
      // server-side (returns 'expired'), which ends the loop early.
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const res = await telegramStatus(token)
        if (res.status === 'authenticated' && res.access_token && res.user) {
          await finishAuth(res.user, res.access_token)
          return
        }
        if (res.status === 'expired' || res.status === 'used') break
      }
      toast.error(t('Время ожидания Telegram истекло — попробуйте ещё раз'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось войти через Telegram')))
    }
  }

  async function sendCode(email: string, displayName?: string) {
    try {
      await requestEmailCode(email, displayName)
      toast.success(t('Код отправлен на {{email}}', { email }))
      setPendingName(displayName)
      setSentTo(email)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отправить код')))
    }
  }

  async function signInWithPassword({
    email,
    password,
  }: z.infer<typeof passwordSchema>) {
    try {
      const result = await passwordLogin(email, password)
      await finishAuth(result.user, result.access_token)
    } catch (err) {
      passwordForm.setValue('password', '')
      toast.error(errorText(err, t('Не удалось войти')))
    }
  }

  async function signInWithDirectory({
    login,
    password,
  }: z.infer<typeof ldapSchema>) {
    try {
      const result = await ldapLogin(login, password)
      await finishAuth(result.user, result.access_token)
    } catch (err) {
      ldapForm.setValue('password', '')
      toast.error(
        err instanceof ApiError && err.code === 'INVALID_CREDENTIALS'
          ? t('Неверный логин или пароль.')
          : errorText(err, t('Не удалось войти')),
      )
    }
  }

  /** Another way to sign in keeps the email already typed. */
  function switchMethod(next: LoginMethod) {
    const email =
      method === 'password'
        ? passwordForm.getValues('email')
        : loginForm.getValues('email')
    if (email) {
      loginForm.setValue('email', email)
      passwordForm.setValue('email', email)
    }
    setMethod(next)
  }

  /** «Забыли пароль?» — sign in by a code; a new password is set in the profile. */
  function forgotPassword() {
    switchMethod('code')
    toast.info(t('Войдите по коду на почту и задайте новый пароль в профиле'))
  }

  async function verifyCode({ code }: z.infer<typeof codeSchema>) {
    if (!sentTo) return
    try {
      const result = await verifyEmailCode(sentTo, code)
      await finishAuth(result.user, result.access_token)
    } catch (err) {
      toast.error(errorText(err, t('Неверный или просроченный код')))
    }
  }

  if (sentTo) {
    return (
      <Form {...codeForm}>
        <form
          onSubmit={codeForm.handleSubmit(verifyCode)}
          className="flex flex-col gap-4"
        >
          <button
            type="button"
            onClick={() => {
              setSentTo(null)
              codeForm.reset()
            }}
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            {t('Назад')}
          </button>

          <div>
            <p className="text-sm text-foreground">
              {t('Введите 6-значный код, отправленный на')}
            </p>
            <p className="text-sm font-medium text-foreground">{sentTo}</p>
          </div>

          <FormField
            control={codeForm.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.5em]"
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value.replace(/\D/g, '').slice(0, 6),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={codeForm.formState.isSubmitting}
          >
            {codeForm.formState.isSubmitting
              ? t('Проверяем…')
              : t('Подтвердить и войти')}
          </Button>

          <button
            type="button"
            onClick={() => sendCode(sentTo, pendingName)}
            className="text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {t('Отправить код ещё раз')}
          </button>
        </form>
      </Form>
    )
  }

  // Only the methods configured on this deployment (no buttons that end in an error).
  const hasProviders =
    available.google || available.github || available.telegram
  const providers = hasProviders && (
    <div className="flex flex-col gap-2.5">
      {available.google && (
        <ProviderButton
          icon={<GoogleIcon />}
          label={t('Продолжить с Google')}
          onClick={() => startOAuth(OAUTH_URLS.google)}
        />
      )}
      {available.github && (
        <ProviderButton
          icon={<GithubIcon />}
          label={t('Продолжить с GitHub')}
          onClick={() => startOAuth(OAUTH_URLS.github)}
        />
      )}
      {available.telegram && (
        <ProviderButton
          icon={<TelegramIcon />}
          label={t('Продолжить с Telegram')}
          onClick={telegram}
        />
      )}
    </div>
  )

  const divider = (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">
        {available.email ? t('или по email') : t('или')}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )

  if (!available.email && !available.ldap) {
    return <div className="flex flex-col gap-4">{providers}</div>
  }

  const methodNames: Record<LoginMethod, string> = {
    code: t('Код на почту'),
    password: t('Пароль'),
    ldap: available.ldap_label || t('Учётная запись университета'),
  }
  const switcher = mode === 'login' && methods.length > 1 && (
    <div
      role="radiogroup"
      aria-label={t('Способ входа')}
      className="grid gap-1 rounded-lg bg-muted p-1"
      style={{
        gridTemplateColumns: `repeat(${methods.length}, minmax(0, 1fr))`,
      }}
    >
      {methods.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={method === m}
          onClick={() => switchMethod(m)}
          className={
            'rounded-md px-2 py-1.5 text-xs leading-tight font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
            (method === m
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          {methodNames[m]}
        </button>
      ))}
    </div>
  )

  // Each method's form has its own key: the email fields of two forms sit in the
  // same place, and a reused field would stay bound to the other form.
  const passwordLoginForm = (
    <Form key="password" {...passwordForm}>
      <form
        onSubmit={passwordForm.handleSubmit(signInWithPassword)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={passwordForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Email')}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="username"
                  placeholder="ivanov@university.edu"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={passwordForm.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-baseline justify-between">
                <FormLabel>{t('Пароль')}</FormLabel>
                <button
                  type="button"
                  onClick={forgotPassword}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t('Забыли пароль?')}
                </button>
              </div>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={passwordForm.formState.isSubmitting}
        >
          {passwordForm.formState.isSubmitting ? t('Входим…') : t('Войти')}
        </Button>
      </form>
    </Form>
  )

  const ldapLoginForm = (
    <Form key="ldap" {...ldapForm}>
      <form
        onSubmit={ldapForm.handleSubmit(signInWithDirectory)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={ldapForm.control}
          name="login"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Логин')}</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="ivanov"
                  {...field}
                />
              </FormControl>
              {available.ldap_hint && (
                <p className="text-xs text-muted-foreground">
                  {available.ldap_hint}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={ldapForm.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Пароль')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={ldapForm.formState.isSubmitting}
        >
          {ldapForm.formState.isSubmitting ? t('Входим…') : t('Войти')}
        </Button>
      </form>
    </Form>
  )

  const notes: Record<LoginMethod, string> = {
    code: t(
      'Вход без пароля: мы отправим одноразовый код на почту. Ваши данные используются только для работы системы.',
    ),
    password: t(
      'Пароль задаётся в профиле после входа по коду. Основной вход — по коду на почту.',
    ),
    ldap: t(
      'Логин и пароль проверяет каталог университета — система пароль не хранит.',
    ),
  }
  const shown: LoginMethod = mode === 'login' ? method : 'code'

  return (
    <div className="flex flex-col gap-4">
      {providers}
      {hasProviders && divider}
      {switcher}

      {mode === 'login' && method === 'password' ? (
        passwordLoginForm
      ) : mode === 'login' && method === 'ldap' ? (
        ldapLoginForm
      ) : mode === 'login' ? (
        <Form key="code" {...loginForm}>
          <form
            onSubmit={loginForm.handleSubmit(({ email }) => sendCode(email))}
            className="flex flex-col gap-4"
          >
            <FormField
              control={loginForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="ivanov@university.edu"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={loginForm.formState.isSubmitting}
            >
              {loginForm.formState.isSubmitting
                ? t('Отправляем код…')
                : t('Получить код для входа')}
            </Button>
          </form>
        </Form>
      ) : (
        <Form {...registerForm}>
          <form
            onSubmit={registerForm.handleSubmit(({ email, display_name }) =>
              sendCode(email, display_name),
            )}
            className="flex flex-col gap-4"
          >
            <FormField
              control={registerForm.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Фамилия и имя')}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="name"
                      placeholder={t('Иванов Иван Иванович')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={registerForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="ivanov@university.edu"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={registerForm.formState.isSubmitting}
            >
              {registerForm.formState.isSubmitting
                ? t('Отправляем код…')
                : t('Зарегистрироваться')}
            </Button>
          </form>
        </Form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {notes[shown]}
      </p>
    </div>
  )
}

// Demo stand (backend DEMO_MODE): one-click sign-in as the seeded roles so the
// jury can switch between Ректор / Проректор / Декан / Сотрудник. Hidden otherwise.
function DemoLogin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // A deep link opened before signing in (email, Telegram) comes back here too.
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const setAuth = useAuthStore((s) => s.setAuth)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const [accounts, setAccounts] = useState<DemoAccount[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    getDemoAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, [])

  // One account per demo role, in the order the story is told. The API tags
  // them (demo_role); the position patterns are a fallback for an older API.
  const tagged = accounts.filter((a) => a.demo_role)
  const ROLES = [
    /^Ректор$/i,
    /^Проректор по учебной/i,
    /^Декан/i,
    /^Методист|Сотрудник/i,
  ]
  const featured =
    tagged.length > 0
      ? tagged
      : ROLES.map((re) =>
          accounts.find((a) => re.test(a.position ?? '')),
        ).filter((a): a is DemoAccount => Boolean(a))
  if (featured.length === 0) return null

  async function enter(account: DemoAccount) {
    setBusy(account.email)
    try {
      const res = await demoLogin(account.email)
      setAuth(res.user, res.access_token)
      const list = await getWorkspaces()
      setWorkspaces(list)
      if (list[0]) setWorkspace(list[0])
      navigate(next ?? '/', { replace: Boolean(next) })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Sparkles size={15} />
        {t('Демо-стенд: быстрый вход')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {featured.slice(0, 4).map((a) => (
          <button
            key={a.email}
            onClick={() => enter(a)}
            disabled={busy !== null}
            className="rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
          >
            <span className="block truncate text-sm font-medium">
              {a.position}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {a.display_name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function AuthPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const initialTab = params.get('tab') === 'register' ? 'register' : 'login'
  const available = useAuthProviders()

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardCheck size={22} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{APP_NAME}</h1>
          <p className="mt-1 text-base text-muted-foreground">
            {t(APP_TAGLINE)}
          </p>
        </div>

        {available?.demo && <DemoLogin />}

        {available &&
          (available.email ? (
            <Tabs defaultValue={initialTab}>
              <TabsList className="mb-6 w-full">
                <TabsTrigger value="login" className="flex-1">
                  {t('Вход')}
                </TabsTrigger>
                <TabsTrigger value="register" className="flex-1">
                  {t('Регистрация')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <AuthForm mode="login" available={available} />
              </TabsContent>
              <TabsContent value="register">
                <AuthForm mode="register" available={available} />
              </TabsContent>
            </Tabs>
          ) : available.google ||
            available.github ||
            available.telegram ||
            available.ldap ? (
            // Without email codes the providers both sign in and sign up.
            <AuthForm mode="login" available={available} />
          ) : (
            !available.demo && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'Вход пока не настроен. Обратитесь к администратору системы.',
                )}
              </p>
            )
          ))}
      </div>
    </div>
  )
}
