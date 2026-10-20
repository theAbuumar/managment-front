import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, UserCheck, UserPlus, UserX } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ApiError } from '@/api/client'
import {
  addMember,
  inviteExistingUser,
  inviteMember,
  ROLE_LABELS,
  type AssignableRole,
} from '@/api/workspace'
import {
  buildTree,
  flattenTree,
  getDepartments,
  type Department,
} from '@/api/department'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { cn } from '@/lib/utils'
import { t as translate } from '@/i18n'

const CHANNELS: Record<string, () => string> = {
  email: () => 'email',
  telegram: () => 'Telegram',
}

const NONE = '__none__'

// «Пригласить» — the person confirms (inbox / sign-up link); «Добавить сразу» —
// an admin puts an already registered person into the workspace at once (4.F10).
type Mode = 'invite' | 'add'

const MODES: { key: Mode; label: () => string; icon: React.ReactNode }[] = [
  {
    key: 'invite',
    label: () => translate('Пригласить'),
    icon: <Mail size={14} />,
  },
  {
    key: 'add',
    label: () => translate('Добавить сразу'),
    icon: <UserCheck size={14} />,
  },
]

export function AddMemberDialog({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('invite')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>('member')
  const [departmentId, setDepartmentId] = useState(NONE)
  const [position, setPosition] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [busy, setBusy] = useState(false)
  // «Добавить сразу» for an email without an account: offer an invitation instead.
  const [notFound, setNotFound] = useState<string | null>(null)

  // Fresh on every open: an import or the org-structure page may have added departments.
  useEffect(() => {
    if (!open || !workspace) return
    let cancelled = false
    getDepartments(workspace.slug)
      .then((list) => !cancelled && setDepartments(list))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, workspace?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const deptRows = useMemo(
    () => flattenTree(buildTree(departments)),
    [departments],
  )
  const department = departments.find((d) => d.id === departmentId)

  function reset() {
    setMode('invite')
    setEmail('')
    setRole('member')
    setDepartmentId(NONE)
    setPosition('')
    setNotFound(null)
  }

  function done() {
    reset()
    setOpen(false)
    onAdded()
  }

  const place = () => ({
    department_id: departmentId === NONE ? null : departmentId,
    position: position.trim() || null,
  })

  async function invite(address: string) {
    if (!workspace) return
    try {
      // Already registered → an invitation in their inbox (+ email / Telegram).
      const { delivered_to } = await inviteExistingUser(workspace.slug, {
        email: address,
        role,
        ...place(),
      })
      const via = delivered_to.map((c) => CHANNELS[c]?.() ?? c).join(', ')
      toast.success(
        t('Приглашение отправлено: {{email}}', { email: address }),
        {
          description: via
            ? t('Появится во входящих приглашениях, продублировано: {{via}}.', {
                via,
              })
            : t('Появится во входящих приглашениях сотрудника.'),
        },
      )
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err
      // No account yet → an email with a sign-up link.
      await inviteMember(workspace.slug, address, role, place())
      toast.success(
        t('Приглашение отправлено на {{email}}', { email: address }),
        {
          description: t(
            'Сотрудник ещё не зарегистрирован — по ссылке из письма он создаст аккаунт и войдёт в пространство.',
          ),
        },
      )
    }
  }

  async function add(address: string) {
    if (!workspace) return
    const member = await addMember(workspace.slug, {
      email: address,
      role,
      ...place(),
    })
    toast.success(
      t('{{name}} добавлен(а) в пространство', {
        name: shortName(member.user),
      }),
      {
        description: t(
          'Сотрудник уже видит пространство, ему можно назначать поручения.',
        ),
      },
    )
  }

  async function submit(as: Mode = mode) {
    const address = email.trim()
    if (!workspace || !address || busy) return
    setBusy(true)
    setNotFound(null)
    try {
      if (as === 'add') await add(address)
      else await invite(address)
      done()
    } catch (err) {
      if (
        as === 'add' &&
        err instanceof ApiError &&
        err.code === 'USER_NOT_FOUND'
      ) {
        setNotFound(address)
      } else {
        toast.error(
          errorText(
            err,
            as === 'add'
              ? t('Не удалось добавить сотрудника')
              : t('Не удалось отправить приглашение'),
          ),
        )
      }
    } finally {
      setBusy(false)
    }
  }

  // The same data, now as an invitation: the person signs up by the link.
  function inviteInstead() {
    setMode('invite')
    void submit('invite')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return
        if (!v) reset()
        setOpen(v)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus size={14} /> {t('Добавить сотрудника')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pr-6">
          <DialogTitle>{t('Добавить сотрудника')}</DialogTitle>
          <DialogDescription>
            {t(
              'Укажите почту, роль и место в оргструктуре — подразделение и должность можно не заполнять.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div
              role="radiogroup"
              aria-label={t('Способ добавления')}
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
            >
              {MODES.map((m) => {
                const on = mode === m.key
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={busy}
                    onClick={() => {
                      setMode(m.key)
                      setNotFound(null)
                    }}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      on
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m.icon}
                    {m.label()}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === 'invite'
                ? t(
                    'Если у сотрудника уже есть аккаунт, приглашение придёт во входящие (и в Telegram, если он привязан). Если нет — на почту придёт ссылка для регистрации. Подразделение и должность применятся, когда он примет приглашение.',
                  )
                : t(
                    'Сотрудник сразу появится в пространстве без подтверждения. Подходит, если человек уже зарегистрирован.',
                  )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">{t('Email')}</Label>
            <Input
              id="invite-email"
              type="email"
              autoFocus
              autoComplete="off"
              placeholder="ivanov@university.tj"
              value={email}
              aria-invalid={notFound !== null}
              onChange={(e) => {
                setEmail(e.target.value)
                setNotFound(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="invite-role">{t('Роль доступа')}</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as AssignableRole)}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['member', 'admin', 'guest'] as AssignableRole[]).map(
                    (r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]()}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="invite-position">
                {t('Должность')}{' '}
                <span className="font-normal text-muted-foreground">
                  {t('(необязательно)')}
                </span>
              </Label>
              <Input
                id="invite-position"
                maxLength={150}
                placeholder={t('Например, доцент')}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit()
                }}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="invite-department">
              {t('Подразделение')}{' '}
              <span className="font-normal text-muted-foreground">
                {t('(необязательно)')}
              </span>
            </Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger id="invite-department" className="min-w-0">
                {/* The trigger shows the bare name: the list indents it by tree level. */}
                <SelectValue>
                  <span
                    className={cn(
                      'truncate',
                      !department && 'text-muted-foreground',
                    )}
                  >
                    {department ? department.name : t('Не указано')}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE}>{t('Не указано')}</SelectItem>
                {deptRows.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span style={{ paddingLeft: d.depth * 12 }}>{d.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {notFound && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <div className="flex gap-2">
                <UserX size={16} className="mt-0.5 shrink-0" />
                <p>
                  {t(
                    'Аккаунта с почтой {{email}} нет — добавить сразу нельзя. Отправьте приглашение: по ссылке из письма сотрудник зарегистрируется и войдёт в пространство с выбранными ролью, подразделением и должностью.',
                    { email: notFound },
                  )}
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 self-end"
                disabled={busy}
                onClick={inviteInstead}
              >
                <Mail size={14} /> {t('Отправить приглашение')}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              reset()
              setOpen(false)
            }}
          >
            {t('Отмена')}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || !email.trim()}
          >
            {mode === 'add'
              ? busy
                ? t('Добавляем…')
                : t('Добавить')
              : busy
                ? t('Отправляем…')
                : t('Отправить приглашение')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
