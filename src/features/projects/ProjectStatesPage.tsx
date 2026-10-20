import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type LiHTMLAttributes,
} from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  CircleDot,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  GripVertical,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Star,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ColorPicker } from '@/features/projects/ColorPicker'
import { cn } from '@/lib/utils'
import { errorText } from '@/lib/errorMessages'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { getWorkspaceMembers } from '@/api/workspace'
import {
  STATE_GROUPS,
  getStates,
  createState,
  updateState,
  deleteState,
  reorderStates,
  type State,
  type StateGroup,
} from '@/api/state'
import { t as translate } from '@/i18n'

// Board order of the groups; a state never leaves its group on this page.
const GROUP_ORDER = Object.keys(STATE_GROUPS) as StateGroup[]

// What each group means to the system (ADR-031), one line under its title.
const GROUP_HINTS: Record<StateGroup, () => string> = {
  backlog: () => translate('Задачи «на потом»: ещё не запланированы в работу.'),
  unstarted: () => translate('Работа запланирована, но ещё не начата.'),
  started: () => translate('Исполнитель работает над задачей.'),
  review: () =>
    translate(
      'Сюда переходит работа, сданная исполнителем; контролёр принимает или возвращает её.',
    ),
  completed: () =>
    translate('Закрытые задачи; на них считается выполнение в аналитике.'),
  cancelled: () =>
    translate('Снятые задачи: не считаются ни выполненными, ни просроченными.'),
}

type Grouped = Record<StateGroup, State[]>

/** States split by group, keeping the server's order inside each group. */
function groupStates(states: State[]): Grouped {
  const out = Object.fromEntries(
    GROUP_ORDER.map((g) => [g, []]),
  ) as unknown as Grouped
  for (const s of states) out[s.group]?.push(s)
  return out
}

/** The whole board order: groups in their fixed order, each group as given. */
function flatten(grouped: Grouped): State[] {
  return GROUP_ORDER.flatMap((g) => grouped[g]).map((s, order) => ({
    ...s,
    order,
  }))
}

/** Why the state cannot be deleted (mirrors the backend's 409s), or null. */
function deleteBlocker(state: State, grouped: Grouped): string | null {
  if (state.is_default)
    return translate(
      'Это состояние по умолчанию. Сначала сделайте состоянием по умолчанию другое.',
    )
  if (grouped[state.group].length <= 1)
    return translate(
      'Это единственное состояние группы «{{group}}», а в каждой группе должно остаться хотя бы одно.',
      { group: STATE_GROUPS[state.group].label() },
    )
  return null
}

function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('size-3 shrink-0 rounded-full', className)}
      style={{ background: color }}
    />
  )
}

/** Name + colour, used both to add a state and to edit one in place. */
function StateForm({
  initialName,
  initialColor,
  submitLabel,
  takenNames,
  onSubmit,
  onCancel,
}: {
  initialName: string
  initialColor: string
  submitLabel: string
  /** Lower-cased names of the other states: two columns with one name confuse everyone. */
  takenNames: Set<string>
  onSubmit: (data: { name: string; color: string }) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()
  const taken = takenNames.has(trimmed.toLowerCase())

  async function submit() {
    if (!trimmed || taken || busy) return
    setBusy(true)
    try {
      await onSubmit({ name: trimmed, color })
    } catch {
      // The page has already shown the error; keep the form open to retry.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 bg-muted/40 px-3 py-2.5">
      <Input
        autoFocus
        value={name}
        maxLength={50}
        placeholder={t('Название состояния')}
        aria-invalid={taken || undefined}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
        }}
        className="h-8 w-full bg-background sm:w-56"
      />
      <ColorPicker value={color} onChange={setColor} />
      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" onClick={submit} disabled={busy || !trimmed || taken}>
          <Check size={14} /> {submitLabel}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('Отмена')}
          title={t('Отмена')}
          onClick={onCancel}
        >
          <X size={14} />
        </Button>
      </div>
      {taken && (
        <p className="w-full text-xs text-destructive">
          {t('Состояние с таким названием в проекте уже есть.')}
        </p>
      )}
    </div>
  )
}

