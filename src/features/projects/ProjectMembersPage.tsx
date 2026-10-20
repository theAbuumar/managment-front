import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users,
  UserPlus,
  UserMinus,
  Search,
  Lock,
  Globe,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PersonAvatar } from '@/components/ui/person-avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fullName } from '@/lib/people'
import { pluralize } from '@/lib/plural'
import { errorText } from '@/lib/errorMessages'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import {
  getProject,
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  type Project,
  type ProjectMember,
} from '@/api/project'
import { t as translate } from '@/i18n'

// The search box appears once the list no longer fits on a screen.
const SEARCH_FROM = 8

const PEOPLE: () => [string, string, string] = () => [
  translate('участник'),
  translate('участника'),
  translate('участников'),
]

/** One person of the project with what the workspace knows about them. */
interface Row {
  userId: string
  person: WorkspaceMember['user'] | ProjectMember['user']
  ws: WorkspaceMember | undefined
}

/** "Должность · Подразделение" — whatever of the two is known. */
function placeOf(ws: WorkspaceMember | undefined): string {
  if (!ws) return ''
  const dept = ws.department?.short_name || ws.department?.name
  return [ws.position, dept].filter(Boolean).join(' · ')
}

function matches(
  person: Row['person'],
  ws: WorkspaceMember | undefined,
  q: string,
) {
  if (!q) return true
  return [
    fullName(person),
    person.display_name,
    person.email ?? '',
    ws?.position ?? '',
    ws?.department?.name ?? '',
    ws?.department?.short_name ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q)
}

function Chip({
  tone = 'muted',
  title,
  children,
}: {
  tone?: 'muted' | 'primary' | 'destructive'
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'primary' && 'bg-primary/10 text-primary',
        tone === 'destructive' && 'bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </span>
  )
}

