import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Search, Trash2, Building2, Mail, MonitorSmartphone, MoreHorizontal, Unlink, UserCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { PersonAvatar } from '@/components/ui/person-avatar'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { GithubIcon, GoogleIcon, TelegramIcon } from '@/features/auth/ProviderIcons'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import {
  getWorkspaceMembers,
  updateMember,
  removeMember,
  getMemberAccess,
  deactivateMember,
  activateMember,
  resetMemberIdentity,
  ROLE_LABELS,
  type LoginProvider,
  type MemberAccess,
  type WorkspaceMember,
  type AssignableRole,
  type MemberRole,
} from '@/api/workspace'
import { buildTree, flattenTree, getDepartments, type Department } from '@/api/department'
import { fullName, shortName } from '@/lib/people'
import { dateTime, shortDate, timeAgo } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { cn } from '@/lib/utils'
import { t as translate } from '@/i18n'
import { AddMemberDialog } from './AddMemberDialog'
import { ImportMembersDialog } from './ImportMembersDialog'

const ALL = '__all__'
const NONE = '__none__'

// 'deactivated': members whose access an admin turned off (12.B7).
type RoleFilter = 'all' | MemberRole | 'deactivated'

type ResettableProvider = Exclude<LoginProvider, 'email'>

const PROVIDER_NAMES: Record<LoginProvider, () => string> = {
  email: () => translate('Почта'),
  google: () => 'Google',
  github: () => 'GitHub',
  telegram: () => 'Telegram',
}

const PROVIDER_ICONS: Record<LoginProvider, React.ReactNode> = {
  email: <Mail size={14} />,
  google: <GoogleIcon />,
  github: <GithubIcon />,
  telegram: <TelegramIcon />,
}

/** Department ids of `rootId` and everything below it. */
function subtreeIds(departments: Department[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const d of departments) {
      if (d.parent_id && ids.has(d.parent_id) && !ids.has(d.id)) {
        ids.add(d.id)
        grew = true
      }
    }
  }
  return ids
}

