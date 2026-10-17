import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Building2, CalendarClock, Loader2, MailWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/api/client'
import {
  acceptInviteByToken,
  getInviteByToken,
  type TokenInvite,
} from '@/api/invites'
import { getWorkspaces } from '@/api/workspace'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { errorText } from '@/lib/errorMessages'
import { signOut } from '@/lib/session'
import { APP_NAME } from '@/lib/constants'
import { t as translate } from '@/i18n'

const ROLE_LABEL: Record<string, () => string> = {
  owner: () => translate('владелец'),
  admin: () => translate('администратор'),
  member: () => translate('участник'),
  guest: () => translate('гость'),
}

// Landing page for the link in an invitation email (/invites/:token). Works signed
// out: shows who invites you where, then sends you through sign-in (pre-filled with
// the invited address) and back here to accept.
export function InviteTokenPage() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const sessionToken = useAuthStore((s) => s.token)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)

  const [invite, setInvite] = useState<TokenInvite | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getInviteByToken(token)
      .then((inv) => !cancelled && setInvite(inv))
      .catch((err) => !cancelled && setLoadError(err as ApiError))
    return () => {
      cancelled = true
    }
  }, [token])

  const here = `/invites/${encodeURIComponent(token)}`
  const signedIn = !!sessionToken && !!user
  const emailMismatch =
    signedIn &&
    !!invite &&
    (user?.email ?? '').toLowerCase() !== invite.email.toLowerCase()

  async function accept() {
    if (!invite) return
    setBusy(true)
    try {
      await acceptInviteByToken(token)
      const list = await getWorkspaces()
      setWorkspaces(list)
      const joined = list.find((w) => w.id === invite.workspace_id)
      if (joined) setWorkspace(joined)
      toast.success(
        t('Вы присоединились к «{{name}}»', { name: invite.workspace.name }),
      )
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function switchAccount() {
    await signOut()
    if (invite) {
      navigate(
        `/login?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`,
      )
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          {APP_NAME}
        </p>

        {!invite && !loadError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            {t('Загружаем приглашение…')}
          </div>
        )}

        {loadError && (
          <div className="space-y-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <MailWarning size={18} />
            </div>
            <h1 className="text-lg font-semibold">
              {t('Приглашение недоступно')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {loadError.code === 'NOT_FOUND'
                ? t('Ссылка недействительна. Попросите администратора отправить приглашение ещё раз.')
                : loadError.message}
            </p>
            <Button asChild variant="outline">
              <Link to={signedIn ? '/' : '/login'}>
                {signedIn ? t('На главную') : t('Войти')}
              </Link>
            </Button>
          </div>
        )}

        {invite && (
          <div className="space-y-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Building2 size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold">
                {t('Приглашение в «{{name}}»', { name: invite.workspace.name })}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('{{who}} приглашает вас присоединиться с ролью «{{role}}».', {
                  who: invite.invited_by.display_name,
                  role: ROLE_LABEL[invite.role]?.() ?? invite.role,
                })}
              </p>
            </div>

            <div className="space-y-1.5 rounded-md bg-muted/60 p-3 text-sm">
              <p>
                <span className="text-muted-foreground">{t('Для адреса:')}</span>{' '}
                <span className="font-medium">{invite.email}</span>
              </p>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock size={14} />
                {t('Действует до {{date}}', {
                  date: new Date(invite.expires_at).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                })}
              </p>
            </div>

            {!signedIn && (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() =>
                    navigate(
                      `/login?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`,
                    )
                  }
                >
                  {t('Войти и принять')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate(
                      `/login?tab=register&next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`,
                    )
                  }
                >
                  {t('У меня нет аккаунта — зарегистрироваться')}
                </Button>
              </div>
            )}

            {signedIn && emailMismatch && (
              <div className="space-y-3">
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  {t(
                    'Вы вошли как {{current}}, а приглашение отправлено на {{invited}}. Войдите под нужным адресом.',
                    { current: user?.email ?? '—', invited: invite.email },
                  )}
                </p>
                <Button onClick={switchAccount}>{t('Сменить аккаунт')}</Button>
              </div>
            )}

            {signedIn && !emailMismatch && (
              <Button className="w-full" onClick={accept} disabled={busy}>
                {busy ? t('Присоединяемся…') : t('Принять приглашение')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
