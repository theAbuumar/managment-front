import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Network,
  Plus,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Users,
  Crown,
  Trash2,
  Search,
  Building2,
  UserPlus,
  X,
  BarChart3,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { FEATURES } from '@/lib/features'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fullName, shortName } from '@/lib/people'
import { pluralize } from '@/lib/plural'
import { errorText } from '@/lib/errorMessages'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { getWorkspaceMembers, updateMember, type WorkspaceMember } from '@/api/workspace'
import {
  buildTree,
  createDepartment,
  deleteDepartment,
  flattenTree,
  getDepartments,
  updateDepartment,
  type Department,
  type DepartmentNode,
} from '@/api/department'

const NONE = '__none__'

/** Ids of `id` and all departments below it (a department can't move under itself). */
function descendants(departments: Department[], id: string): Set<string> {
  const ids = new Set([id])
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

export function OrgStructurePage() {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const me = useAuthStore((s) => s.user?.id)
  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [createFor, setCreateFor] = useState<{ parentId: string | null } | null>(null)

  const myRole = members.find((m) => m.user_id === me)?.role
  const canEdit = myRole === 'owner' || myRole === 'admin'

  async function reload() {
    if (!workspace) return
    const [deps, mem] = await Promise.all([
      getDepartments(workspace.slug).catch(() => departments),
      getWorkspaceMembers(workspace.slug).catch(() => members),
    ])
    setDepartments(deps)
    setMembers(mem)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!workspace) return
      const [deps, mem] = await Promise.all([
        getDepartments(workspace.slug).catch(() => []),
        getWorkspaceMembers(workspace.slug).catch(() => []),
      ])
      if (cancelled) return
      setDepartments(deps)
      setMembers(mem)
      setSelectedId((cur) => cur ?? deps.find((d) => !d.parent_id)?.id ?? null)
    })().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [workspace?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const tree = useMemo(() => buildTree(departments), [departments])
  const selected = departments.find((d) => d.id === selectedId) ?? null

  // While searching, show matching departments together with their ancestors.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const byId = new Map(departments.map((d) => [d.id, d]))
    const keep = new Set<string>()
    for (const d of departments) {
      const hay = `${d.name} ${d.short_name ?? ''} ${d.head ? fullName(d.head) : ''}`.toLowerCase()
      if (!hay.includes(q)) continue
      let cur: Department | undefined = d
      while (cur) {
        keep.add(cur.id)
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
      }
    }
    return keep
  }, [departments, query])

  const assigned = members.filter((m) => m.department_id).length
  const withoutHead = departments.filter((d) => !d.head_id).length

  async function move(node: Department, dir: -1 | 1) {
    if (!workspace) return
    const siblings = departments
      .filter((d) => d.parent_id === node.parent_id)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ru'))
    const i = siblings.findIndex((d) => d.id === node.id)
    const j = i + dir
    if (j < 0 || j >= siblings.length) return
    ;[siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!]
    // Renumber the whole sibling group so equal `order` values can't block the move.
    const changes = siblings
      .map((d, idx) => ({ d, idx }))
      .filter(({ d, idx }) => d.order !== idx)
    setDepartments((prev) =>
      prev.map((d) => {
        const c = changes.find((x) => x.d.id === d.id)
        return c ? { ...d, order: c.idx } : d
      }),
    )
    try {
      await Promise.all(changes.map(({ d, idx }) => updateDepartment(workspace.slug, d.id, { order: idx })))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось изменить порядок')))
      reload()
    }
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6 text-sm font-medium">
        <Network size={16} />
        {t('Оргструктура')}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t('Оргструктура университета')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('Подразделения, их руководители и сотрудники. По ним работают фильтры, рассылка поручений и аналитика.')}
            </p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setCreateFor({ parentId: null })}>
              <Plus size={15} />
              {t('Подразделение')}
            </Button>
          )}
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={t('Подразделений')} value={departments.length} />
          <Stat label={t('Сотрудников распределено')} value={`${assigned} / ${members.length}`} />
          <Stat
            label={t('Без руководителя')}
            value={withoutHead}
            tone={withoutHead > 0 ? 'text-amber-600' : undefined}
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Tree */}
          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Найти подразделение или руководителя')}
                className="flex-1 bg-transparent py-1 text-sm outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="mb-1.5 h-9" style={{ marginLeft: (i % 3) * 18 }} />
                ))}
              {!loading && tree.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
                  <Building2 size={28} />
                  {t('Подразделений пока нет.')}
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setCreateFor({ parentId: null })}>
                      {t('Создать первое')}
                    </Button>
                  )}
                </div>
              )}
              {!loading &&
                tree.map((n) => (
                  <TreeNode
                    key={n.id}
                    node={n}
                    depth={0}
                    selectedId={selectedId}
                    collapsed={collapsed}
                    visible={visible}
                    canEdit={canEdit}
                    onSelect={setSelectedId}
                    onToggle={toggle}
                    onMove={move}
                    onAddChild={(id) => setCreateFor({ parentId: id })}
                  />
                ))}
            </div>
          </div>

          {/* Details */}
          <div className="min-h-[420px] overflow-y-auto rounded-lg border border-border">
            {selected ? (
              <DepartmentDetails
                key={selected.id}
                department={selected}
                departments={departments}
                members={members}
                canEdit={canEdit}
                onChanged={reload}
                onDeleted={() => {
                  setSelectedId(selected.parent_id)
                  reload()
                }}
                onSelect={setSelectedId}
                onAddChild={() => setCreateFor({ parentId: selected.id })}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
                {t('Выберите подразделение слева')}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateDepartmentDialog
        open={createFor !== null}
        parentId={createFor?.parentId ?? null}
        departments={departments}
        onOpenChange={(v) => !v && setCreateFor(null)}
        onCreated={(d) => {
          setCreateFor(null)
          setSelectedId(d.id)
          if (d.parent_id) setCollapsed((prev) => new Set([...prev].filter((x) => x !== d.parent_id)))
          reload()
        }}
      />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-xl font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}

function TreeNode({
  node,
  depth,
  selectedId,
  collapsed,
  visible,
  canEdit,
  onSelect,
  onToggle,
  onMove,
  onAddChild,
}: {
  node: DepartmentNode
  depth: number
  selectedId: string | null
  collapsed: Set<string>
  visible: Set<string> | null
  canEdit: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onMove: (d: Department, dir: -1 | 1) => void
  onAddChild: (id: string) => void
}) {
  const { t } = useTranslation()
  if (visible && !visible.has(node.id)) return null
  const hasChildren = node.children.length > 0
  // A search expands everything that matched.
  const open = visible ? true : !collapsed.has(node.id)
  const active = selectedId === node.id

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node.id)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(node.id)}
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-1.5 text-sm transition-colors',
          active ? 'bg-nav-active-bg' : 'hover:bg-muted',
        )}
        style={{ paddingLeft: 6 + depth * 18 }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) onToggle(node.id)
          }}
          className={cn('flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground', hasChildren ? 'hover:bg-accent' : 'invisible')}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium text-primary')} title={node.name}>
          {node.name}
          {node.short_name && <span className="ml-1.5 text-xs text-muted-foreground">{node.short_name}</span>}
        </span>
        {node.head ? (
          <PersonAvatar person={node.head} size={20} />
        ) : (
          <span title={t('Руководитель не назначен')} className="size-5 shrink-0 rounded-full border border-dashed border-amber-400" />
        )}
        <span className="flex w-10 shrink-0 items-center justify-end gap-0.5 text-xs tabular-nums text-muted-foreground" title={t('Сотрудников')}>
          <Users size={11} />
          {node.members_count}
        </span>
        {canEdit && (
          <span className="hidden shrink-0 items-center group-hover:flex" onClick={(e) => e.stopPropagation()}>
            <IconBtn title={t('Выше')} onClick={() => onMove(node, -1)}>
              <ArrowUp size={13} />
            </IconBtn>
            <IconBtn title={t('Ниже')} onClick={() => onMove(node, 1)}>
              <ArrowDown size={13} />
            </IconBtn>
            <IconBtn title={t('Добавить вложенное')} onClick={() => onAddChild(node.id)}>
              <Plus size={13} />
            </IconBtn>
          </span>
        )}
      </div>
      {open &&
        node.children.map((c) => (
          <TreeNode
            key={c.id}
            node={c}
            depth={depth + 1}
            selectedId={selectedId}
            collapsed={collapsed}
            visible={visible}
            canEdit={canEdit}
            onSelect={onSelect}
            onToggle={onToggle}
            onMove={onMove}
            onAddChild={onAddChild}
          />
        ))}
    </div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
      {children}
    </button>
  )
}