export function MembersPage() {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState<string>(ALL)
  const [withSub, setWithSub] = useState(true)
  const [role, setRole] = useState<RoleFilter>('all')
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null)
  // Admin view (12.B7): sign-ins, devices, login methods; deactivation and resets.
  const [access, setAccess] = useState<Map<string, MemberAccess>>(new Map())
  const [deactivating, setDeactivating] = useState<WorkspaceMember | null>(null)
  const [resetting, setResetting] = useState<{ member: WorkspaceMember; provider: ResettableProvider } | null>(null)

  // After an add or an import: an import may also have created departments.
  async function load() {
    if (!workspace) return
    const [list, deps] = await Promise.all([
      getWorkspaceMembers(workspace.slug, { includeDeactivated: true }).catch(() => null),
      getDepartments(workspace.slug).catch(() => null),
    ])
    if (list) setMembers(list)
    if (deps) setDepartments(deps)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!workspace) return
      const [list, deps] = await Promise.all([
        getWorkspaceMembers(workspace.slug, { includeDeactivated: true }).catch(() => []),
        getDepartments(workspace.slug).catch(() => []),
      ])
      if (cancelled) return
      setMembers(list)
      setDepartments(deps)
    })().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [workspace?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const deptRows = useMemo(() => flattenTree(buildTree(departments)), [departments])

  // Only owners/admins can manage members (the backend enforces it too).
  const myRole = members.find((m) => m.user_id === currentUserId)?.role
  const canManage = myRole === 'owner' || myRole === 'admin'

  const toMap = (list: MemberAccess[]) => new Map(list.map((a) => [a.user_id, a]))

  async function loadAccess() {
    if (!workspace) return
    setAccess(toMap(await getMemberAccess(workspace.slug).catch(() => [])))
  }

  useEffect(() => {
    if (!workspace || !canManage) return
    let cancelled = false
    getMemberAccess(workspace.slug)
      .then((list) => !cancelled && setAccess(toMap(list)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [workspace?.slug, canManage]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inDept =
      dept === ALL || dept === NONE ? null : withSub ? subtreeIds(departments, dept) : new Set([dept])
    return members
      .filter((m) => {
        if (role === 'deactivated') {
          if (!m.deactivated_at) return false
        } else if (role !== 'all' && m.role !== role) return false
        if (dept === NONE && m.department_id) return false
        if (inDept && (!m.department_id || !inDept.has(m.department_id))) return false
        if (!q) return true
        return [fullName(m.user), m.user.display_name, m.user.email ?? '', m.position ?? '', m.department?.name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => fullName(a.user).localeCompare(fullName(b.user), 'ru'))
  }, [members, departments, query, dept, withSub, role])

  // Apply the server's answer to the row so the table stays in sync without a refetch.
  async function patch(m: WorkspaceMember, data: Parameters<typeof updateMember>[2], ok: string) {
    if (!workspace) return
    try {
      const updated = await updateMember(workspace.slug, m.user_id, data)
      setMembers((prev) =>
        prev.map((x) =>
          x.user_id === m.user_id
            ? {
                ...x,
                ...updated,
                user: updated.user ?? x.user,
                department:
                  updated.department !== undefined
                    ? updated.department
                    : departments.find((d) => d.id === updated.department_id) ?? null,
              }
            : x,
        ),
      )
      toast.success(ok)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить изменения')))
    }
  }

  async function remove() {
    if (!workspace || !removing) return
    try {
      await removeMember(workspace.slug, removing.user_id)
      toast.success(t('{{name}} удалён(а) из пространства', { name: shortName(removing.user) }))
      setMembers((prev) => prev.filter((x) => x.user_id !== removing.user_id))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить сотрудника')))
    }
  }

  async function deactivate() {
    if (!workspace || !deactivating) return
    const m = deactivating
    try {
      const { member, signed_out } = await deactivateMember(workspace.slug, m.user_id)
      setMembers((prev) => prev.map((x) => (x.user_id === m.user_id ? { ...x, deactivated_at: member.deactivated_at } : x)))
      toast.success(
        signed_out
          ? t('Доступ {{name}} отключён, все сеансы завершены', { name: shortName(m.user) })
          : t('Доступ {{name}} к пространству отключён', { name: shortName(m.user) }),
      )
      void loadAccess()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отключить доступ')))
    }
  }

  async function activate(m: WorkspaceMember) {
    if (!workspace) return
    try {
      await activateMember(workspace.slug, m.user_id)
      setMembers((prev) => prev.map((x) => (x.user_id === m.user_id ? { ...x, deactivated_at: null } : x)))
      toast.success(t('Доступ {{name}} восстановлен', { name: shortName(m.user) }))
      void loadAccess()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось вернуть доступ')))
    }
  }

  async function resetIdentity() {
    if (!workspace || !resetting) return
    const { member, provider } = resetting
    try {
      await resetMemberIdentity(workspace.slug, member.user_id, provider)
      toast.success(t('{{provider}} отвязан от аккаунта {{name}}', { provider: PROVIDER_NAMES[provider](), name: shortName(member.user) }))
      void loadAccess()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отвязать')))
    }
  }

  const deactivatingInfo = deactivating ? access.get(deactivating.user_id) : undefined

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-6 text-sm font-medium">
        <Users size={16} />
        {t('Сотрудники')}
      </div>

      <div className="px-8 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            {t('Сотрудники')}
            <span className="rounded-full bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground">
              {members.length}
            </span>
          </h1>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <ImportMembersDialog onImported={load} />
              <AddMemberDialog onAdded={load} />
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('ФИО, email, должность')}
              className="h-9 w-64 pl-8"
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 w-72">
              <span className="flex min-w-0 items-center gap-2">
                <Building2 size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate">
                  <SelectValue />
                </span>
              </span>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={ALL}>{t('Все подразделения')}</SelectItem>
              <SelectItem value={NONE}>{t('Без подразделения')}</SelectItem>
              {deptRows.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  <span style={{ paddingLeft: d.depth * 12 }}>{d.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dept !== ALL && dept !== NONE && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={withSub} onCheckedChange={setWithSub} />
              {t('С нижестоящими')}
            </label>
          )}
          <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('Все роли')}</SelectItem>
              {(Object.keys(ROLE_LABELS) as MemberRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]()}
                </SelectItem>
              ))}
              {members.some((m) => m.deactivated_at) && (
                <SelectItem value="deactivated">{t('Доступ отключён')}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {rows.length !== members.length && (
            <span className="text-xs text-muted-foreground">
              {t('Показано {{n}} из {{total}}', { n: rows.length, total: members.length })}
            </span>
          )}
        </div>

        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Сотрудник')}</TableHead>
                <TableHead>{t('Должность')}</TableHead>
                <TableHead>{t('Подразделение')}</TableHead>
                <TableHead className="w-44">{t('Роль доступа')}</TableHead>
                <TableHead className="w-28">{canManage ? t('Активность') : t('В системе с')}</TableHead>
                <TableHead className="sticky right-0 w-10 bg-background" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!loading &&
                rows.map((m) => {
                  // Owner and self can't change role or be removed (backend rejects both).
                  const roleEditable = canManage && m.role !== 'owner' && m.user_id !== currentUserId
                  return (
                    <TableRow key={m.user_id} className={cn(m.deactivated_at && 'bg-muted/30')}>
                      <TableCell>
                        <div className={cn('flex items-center gap-2.5', m.deactivated_at && 'opacity-60')}>
                          <PersonAvatar person={{ ...m.user, id: m.user_id }} size={30} />
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={fullName(m.user)}>
                              {fullName(m.user)}
                              {m.user_id === currentUserId && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t('(вы)')}</span>
                              )}
                            </p>
                            {m.deactivated_at && (
                              <p
                                className="text-xs font-medium text-destructive"
                                title={
                                  access.get(m.user_id)?.deactivated_by
                                    ? t('Отключил(а): {{name}}, {{date}}', {
                                        name: access.get(m.user_id)!.deactivated_by!.display_name,
                                        date: dateTime(m.deactivated_at),
                                      })
                                    : dateTime(m.deactivated_at)
                                }
                              >
                                {t('Доступ отключён')}
                              </p>
                            )}
                            <p className="truncate text-xs text-muted-foreground">{m.user.email ?? '—'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-40">
                        {canManage ? (
                          <PositionInput
                            value={m.position ?? ''}
                            onSave={(v) => patch(m, { position: v || null }, t('Должность сохранена'))}
                          />
                        ) : (
                          <span className="text-muted-foreground">{m.position || '—'}</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-44">
                        {canManage ? (
                          <Select
                            value={m.department_id ?? NONE}
                            onValueChange={(v) =>
                              patch(m, { department_id: v === NONE ? null : v }, t('Подразделение сохранено'))
                            }
                          >
                            <SelectTrigger className="h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input">
                              <span className="truncate">
                                <SelectValue />
                              </span>
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                              <SelectItem value={NONE}>{t('Не указано')}</SelectItem>
                              {deptRows.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  <span style={{ paddingLeft: d.depth * 12 }}>{d.name}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{m.department?.name ?? '—'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {roleEditable ? (
                          <Select
                            value={m.role}
                            onValueChange={(v) =>
                              patch(
                                m,
                                { role: v as AssignableRole },
                                t('Роль изменена: {{role}}', { role: ROLE_LABELS[v as AssignableRole]() }),
                              )
                            }
                          >
                            <SelectTrigger className="h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['admin', 'member', 'guest'] as AssignableRole[]).map((r) => (
                                <SelectItem key={r} value={r}>
                                  {ROLE_LABELS[r]()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="px-2">{ROLE_LABELS[m.role]()}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {canManage ? (
                          <AccessCell info={access.get(m.user_id)} />
                        ) : m.created_at ? (
                          shortDate(m.created_at)
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      {/* Pinned to the right edge: reachable when the table scrolls sideways. */}
                      <TableCell className="sticky right-0 bg-background text-right">
                        {roleEditable && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                title={t('Действия с сотрудником')}
                              >
                                <MoreHorizontal size={15} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                              {m.deactivated_at ? (
                                <DropdownMenuItem onClick={() => activate(m)}>
                                  <UserCheck size={14} className="mr-2" />
                                  {t('Вернуть доступ')}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setDeactivating(m)}>
                                  <UserX size={14} className="mr-2" />
                                  {t('Отключить доступ')}
                                </DropdownMenuItem>
                              )}
                              {resettable(access.get(m.user_id)).map((provider) => (
                                <DropdownMenuItem key={provider} onClick={() => setResetting({ member: m, provider })}>
                                  <Unlink size={14} className="mr-2" />
                                  {t('Отвязать {{provider}}', { provider: PROVIDER_NAMES[provider]() })}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setRemoving(m)}>
                                <Trash2 size={14} className="mr-2" />
                                {t('Удалить из пространства')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t('Сотрудники не найдены.')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={t('Удалить {{name}} из пространства?', { name: removing ? shortName(removing.user) : '' })}
        description={t('Сотрудник потеряет доступ к пространству. Его задачи и история сохранятся, пригласить можно снова.')}
        confirmLabel={t('Удалить')}
        cancelLabel={t('Отмена')}
        onConfirm={remove}
      />
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(v) => !v && setDeactivating(null)}
        title={t('Отключить доступ {{name}}?', { name: deactivating ? shortName(deactivating.user) : '' })}
        description={[
          t('Сотрудник не сможет открыть пространство, его сеансы в нём завершатся, уведомления о задачах приходить не будут. Задачи, комментарии и история сохранятся, доступ можно вернуть.'),
          deactivatingInfo && deactivatingInfo.open_issues > 0
            ? t('Открытых задач у сотрудника: {{n}}. Передайте их другому исполнителю или контролёру.', { n: deactivatingInfo.open_issues })
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        confirmLabel={t('Отключить')}
        cancelLabel={t('Отмена')}
        onConfirm={deactivate}
      />
      <ConfirmDialog
        open={resetting !== null}
        onOpenChange={(v) => !v && setResetting(null)}
        title={
          resetting
            ? t('Отвязать {{provider}} от аккаунта {{name}}?', {
                provider: PROVIDER_NAMES[resetting.provider](),
                name: shortName(resetting.member.user),
              })
            : ''
        }
        description={t('Вход через этот способ и уведомления в нём перестанут работать. Сотрудник сможет привязать его заново в профиле.')}
        confirmLabel={t('Отвязать')}
        cancelLabel={t('Отмена')}
        onConfirm={resetIdentity}
      />
    </div>
  )
}

/** Login methods an admin may unlink: not the email, never the last one (12.B7). */
function resettable(info: MemberAccess | undefined): ResettableProvider[] {
  if (!info || info.providers.length < 2) return []
  return info.providers.filter((p): p is ResettableProvider => p !== 'email')
}

/** Last activity, login methods and devices signed in (admin view, 12.B7). */
function AccessCell({ info }: { info: MemberAccess | undefined }) {
  const { t } = useTranslation()
  if (!info) return <span>—</span>
  const seen = info.last_seen_at ?? info.last_login_at
  return (
    <div className="space-y-1 whitespace-nowrap">
      <p
        className="text-sm text-foreground"
        title={info.last_login_at ? t('Последний вход: {{date}}', { date: dateTime(info.last_login_at) }) : undefined}
      >
        {seen ? timeAgo(seen) : t('Не входил(а)')}
      </p>
      {(info.providers.length > 0 || info.active_sessions > 0) && (
        <p className="flex items-center gap-1.5 text-xs">
          {info.providers.map((p) => (
            <span key={p} title={PROVIDER_NAMES[p]()} aria-label={PROVIDER_NAMES[p]()}>
              {PROVIDER_ICONS[p]}
            </span>
          ))}
          {info.active_sessions > 0 && (
            <span
              className="flex items-center gap-0.5"
              title={t('Устройств с открытым сеансом: {{n}}', { n: info.active_sessions })}
            >
              <MonitorSmartphone size={13} />
              {info.active_sessions}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

/** Inline position editor: saves on Enter or blur when the value changed. */
function PositionInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  // Follow the server value when it changes (e.g. after a save elsewhere).
  if (prev !== value) {
    setPrev(value)
    setDraft(value)
  }
  const commit = () => {
    const v = draft.trim()
    if (v !== value) onSave(v)
  }
  return (
    <Input
      value={draft}
      placeholder={t('Указать должность')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className="h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input focus:border-input"
    />
  )
}
