import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Search, Trash2, Building2 } from 'lucide-react'
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
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import {
  getWorkspaceMembers,
  updateMember,
  removeMember,
  ROLE_LABELS,
  type WorkspaceMember,
  type AssignableRole,
  type MemberRole,
} from '@/api/workspace'
import { buildTree, flattenTree, getDepartments, type Department } from '@/api/department'
import { fullName, shortName } from '@/lib/people'
import { shortDate } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { AddMemberDialog } from './AddMemberDialog'

const ALL = '__all__'
const NONE = '__none__'

type RoleFilter = 'all' | MemberRole

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

  async function load() {
    if (!workspace) return
    setMembers(await getWorkspaceMembers(workspace.slug).catch(() => []))
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!workspace) return
      const [list, deps] = await Promise.all([
        getWorkspaceMembers(workspace.slug).catch(() => []),
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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inDept =
      dept === ALL || dept === NONE ? null : withSub ? subtreeIds(departments, dept) : new Set([dept])
    return members
      .filter((m) => {
        if (role !== 'all' && m.role !== role) return false
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
          {canManage && <AddMemberDialog onAdded={load} />}
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
                <TableHead className="w-28">{t('В системе с')}</TableHead>
                <TableHead className="w-10" />
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
                    <TableRow key={m.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar person={{ ...m.user, id: m.user_id }} size={30} />
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={fullName(m.user)}>
                              {fullName(m.user)}
                              {m.user_id === currentUserId && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t('(вы)')}</span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{m.user.email ?? '—'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        {canManage ? (
                          <PositionInput
                            value={m.position ?? ''}
                            onSave={(v) => patch(m, { position: v || null }, t('Должность сохранена'))}
                          />
                        ) : (
                          <span className="text-muted-foreground">{m.position || '—'}</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-56">
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
                        {m.created_at ? shortDate(m.created_at) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {roleEditable && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title={t('Удалить из пространства')}
                            onClick={() => setRemoving(m)}
                          >
                            <Trash2 size={15} />
                          </Button>
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