function DeleteStateDialog({
  open,
  onOpenChange,
  state,
  states,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: State | null
  states: State[]
  onConfirm: (transferTo: string) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {state && (
          // Keyed by state so the target is picked afresh for each one.
          <DeleteStateForm
            key={state.id}
            state={state}
            states={states}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeleteStateForm({
  state,
  states,
  onConfirm,
}: {
  state: State
  states: State[]
  onConfirm: (transferTo: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const others = states.filter((s) => s.id !== state.id)
  // A sibling of the same group keeps the issues at their stage (a done issue
  // stays done); the default state is the fallback.
  const [target, setTarget] = useState(
    () =>
      (
        others.find((s) => s.group === state.group) ??
        others.find((s) => s.is_default) ??
        others[0]
      )?.id ?? '',
  )
  const [busy, setBusy] = useState(false)
  const chosen = others.find((s) => s.id === target)
  const changesGroup = chosen && chosen.group !== state.group

  async function confirm() {
    if (!target || busy) return
    setBusy(true)
    try {
      await onConfirm(target)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('Удалить состояние «{{name}}»?', { name: state.name })}
        </DialogTitle>
        <DialogDescription>
          {t(
            'Все задачи этого состояния, включая задачи в корзине, перейдут в выбранное. Перенос запишется в историю каждой задачи.',
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('Куда перенести задачи')}</p>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger>
            <SelectValue placeholder={t('Выберите состояние')} />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {GROUP_ORDER.map((g) => {
              const list = others.filter((s) => s.group === g)
              if (list.length === 0) return null
              return (
                <SelectGroup key={g}>
                  <SelectLabel className="text-muted-foreground">
                    {STATE_GROUPS[g].label()}
                  </SelectLabel>
                  {list.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <Dot color={s.color} className="size-2.5" />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
            })}
          </SelectContent>
        </Select>
        {changesGroup && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {t(
              'Задачи сменят этап: «{{from}}» → «{{to}}». Это отразится на контроле и аналитике.',
              {
                from: STATE_GROUPS[state.group].label(),
                to: STATE_GROUPS[chosen.group].label(),
              },
            )}
          </p>
        )}
      </div>

      <DialogFooter className="flex-col-reverse sm:flex-row">
        <DialogClose asChild>
          <Button variant="outline">{t('Отмена')}</Button>
        </DialogClose>
        <Button
          variant="destructive"
          onClick={confirm}
          disabled={!target || busy}
        >
          <Trash2 size={14} />
          {busy ? t('Удаляем…') : t('Удалить')}
        </Button>
      </DialogFooter>
    </>
  )
}

function StateRow({
  state,
  index,
  groupSize,
  canEdit,
  blocker,
  dragging,
  dropMark,
  onEdit,
  onMakeDefault,
  onMove,
  onDelete,
  dragProps,
}: {
  state: State
  index: number
  groupSize: number
  canEdit: boolean
  blocker: string | null
  dragging: boolean
  dropMark: 'before' | 'after' | null
  onEdit: () => void
  onMakeDefault: () => void
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
  dragProps: LiHTMLAttributes<HTMLLIElement>
}) {
  const { t } = useTranslation()
  return (
    <li
      {...(canEdit ? dragProps : {})}
      draggable={canEdit && groupSize > 1}
      className={cn(
        'group relative flex min-h-11 items-center gap-2.5 px-3 py-2',
        canEdit && groupSize > 1 && 'sm:cursor-grab sm:active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      {dropMark && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary',
            dropMark === 'before' ? '-top-px' : '-bottom-px',
          )}
        />
      )}
      {canEdit && (
        <span
          className={cn(
            'hidden shrink-0 text-muted-foreground/60 sm:block',
            groupSize <= 1 && 'invisible',
          )}
          title={t('Перетащите, чтобы изменить порядок')}
        >
          <GripVertical aria-hidden size={14} />
        </span>
      )}
      <Dot color={state.color} />
      <span className="min-w-0 truncate text-sm text-foreground">
        {state.name}
      </span>
      {state.is_default && (
        <span
          className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          title={t('Новые задачи создаются в этом состоянии')}
        >
          {t('По умолчанию')}
        </span>
      )}

      {canEdit && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
          <button
            onClick={onEdit}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t('Изменить название и цвет')}
            aria-label={t('Изменить')}
          >
            <Pencil size={14} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={t('Действия с состоянием')}
                aria-label={t('Действия с состоянием')}
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil size={14} className="mr-2" />
                {t('Изменить название и цвет')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={state.is_default}
                onSelect={onMakeDefault}
              >
                <Star size={14} className="mr-2" />
                {state.is_default
                  ? t('Уже по умолчанию')
                  : t('Сделать по умолчанию')}
              </DropdownMenuItem>
              {groupSize > 1 && (
                <>
                  <DropdownMenuItem
                    disabled={index === 0}
                    onSelect={() => onMove(-1)}
                  >
                    <ArrowUp size={14} className="mr-2" />
                    {t('Переместить выше')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === groupSize - 1}
                    onSelect={() => onMove(1)}
                  >
                    <ArrowDown size={14} className="mr-2" />
                    {t('Переместить ниже')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={blocker !== null}
                onSelect={onDelete}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 size={14} className="mr-2" />
                {t('Удалить')}
              </DropdownMenuItem>
              {blocker && (
                <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                  {blocker}
                </p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  )
}

type FormTarget =
  { kind: 'edit'; id: string } | { kind: 'add'; group: StateGroup }

export function ProjectStatesPage() {
  const { t } = useTranslation()
  const { projectId } = useParams()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const slug = workspace?.slug

  const [states, setStates] = useState<State[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [form, setForm] = useState<FormTarget | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<State | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(
    null,
  )
  // Only the latest reorder may write its answer back (quick moves overlap).
  const orderRequest = useRef(0)

  useEffect(() => {
    if (!slug || !projectId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setFailed(false)
      // Editing is for owner/admin (ADR-031); the backend answers 403 to others.
      const [list, members] = await Promise.all([
        getStates(slug, projectId).catch(() => null),
        getWorkspaceMembers(slug).catch(() => []),
      ])
      if (cancelled) return
      const role = members.find((m) => m.user_id === currentUserId)?.role
      setCanEdit(role === 'owner' || role === 'admin')
      setStates(list ?? [])
      setFailed(list === null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [slug, projectId, currentUserId, reloadKey])

  const grouped = useMemo(() => groupStates(states), [states])
  const dragged = dragId ? states.find((s) => s.id === dragId) : undefined

  /** Lower-cased names of every state except `exceptId`. */
  function namesExcept(exceptId?: string): Set<string> {
    return new Set(
      states
        .filter((s) => s.id !== exceptId)
        .map((s) => s.name.trim().toLowerCase()),
    )
  }

  /** Show the new order at once and save it; on failure go back to `before`. */
  async function saveOrder(next: State[], before: State[]) {
    if (!slug || !projectId) return
    const mine = ++orderRequest.current
    setStates(next)
    try {
      const saved = await reorderStates(
        slug,
        projectId,
        next.map((s) => s.id),
      )
      if (mine === orderRequest.current) setStates(saved)
    } catch (err) {
      if (mine === orderRequest.current) setStates(before)
      toast.error(errorText(err, t('Не удалось изменить порядок состояний')))
    }
  }

  function moveTo(state: State, toIndex: number) {
    const list = grouped[state.group].filter((s) => s.id !== state.id)
    const from = grouped[state.group].findIndex((s) => s.id === state.id)
    if (from === toIndex || toIndex < 0 || toIndex > list.length) return
    list.splice(toIndex, 0, state)
    void saveOrder(flatten({ ...grouped, [state.group]: list }), states)
  }

  function drop(over: State, after: boolean) {
    if (!dragged || dragged.group !== over.group || dragged.id === over.id)
      return
    const list = grouped[over.group].filter((s) => s.id !== dragged.id)
    const at = list.findIndex((s) => s.id === over.id) + (after ? 1 : 0)
    moveTo(dragged, at)
  }

  function dragPropsFor(state: State): LiHTMLAttributes<HTMLLIElement> {
    return {
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = 'move'
        // Firefox starts a drag only when some data is set.
        e.dataTransfer.setData('text/plain', state.id)
        setDragId(state.id)
      },
      onDragOver: (e) => {
        // Not preventing default keeps other groups as "no drop" targets.
        if (!dragged || dragged.group !== state.group) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const after = e.clientY > rect.top + rect.height / 2
        if (dropAt?.id !== state.id || dropAt.after !== after)
          setDropAt({ id: state.id, after })
      },
      onDrop: (e) => {
        e.preventDefault()
        if (dropAt) drop(state, dropAt.after)
        setDragId(null)
        setDropAt(null)
      },
      onDragEnd: () => {
        setDragId(null)
        setDropAt(null)
      },
    }
  }

  /** Where a drop on this row would land, if it changes anything. */
  function dropMarkFor(state: State, index: number): 'before' | 'after' | null {
    if (
      !dragged ||
      !dropAt ||
      dropAt.id !== state.id ||
      dragged.id === state.id
    )
      return null
    const from = grouped[state.group].findIndex((s) => s.id === dragged.id)
    // Right above or below the dragged row: dropping there is a no-op.
    if (dropAt.after && index === from - 1) return null
    if (!dropAt.after && index === from + 1) return null
    return dropAt.after ? 'after' : 'before'
  }

  async function create(
    group: StateGroup,
    data: { name: string; color: string },
  ) {
    if (!slug || !projectId) return
    let created: State
    try {
      created = await createState(slug, projectId, { ...data, group })
    } catch (err) {
      toast.error(errorText(err, t('Не удалось добавить состояние')))
      throw err
    }
    setForm(null)
    toast.success(t('Состояние «{{name}}» добавлено', { name: created.name }))
    // A new state gets order 0; put it last in its group as the user expects.
    const next = flatten({ ...grouped, [group]: [...grouped[group], created] })
    await saveOrder(next, [...states, created])
  }

  async function save(state: State, data: { name: string; color: string }) {
    if (!slug || !projectId) return
    try {
      const updated = await updateState(slug, projectId, state.id, data)
      setStates((prev) =>
        prev.map((s) => (s.id === state.id ? { ...s, ...updated } : s)),
      )
      setForm(null)
      toast.success(t('Состояние сохранено'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить состояние')))
      throw err
    }
  }

  async function makeDefault(state: State) {
    if (!slug || !projectId) return
    try {
      const updated = await updateState(slug, projectId, state.id, {
        is_default: true,
      })
      // One default per project: the backend moved the mark here.
      setStates((prev) =>
        prev.map((s) =>
          s.id === state.id
            ? { ...s, ...updated }
            : { ...s, is_default: false },
        ),
      )
      toast.success(
        t('Новые задачи теперь создаются в состоянии «{{name}}»', {
          name: state.name,
        }),
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сделать состояние основным')))
    }
  }

  async function remove(state: State, transferTo: string) {
    if (!slug || !projectId) return
    try {
      await deleteState(slug, projectId, state.id, transferTo)
      const target = states.find((s) => s.id === transferTo)
      setStates((prev) => prev.filter((s) => s.id !== state.id))
      setDeleteOpen(false)
      toast.success(
        t('Состояние «{{name}}» удалено, задачи перенесены в «{{target}}»', {
          name: state.name,
          target: target?.name ?? '',
        }),
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить состояние')))
    }
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <CircleDot size={16} />
        {t('Состояния')}
      </div>

      <div className="max-w-3xl px-4 py-6 md:px-8">
        <p className="mb-4 text-sm text-muted-foreground">
          {t(
            'Состояния — это колонки доски задач. Они сгруппированы по этапам работы: по группе система понимает, что задача начата, сдана на проверку или закрыта.',
          )}
        </p>

        {!loading && !failed && !canEdit && (
          <p className="mb-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Lock size={13} className="shrink-0" />
            {t('Менять состояния могут администраторы пространства.')}
          </p>
        )}

        {loading ? (
          <div className="space-y-4">
            {[2, 1, 1].map((rows, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-border p-3"
              >
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-64 max-w-full" />
                {Array.from({ length: rows }).map((_, j) => (
                  <Skeleton key={j} className="h-9 w-full" />
                ))}
              </div>
            ))}
          </div>
        ) : failed ? (
          <EmptyState
            icon={CircleDot}
            title={t('Не удалось загрузить состояния')}
            description={t('Проверьте связь с сервером и попробуйте ещё раз.')}
            action={{
              label: t('Повторить'),
              onClick: () => setReloadKey((k) => k + 1),
            }}
          />
        ) : (
          <div className="space-y-4">
            {GROUP_ORDER.map((group) => {
              const list = grouped[group]
              const adding = form?.kind === 'add' && form.group === group
              return (
                <section
                  key={group}
                  aria-label={STATE_GROUPS[group].label()}
                  className="overflow-hidden rounded-lg border border-border bg-card"
                >
                  <header className="flex items-start gap-3 border-b border-border px-3 py-2.5">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ background: STATE_GROUPS[group].color }}
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold text-foreground">
                        {STATE_GROUPS[group].label()}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          {list.length}
                        </span>
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {GROUP_HINTS[group]()}
                      </p>
                    </div>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2 text-muted-foreground"
                        onClick={() => setForm({ kind: 'add', group })}
                        disabled={adding}
                      >
                        <Plus size={14} />
                        {t('Добавить')}
                      </Button>
                    )}
                  </header>

                  {list.length === 0 && !adding ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      {t('В группе нет состояний.')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {list.map((state, index) =>
                        form?.kind === 'edit' && form.id === state.id ? (
                          <li key={state.id}>
                            <StateForm
                              initialName={state.name}
                              initialColor={state.color}
                              submitLabel={t('Сохранить')}
                              takenNames={namesExcept(state.id)}
                              onSubmit={(data) => save(state, data)}
                              onCancel={() => setForm(null)}
                            />
                          </li>
                        ) : (
                          <StateRow
                            key={state.id}
                            state={state}
                            index={index}
                            groupSize={list.length}
                            canEdit={canEdit}
                            blocker={deleteBlocker(state, grouped)}
                            dragging={dragId === state.id}
                            dropMark={dropMarkFor(state, index)}
                            onEdit={() =>
                              setForm({ kind: 'edit', id: state.id })
                            }
                            onMakeDefault={() => makeDefault(state)}
                            onMove={(delta) => moveTo(state, index + delta)}
                            onDelete={() => {
                              setDeleteTarget(state)
                              setDeleteOpen(true)
                            }}
                            dragProps={dragPropsFor(state)}
                          />
                        ),
                      )}
                      {adding && (
                        <li>
                          <StateForm
                            initialName=""
                            initialColor={STATE_GROUPS[group].color}
                            submitLabel={t('Добавить')}
                            takenNames={namesExcept()}
                            onSubmit={(data) => create(group, data)}
                            onCancel={() => setForm(null)}
                          />
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>

      <DeleteStateDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        state={deleteTarget}
        states={states}
        onConfirm={(transferTo) =>
          deleteTarget ? remove(deleteTarget, transferTo) : Promise.resolve()
        }
      />
    </div>
  )
}