function DepartmentDetails({
  department: d,
  departments,
  members,
  canEdit,
  onChanged,
  onDeleted,
  onSelect,
  onAddChild,
}: {
  department: Department
  departments: Department[]
  members: WorkspaceMember[]
  canEdit: boolean
  onChanged: () => void
  onDeleted: () => void
  onSelect: (id: string) => void
  onAddChild: () => void
}) {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [name, setName] = useState(d.name)
  const [short, setShort] = useState(d.short_name ?? '')
  const [parent, setParent] = useState(d.parent_id ?? NONE)
  const [head, setHead] = useState(d.head_id ?? NONE)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const blocked = useMemo(() => descendants(departments, d.id), [departments, d.id])
  const parentRows = flattenTree(buildTree(departments)).filter((x) => !blocked.has(x.id))
  const staff = members
    .filter((m) => m.department_id === d.id)
    .sort((a, b) => (a.user_id === d.head_id ? -1 : b.user_id === d.head_id ? 1 : fullName(a.user).localeCompare(fullName(b.user), 'ru')))
  const children = departments.filter((x) => x.parent_id === d.id).sort((a, b) => a.order - b.order)
  const path: Department[] = []
  for (let cur = departments.find((x) => x.id === d.parent_id); cur; cur = departments.find((x) => x.id === cur!.parent_id)) {
    path.unshift(cur)
  }

  const dirty =
    name.trim() !== d.name ||
    (short.trim() || null) !== d.short_name ||
    (parent === NONE ? null : parent) !== d.parent_id ||
    (head === NONE ? null : head) !== d.head_id

  async function save() {
    if (!workspace || !name.trim()) return
    setBusy(true)
    try {
      await updateDepartment(workspace.slug, d.id, {
        name: name.trim(),
        short_name: short.trim() || null,
        parent_id: parent === NONE ? null : parent,
        head_id: head === NONE ? null : head,
      })
      toast.success(t('Подразделение сохранено'))
      onChanged()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить подразделение')))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!workspace) return
    try {
      await deleteDepartment(workspace.slug, d.id)
      toast.success(t('Подразделение «{{name}}» удалено', { name: d.name }))
      onDeleted()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить подразделение')))
    }
  }

  async function assign(m: WorkspaceMember, departmentId: string | null) {
    if (!workspace) return
    try {
      await updateMember(workspace.slug, m.user_id, { department_id: departmentId })
      toast.success(
        departmentId
          ? t('{{name}} переведён(а) в «{{dept}}»', { name: shortName(m.user), dept: d.name })
          : t('{{name}} исключён(а) из подразделения', { name: shortName(m.user) }),
      )
      onChanged()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось изменить подразделение')))
    }
  }

  return (
    <div className="p-5">
      {path.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {path.map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              <button className="hover:text-foreground hover:underline" onClick={() => onSelect(p.id)}>
                {p.short_name || p.name}
              </button>
              <ChevronRight size={11} />
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">{d.name}</h2>
        {FEATURES.analytics && (
          <Link
            to={`/departments/${d.id}`}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-primary hover:bg-accent"
          >
            <BarChart3 size={13} />
            {t('Страница подразделения')}
          </Link>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {pluralize(staff.length, [t('сотрудник'), t('сотрудника'), t('сотрудников')])}
        {children.length > 0 && ` · ${pluralize(children.length, [t('вложенное подразделение'), t('вложенных подразделения'), t('вложенных подразделений')])}`}
      </p>

      {/* Properties */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('Название')}</Label>
          <Input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('Краткое')}</Label>
          <Input value={short} disabled={!canEdit} placeholder="ФМФ" onChange={(e) => setShort(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">{t('Вышестоящее подразделение')}</Label>
          <Select value={parent} onValueChange={setParent} disabled={!canEdit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={NONE}>{t('— верхний уровень —')}</SelectItem>
              {parentRows.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  <span style={{ paddingLeft: x.depth * 12 }}>{x.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">{t('Руководитель')}</Label>
          <Select value={head} onValueChange={setHead} disabled={!canEdit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={NONE}>{t('Не назначен')}</SelectItem>
              {[...members]
                .sort((a, b) => fullName(a.user).localeCompare(fullName(b.user), 'ru'))
                .map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {shortName(m.user)}
                    {m.position ? ` · ${m.position}` : ''}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={busy || !dirty || !name.trim()}>
            {busy ? t('Сохраняем…') : t('Сохранить')}
          </Button>
          <Button size="sm" variant="outline" onClick={onAddChild}>
            <Plus size={14} />
            {t('Вложенное подразделение')}
          </Button>
        </div>
      )}

      {/* Sub-departments */}
      {children.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Вложенные подразделения')}</p>
          <div className="flex flex-wrap gap-1.5">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                {c.short_name || c.name}
                <span className="text-muted-foreground">{c.members_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Staff */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Сотрудники')}</p>
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setAddOpen((v) => !v)}>
              <UserPlus size={13} />
              {t('Добавить')}
            </Button>
          )}
        </div>
        {addOpen && (
          <MemberPicker
            members={members.filter((m) => m.department_id !== d.id)}
            onPick={(m) => {
              setAddOpen(false)
              assign(m, d.id)
            }}
          />
        )}
        {staff.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            {t('В подразделении пока нет сотрудников')}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {staff.map((m) => (
              <div key={m.user_id} className="group flex items-center gap-2.5 px-3 py-2">
                <PersonAvatar person={{ ...m.user, id: m.user_id }} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm">
                    {fullName(m.user)}
                    {m.user_id === d.head_id && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        <Crown size={10} />
                        {t('руководитель')}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.position || t('Должность не указана')}</p>
                </div>
                {canEdit && (
                  <button
                    title={t('Исключить из подразделения')}
                    onClick={() => assign(m, null)}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="mt-8 flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-semibold">{t('Удалить подразделение')}</p>
            <p className="text-xs text-muted-foreground">
              {t('Сотрудники, проекты и вложенные подразделения перейдут на уровень выше.')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={14} />
            {t('Удалить')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Удалить «{{name}}»?', { name: d.name })}
        description={t('Сотрудники, проекты и вложенные подразделения перейдут на уровень выше.')}
        confirmLabel={t('Удалить')}
        cancelLabel={t('Отмена')}
        onConfirm={remove}
      />
    </div>
  )
}

function MemberPicker({ members, onPick }: { members: WorkspaceMember[]; onPick: (m: WorkspaceMember) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = members
    .filter((m) => `${fullName(m.user)} ${m.position ?? ''} ${m.user.email ?? ''}`.toLowerCase().includes(needle))
    .slice(0, 30)
  return (
    <div className="mb-3 rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        <Search size={13} className="text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('Найти сотрудника')}
          className="flex-1 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>
      <div className="max-h-56 overflow-y-auto p-1">
        {rows.map((m) => (
          <button
            key={m.user_id}
            onClick={() => onPick(m)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <PersonAvatar person={{ ...m.user, id: m.user_id }} size={22} />
            <span className="min-w-0 flex-1 truncate">{shortName(m.user)}</span>
            <span className="max-w-[45%] truncate text-xs text-muted-foreground">{m.department?.short_name || m.department?.name || t('без подразделения')}</span>
          </button>
        ))}
        {rows.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{t('Никого не найдено')}</p>}
      </div>
    </div>
  )
}

function CreateDepartmentDialog({
  open,
  parentId,
  departments,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  parentId: string | null
  departments: Department[]
  onOpenChange: (v: boolean) => void
  onCreated: (d: Department) => void
}) {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [name, setName] = useState('')
  const [short, setShort] = useState('')
  const [busy, setBusy] = useState(false)
  const parent = departments.find((d) => d.id === parentId)

  async function create() {
    if (!workspace || !name.trim()) return
    setBusy(true)
    try {
      const d = await createDepartment(workspace.slug, {
        name: name.trim(),
        short_name: short.trim() || null,
        parent_id: parentId,
      })
      toast.success(t('Подразделение «{{name}}» создано', { name: d.name }))
      setName('')
      setShort('')
      onCreated(d)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось создать подразделение')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setName('')
          setShort('')
        }
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{parent ? t('Вложенное подразделение') : t('Новое подразделение')}</DialogTitle>
        </DialogHeader>
        {parent && (
          <p className="-mt-2 text-sm text-muted-foreground">
            {t('Внутри: {{name}}', { name: parent.name })}
          </p>
        )}
        <div className="grid grid-cols-[1fr_120px] gap-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('Название')}</Label>
            <Input
              autoFocus
              value={name}
              placeholder={t('Кафедра информатики')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('Краткое')}</Label>
            <Input value={short} placeholder="КИ" onChange={(e) => setShort(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Отмена')}
          </Button>
          <Button onClick={create} disabled={busy || !name.trim()}>
            {busy ? t('Создаём…') : t('Создать')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