function AddMembersDialog({
  open,
  onOpenChange,
  candidates,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: WorkspaceMember[]
  /** Adds the people and returns the ids that failed (they stay selected). */
  onAdd: (userIds: string[]) => Promise<string[]>
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const q = query.trim().toLowerCase()
  const visible = candidates.filter((m) => matches(m.user, m, q))

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function close(v: boolean) {
    if (busy) return
    if (!v) {
      setQuery('')
      setPicked(new Set())
    }
    onOpenChange(v)
  }

  async function submit() {
    if (picked.size === 0 || busy) return
    setBusy(true)
    try {
      // Keep the picker's order: the list is sorted by name.
      const ids = candidates
        .filter((m) => picked.has(m.user_id))
        .map((m) => m.user_id)
      const failed = await onAdd(ids)
      if (failed.length === 0) {
        setQuery('')
        setPicked(new Set())
        onOpenChange(false)
      } else setPicked(new Set(failed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} className="text-primary" />
            {t('Добавить участников')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Выберите сотрудников пространства. Гости смогут только просматривать задачи.',
            )}
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('Все сотрудники пространства уже в проекте.')}
          </p>
        ) : (
          <>
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('ФИО, должность или подразделение')}
                className="pl-8"
              />
            </div>
            <div className="-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2">
              {visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('Никого не нашли')}
                </p>
              ) : (
                <ul className="space-y-1">
                  {visible.map((m) => {
                    const on = picked.has(m.user_id)
                    const place = placeOf(m)
                    return (
                      <li key={m.user_id}>
                        <label
                          className={cn(
                            // A ring, not a border colour: the global `* { border-color }` wins over utilities.
                            'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors',
                            on
                              ? 'bg-primary/5 ring-1 ring-primary ring-inset'
                              : 'hover:bg-muted',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-primary"
                            checked={on}
                            onChange={() => toggle(m.user_id)}
                          />
                          <PersonAvatar
                            person={{ ...m.user, id: m.user_id }}
                            size={28}
                            title={false}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-foreground">
                              {fullName(m.user)}
                            </span>
                            {place && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {place}
                              </span>
                            )}
                          </span>
                          {m.role === 'guest' && <Chip>{t('Гость')}</Chip>}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        <DialogFooter className="mt-4 flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
          {picked.size > 0 && (
            // Phones stack the buttons upside down; the counter stays on top.
            <span className="order-last text-center text-xs text-muted-foreground sm:order-none sm:mr-auto sm:text-left">
              {t('Выбрано: {{n}}', { n: picked.size })}
            </span>
          )}
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {t('Отмена')}
            </Button>
          </DialogClose>
          {candidates.length > 0 && (
            <Button onClick={submit} disabled={picked.size === 0 || busy}>
              <Check size={14} />
              {busy ? t('Добавляем…') : t('Добавить')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectMembersPage() {
  const { t } = useTranslation()
  const { projectId } = useParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const slug = workspace?.slug

  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [wsMembers, setWsMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Row | null>(null)

  useEffect(() => {
    if (!slug || !projectId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setFailed(false)
      const [p, list, people] = await Promise.all([
        getProject(slug, projectId).catch(() => null),
        getProjectMembers(slug, projectId).catch(() => null),
        // With deactivated people: someone in the project may have lost access.
        getWorkspaceMembers(slug, { includeDeactivated: true }).catch(() => []),
      ])
      if (cancelled) return
      setProject(p)
      setMembers(list ?? [])
      setWsMembers(people)
      setFailed(p === null || list === null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [slug, projectId, reloadKey])

  const wsById = useMemo(
    () => new Map(wsMembers.map((m) => [m.user_id, m])),
    [wsMembers],
  )
  // Adding and removing are for owner/admin (ADR-031); everyone else reads.
  const myRole = wsById.get(currentUserId ?? '')?.role
  const canManage = myRole === 'owner' || myRole === 'admin'

  const rows: Row[] = useMemo(() => {
    const leadId = project?.lead_id
    return members
      .map((m) => {
        const ws = wsById.get(m.user_id)
        // The workspace record carries the ФИО; the project one only the display name.
        return { userId: m.user_id, person: ws?.user ?? m.user, ws }
      })
      .sort(
        (a, b) =>
          Number(b.userId === leadId) - Number(a.userId === leadId) ||
          fullName(a.person).localeCompare(fullName(b.person), 'ru'),
      )
  }, [members, wsById, project?.lead_id])

  const q = query.trim().toLowerCase()
  const shown = rows.filter((r) => matches(r.person, r.ws, q))

  const candidates = useMemo(() => {
    const inProject = new Set(members.map((m) => m.user_id))
    return wsMembers
      .filter((m) => !inProject.has(m.user_id) && !m.deactivated_at)
      .sort((a, b) => fullName(a.user).localeCompare(fullName(b.user), 'ru'))
  }, [members, wsMembers])

  async function addMembers(userIds: string[]): Promise<string[]> {
    if (!slug || !projectId) return userIds
    const failedIds: string[] = []
    let lastError: unknown = null
    let added = 0
    // One by one: the backend adds a single person per request.
    for (const id of userIds) {
      try {
        const member = await addProjectMember(slug, projectId, id)
        setMembers((prev) => [...prev, member])
        added++
      } catch (err) {
        failedIds.push(id)
        lastError = err
      }
    }
    if (added > 0)
      toast.success(t('Добавлено: {{n}}', { n: pluralize(added, PEOPLE()) }))
    if (failedIds.length > 0) {
      const names = failedIds
        .map((id) => fullName(wsById.get(id)?.user))
        .join(', ')
      toast.error(t('Не удалось добавить: {{names}}', { names }), {
        description: errorText(lastError, t('Попробуйте ещё раз.')),
      })
    }
    return failedIds
  }

  async function remove(row: Row) {
    if (!slug || !projectId) return
    try {
      await removeProjectMember(slug, projectId, row.userId)
      setMembers((prev) => prev.filter((m) => m.user_id !== row.userId))
      toast.success(
        t('{{name}} больше не в проекте', { name: fullName(row.person) }),
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось убрать участника из проекта')))
    }
  }

  /** What removing this person means for their access. */
  function removeWarning(row: Row): string {
    const name = fullName(row.person)
    const isAdmin = row.ws?.role === 'owner' || row.ws?.role === 'admin'
    let text: string
    if (project?.visibility === 'private')
      text = isAdmin
        ? t(
            '{{name}} — администратор пространства и сохранит доступ к проекту.',
            { name },
          )
        : t(
            'Проект приватный: {{name}} потеряет доступ к нему и к его задачам.',
            { name },
          )
    else
      text = t(
        '{{name}} уйдёт из команды проекта, но сможет открывать его как сотрудник пространства.',
        {
          name,
        },
      )
    if (row.userId === project?.lead_id)
      text +=
        ' ' +
        t(
          'Руководитель проекта не изменится — его можно сменить в разделе «Общие».',
        )
    return text
  }

  const isPrivate = project?.visibility === 'private'

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <Users size={16} />
        {t('Участники проекта')}
        {!loading && !failed && (
          <span className="font-normal text-muted-foreground">
            {members.length}
          </span>
        )}
      </div>

      <div className="max-w-3xl px-4 py-6 md:px-8">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </div>
        ) : failed ? (
          <EmptyState
            icon={Users}
            title={t('Не удалось загрузить участников')}
            description={t('Проверьте связь с сервером и попробуйте ещё раз.')}
            action={{
              label: t('Повторить'),
              onClick: () => setReloadKey((k) => k + 1),
            }}
          />
        ) : (
          <>
            <p className="mb-4 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {isPrivate ? (
                <Lock size={15} className="mt-0.5 shrink-0" />
              ) : (
                <Globe size={15} className="mt-0.5 shrink-0" />
              )}
              {isPrivate
                ? t(
                    'Проект приватный: его видят только участники и администраторы пространства.',
                  )
                : t(
                    'Проект открыт всем сотрудникам пространства. Участники — его постоянная команда, их удобно выбирать в задачах.',
                  )}
            </p>

            {(canManage || rows.length > SEARCH_FROM) && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {rows.length > SEARCH_FROM && (
                  <div className="relative min-w-0 flex-1 basis-56">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('ФИО, должность, подразделение')}
                      className="pl-8"
                    />
                  </div>
                )}
                {canManage && (
                  <Button onClick={() => setAdding(true)} className="ml-auto">
                    <UserPlus size={15} />
                    {t('Добавить участников')}
                  </Button>
                )}
              </div>
            )}

            {!canManage && (
              <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock size={13} className="shrink-0" />
                {t('Состав проекта меняют администраторы пространства.')}
              </p>
            )}

            {rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t('В проекте пока нет участников')}
                description={
                  canManage
                    ? t(
                        'Добавьте сотрудников, которые постоянно работают над проектом.',
                      )
                    : undefined
                }
                action={
                  canManage
                    ? {
                        label: t('Добавить участников'),
                        onClick: () => setAdding(true),
                      }
                    : undefined
                }
              />
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t('Никого не нашли')}
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {shown.map((row) => {
                  const place = placeOf(row.ws)
                  const off = Boolean(row.ws?.deactivated_at)
                  return (
                    <li
                      key={row.userId}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <PersonAvatar
                        person={{ ...row.person, id: row.userId }}
                        size={32}
                        title={false}
                        className={cn(off && 'opacity-50')}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={cn(
                              'min-w-0 truncate text-sm font-medium text-foreground',
                              off && 'text-muted-foreground',
                            )}
                            title={fullName(row.person)}
                          >
                            {fullName(row.person)}
                            {row.userId === currentUserId && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {t('(вы)')}
                              </span>
                            )}
                          </span>
                          {row.userId === project?.lead_id && (
                            <Chip tone="primary">
                              {t('Руководитель проекта')}
                            </Chip>
                          )}
                          {row.ws?.role === 'guest' && (
                            <Chip
                              title={t('Гость только просматривает задачи')}
                            >
                              {t('Гость')}
                            </Chip>
                          )}
                          {off && (
                            <Chip tone="destructive">
                              {t('Доступ отключён')}
                            </Chip>
                          )}
                        </div>
                        {place && (
                          <p className="truncate text-xs text-muted-foreground">
                            {place}
                          </p>
                        )}
                      </div>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title={t('Убрать из проекта')}
                          aria-label={t('Убрать из проекта: {{name}}', {
                            name: fullName(row.person),
                          })}
                          onClick={() => setRemoving(row)}
                        >
                          <UserMinus size={15} />
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {q && shown.length > 0 && shown.length !== rows.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('Показано {{n}} из {{total}}', {
                  n: shown.length,
                  total: rows.length,
                })}
              </p>
            )}
          </>
        )}
      </div>

      <AddMembersDialog
        open={adding}
        onOpenChange={setAdding}
        candidates={candidates}
        onAdd={addMembers}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('Убрать участника из проекта?')}
        description={removing ? removeWarning(removing) : ''}
        confirmLabel={t('Убрать')}
        onConfirm={() => removing && remove(removing)}
      />
    </div>
  )
}
