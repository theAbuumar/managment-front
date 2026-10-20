import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { CalendarRange, Check, CloudCheck, FileStack, ListChecks, Repeat, Search, ShieldCheck, Sparkles, Star, UserCheck, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAiEnabled } from '@/stores/aiStore'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { shortName, fullName } from '@/lib/people'
import { dateInputToIso, isoToDateInput } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'
import { createIssue, type Issue, type IssueKind, type IssuePriorityValue } from '@/api/issue'
import type { State } from '@/api/state'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { createDraft, deleteDraft, getDraft, updateDraft, type DraftData } from '@/api/drafts'
import { getTemplates, type IssueTemplate } from '@/api/templates'
import { createRecurringRule, type Schedule } from '@/api/recurring'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { plural } from '@/lib/plural'
import { ChecklistEditor } from '@/features/templates/ChecklistEditor'
import { RepeatFields } from '@/features/templates/RepeatFields'
import {
  addDays,
  dayLabel,
  defaultSchedule,
  describeSchedule,
  occurrenceOnOrAfter,
  todayIn,
} from '@/features/templates/recurrence'

const PRIORITIES: IssuePriorityValue[] = ['urgent', 'high', 'medium', 'low', 'none']

const chipCls =
  'flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent focus:outline-none data-[state=open]:bg-accent'
const popCls =
  'z-50 w-64 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'
const optionCls =
  'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

function PopContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align="start" sideOffset={6} className={cn(popCls, className)}>
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="mb-1 flex items-center gap-2 border-b border-border px-2 pb-2">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('Поиск по ФИО или должности…')}
        className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

function matches(m: WorkspaceMember, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [fullName(m.user), m.user.display_name, m.position ?? '', m.department?.name ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

function MemberOption({ m, selected, onClick, extra }: { m: WorkspaceMember; selected: boolean; onClick: () => void; extra?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={optionCls}>
      <PersonAvatar person={{ ...m.user, id: m.user_id }} size={22} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate">{shortName(m.user)}</span>
        {m.position && <span className="block truncate text-xs text-muted-foreground">{m.position}</span>}
      </span>
      {extra}
      {selected && <Check className="size-3.5 shrink-0" />}
    </button>
  )
}

// --- State chip (project workflow states) ---------------------------------
function StateChip({ states, value, onChange }: { states: State[]; value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation()
  const current = states.find((s) => s.id === value)
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className={cn(chipCls, 'text-foreground')}>
          <span className="size-3 rounded-full" style={{ background: current?.color ?? '#94a3b8' }} />
          {current?.name ?? t('Состояние')}
        </button>
      </PopoverPrimitive.Trigger>
      <PopContent>
        {states.map((s) => (
          <PopoverPrimitive.Close asChild key={s.id}>
            <button type="button" onClick={() => onChange(s.id)} className={optionCls}>
              <span className="size-3 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 text-left">{s.name}</span>
              {value === s.id && <Check className="size-3.5" />}
            </button>
          </PopoverPrimitive.Close>
        ))}
      </PopContent>
    </PopoverPrimitive.Root>
  )
}

// --- Priority chip ---------------------------------------------------------
export function PriorityChip({ value, onChange }: { value: IssuePriorityValue; onChange: (v: IssuePriorityValue) => void }) {
  const current = PRIORITY_CONFIG[value]
  const CurIcon = current.icon
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className={cn(chipCls, 'text-foreground')}>
          <CurIcon size={13} className={current.iconColor} />
          {current.label}
        </button>
      </PopoverPrimitive.Trigger>
      <PopContent>
        {PRIORITIES.map((p) => {
          const meta = PRIORITY_CONFIG[p]
          const Icon = meta.icon
          return (
            <PopoverPrimitive.Close asChild key={p}>
              <button type="button" onClick={() => onChange(p)} className={optionCls}>
                <Icon size={15} className={meta.iconColor} />
                <span className="flex-1 text-left">{meta.label}</span>
                {value === p && <Check className="size-3.5" />}
              </button>
            </PopoverPrimitive.Close>
          )
        })}
      </PopContent>
    </PopoverPrimitive.Root>
  )
}

// --- Assignees chip (multi; first = ответственный) -------------------------
export function AssigneesChip({
  members,
  value,
  primary,
  onChange,
  onPrimary,
}: {
  members: WorkspaceMember[]
  value: string[]
  primary: string | undefined
  onChange: (ids: string[]) => void
  onPrimary: (id: string) => void
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const filtered = members.filter((m) => matches(m, q))
  const primaryMember = members.find((m) => m.user_id === primary)
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }
  return (
    <PopoverPrimitive.Root onOpenChange={() => setQ('')}>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className={cn(chipCls, value.length && 'text-foreground')}>
          <Users size={13} />
          {value.length === 0
            ? t('Исполнители')
            : value.length === 1
              ? shortName(primaryMember?.user)
              : t('{{name}} и ещё {{n}}', { name: shortName(primaryMember?.user), n: value.length - 1 })}
        </button>
      </PopoverPrimitive.Trigger>
      <PopContent className="w-72">
        <SearchBox value={q} onChange={setQ} />
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground">{t('Никого не найдено.')}</p>
          )}
          {filtered.map((m) => {
            const selected = value.includes(m.user_id)
            const isPrimary = primary === m.user_id
            return (
              <MemberOption
                key={m.user_id}
                m={m}
                selected={selected}
                onClick={() => toggle(m.user_id)}
                extra={
                  selected && (
                    <span
                      role="button"
                      title={isPrimary ? t('Ответственный исполнитель') : t('Сделать ответственным')}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPrimary(m.user_id)
                      }}
                      className={cn('rounded p-0.5', isPrimary ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500')}
                    >
                      <Star size={13} fill={isPrimary ? 'currentColor' : 'none'} />
                    </span>
                  )
                }
              />
            )
          })}
        </div>
        {value.length > 1 && (
          <p className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
            {t('★ — ответственный исполнитель, остальные — соисполнители.')}
          </p>
        )}
      </PopContent>
    </PopoverPrimitive.Root>
  )
}

// --- Controller chip (single) ----------------------------------------------
export function ControllerChip({ members, value, onChange }: { members: WorkspaceMember[]; value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const current = members.find((m) => m.user_id === value)
  return (
    <PopoverPrimitive.Root onOpenChange={() => setQ('')}>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className={cn(chipCls, value && 'text-foreground')}>
          <UserCheck size={13} />
          {current ? t('Контролёр: {{name}}', { name: shortName(current.user) }) : t('Контролёр')}
        </button>
      </PopoverPrimitive.Trigger>
      <PopContent className="w-72">
        <SearchBox value={q} onChange={setQ} />
        <div className="max-h-64 overflow-y-auto">
          {members.filter((m) => matches(m, q)).map((m) => (
            <PopoverPrimitive.Close asChild key={m.user_id}>
              <span>
                <MemberOption m={m} selected={value === m.user_id} onClick={() => onChange(m.user_id)} />
              </span>
            </PopoverPrimitive.Close>
          ))}
        </div>
      </PopContent>
    </PopoverPrimitive.Root>
  )
}

// --- Due date chip ---------------------------------------------------------
export function DueDateChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  const label = value
    ? new Date(`${value}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : t('Срок')
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className={cn(chipCls, value && 'text-foreground')}>
          <CalendarRange size={13} />
          {label}
        </button>
      </PopoverPrimitive.Trigger>
      <PopContent className="w-56 p-3">
        <label className="text-xs text-muted-foreground">
          {t('Срок исполнения')}
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        {value && (
          <button type="button" onClick={() => onChange('')} className="mt-2 text-xs text-destructive hover:underline">
            {t('Очистить')}
          </button>
        )}
      </PopContent>
    </PopoverPrimitive.Root>
  )
}

// --- Checklist chip (6.F5): the steps typed or taken from a template --------
function ChecklistChip({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className={cn(chipCls, value.length > 0 && 'text-foreground')}>
          <ListChecks size={13} />
          {value.length > 0 ? t('Чек-лист · {{n}}', { n: value.length }) : t('Чек-лист')}
        </button>
      </PopoverPrimitive.Trigger>
      <PopContent className="max-h-80 w-80 overflow-y-auto p-2">
        <ChecklistEditor value={value} onChange={onChange} />
      </PopContent>
    </PopoverPrimitive.Root>
  )
}

// --- Template picker (6.F3): fills the form; the person checks and creates ----
function TemplatePicker({
  templates,
  onPick,
}: {
  templates: IssueTemplate[]
  onPick: (template: IssueTemplate) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const groups = [
    { title: t('Шаблоны пространства'), items: templates.filter((x) => !x.project_id) },
    { title: t('Шаблоны проекта'), items: templates.filter((x) => x.project_id) },
  ].filter((g) => g.items.length > 0)
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t('Заполнить форму по шаблону')}
        >
          <FileStack size={13} />
          {t('Шаблон')}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className={cn(popCls, 'max-h-80 w-80 overflow-y-auto')}
        >
          {groups.map((g) => (
            <div key={g.title} className="py-1">
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {g.title}
              </p>
              {g.items.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    onPick(tpl)
                    setOpen(false)
                  }}
                  className={cn(optionCls, 'flex-col items-start gap-0.5')}
                >
                  <span className="w-full truncate text-left">{tpl.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {[
                      tpl.data.kind === 'assignment' ? t('поручение') : t('задача'),
                      tpl.due_in_days !== null && t('срок {{n}} дн.', { n: tpl.due_in_days }),
                      tpl.data.checklist?.length &&
                        t('чек-лист {{n}} {{unit}}', {
                          n: tpl.data.checklist.length,
                          unit: plural(tpl.data.checklist.length, [t('пункт'), t('пункта'), t('пунктов')]),
                        }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  slug,
  projectId,
  states,
  onCreated,
  draftId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  slug: string
  projectId: string
  states: State[]
  onCreated: (issue: Issue) => void
  /** Continue this draft (7.F6, «Черновики» → «Продолжить»). */
  draftId?: string | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const aiEnabled = useAiEnabled()
  const me = useAuthStore((s) => s.user?.id)
  const [kind, setKind] = useState<IssueKind>('assignment')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [basis, setBasis] = useState('')
  const [stateId, setStateId] = useState('')
  const [priority, setPriority] = useState<IssuePriorityValue>('none')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [primaryId, setPrimaryId] = useState<string | undefined>()
  const [controllerId, setControllerId] = useState('')
  const [requiresReview, setRequiresReview] = useState(true)
  const [due, setDue] = useState('')
  // Ф6: a checklist, labels and the template the form was filled from; «Повторять».
  const [checklist, setChecklist] = useState<string[]>([])
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [templates, setTemplates] = useState<IssueTemplate[]>([])
  const timeZone =
    useWorkspaceStore((s) => s.workspace?.timezone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = todayIn(timeZone)
  const [repeat, setRepeat] = useState(false)
  const [schedule, setSchedule] = useState<Schedule>(() => defaultSchedule(today))
  const [dueInDays, setDueInDays] = useState('5')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [busy, setBusy] = useState(false)
  // Drafts (7.F6): the form saves itself while typed; saves run one at a time,
  // in order — the first creates the draft, the next ones update it.
  const draftRef = useRef<string | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Default the state to "К выполнению" (or the project default / first column),
  // the controller to the author, and load members for the pickers.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const fallback =
        states.find((s) => s.is_default) ?? states.find((s) => s.group === 'unstarted') ?? states[0]
      setStateId((prev) => prev || fallback?.id || '')
      setControllerId((prev) => prev || me || '')
      const [list, tpls] = await Promise.all([
        getWorkspaceMembers(slug).catch(() => []),
        getTemplates(slug, projectId).catch(() => ({ data: [] })),
      ])
      if (cancelled) return
      setMembers(list)
      setTemplates(tpls.data)
    })()
    return () => {
      cancelled = true
    }
  }, [open, slug, projectId, states, me])

  // The first chosen assignee is the primary one until changed explicitly.
  const effectivePrimary =
    primaryId && assigneeIds.includes(primaryId) ? primaryId : assigneeIds[0]

  // Continue a draft: its fields over the defaults.
  useEffect(() => {
    if (!open || !draftId) return
    let cancelled = false
    ;(async () => {
      try {
        const draft = await getDraft(slug, draftId)
        if (cancelled) return
        draftRef.current = draft.id
        const d = draft.data
        if (d.kind) setKind(d.kind)
        setTitle(d.title ?? '')
        setDescription(d.description ?? '')
        setBasis(d.basis ?? '')
        if (d.state_id) setStateId(d.state_id)
        if (d.priority) setPriority(d.priority)
        setAssigneeIds(d.assignee_ids ?? [])
        setPrimaryId(d.primary_assignee_id)
        if (d.controller_id) setControllerId(d.controller_id)
        if (d.requires_review !== undefined) setRequiresReview(d.requires_review)
        setDue(isoToDateInput(d.due_date))
        setChecklist(d.checklist ?? [])
        setDraftState('saved')
      } catch {
        if (!cancelled) toast.error(t('Черновик не найден — возможно, он уже опубликован'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, draftId, slug, t])

  const hasContent = Boolean(title.trim() || description.trim() || basis.trim())
  const draftData: DraftData = {
    kind,
    title,
    description,
    basis: basis || null,
    state_id: stateId || undefined,
    priority,
    assignee_ids: assigneeIds,
    primary_assignee_id: effectivePrimary,
    controller_id: kind === 'assignment' ? controllerId || null : null,
    requires_review: requiresReview,
    due_date: dateInputToIso(due),
    checklist,
  }
  const serialized = JSON.stringify(draftData)

  /** Resolves to whether the draft was saved. */
  function saveDraft(data: DraftData): Promise<boolean> {
    const run = queue.current.then(async () => {
      setDraftState('saving')
      try {
        if (draftRef.current) await updateDraft(slug, draftRef.current, { data })
        else draftRef.current = (await createDraft(slug, { project_id: projectId, data })).id
        setDraftState('saved')
        return true
      } catch {
        // The form keeps the text; the next change tries again.
        setDraftState('idle')
        return false
      }
    })
    queue.current = run
    return run
  }

  // Save a moment after typing stops.
  useEffect(() => {
    if (!open || !hasContent || busy) return
    const timer = setTimeout(() => void saveDraft(JSON.parse(serialized) as DraftData), 1200)
    return () => clearTimeout(timer)
    // saveDraft reads refs only; `serialized` carries every field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasContent, serialized, busy])

  /** Forget the current draft once the queued saves are done (and delete it, if asked). */
  function dropDraft(remove: boolean) {
    queue.current = queue.current.then(async () => {
      const id = draftRef.current
      draftRef.current = null
      if (remove && id) await deleteDraft(slug, id).catch(() => undefined)
    })
  }

  // Closing without creating keeps what was typed as a draft; an emptied form
  // leaves nothing behind.
  function close() {
    if (hasContent) {
      void saveDraft(draftData).then(
        (saved) =>
          saved &&
          toast.success(t('Черновик сохранён'), {
            description: t('Продолжить можно в разделе «Черновики».'),
            action: { label: t('Черновики'), onClick: () => navigate('/drafts') },
          }),
      )
      dropDraft(false)
    } else {
      dropDraft(true)
    }
    reset()
    onOpenChange(false)
  }

  function reset() {
    setKind('assignment')
    setTitle('')
    setDescription('')
    setBasis('')
    setStateId('')
    setPriority('none')
    setAssigneeIds([])
    setPrimaryId(undefined)
    setControllerId('')
    setRequiresReview(true)
    setDue('')
    setChecklist([])
    setLabelIds([])
    setRepeat(false)
    setSchedule(defaultSchedule(today))
    setDueInDays('5')
    setDraftState('idle')
  }

  /** Fill the form from a template; what was typed in the title stays if the template has none. */
  function applyTemplate(tpl: IssueTemplate) {
    const d = tpl.data
    setKind(d.kind ?? 'task')
    setTitle(d.title)
    setDescription(d.description ?? '')
    setBasis(d.basis ?? '')
    setPriority(d.priority ?? 'none')
    setAssigneeIds(d.assignee_ids ?? [])
    setPrimaryId(d.primary_assignee_id)
    if (d.controller_id) setControllerId(d.controller_id)
    setRequiresReview(d.requires_review ?? d.kind === 'assignment')
    setLabelIds(d.label_ids ?? [])
    setChecklist(d.checklist ?? [])
    setDue(tpl.due_in_days === null ? '' : addDays(today, tpl.due_in_days))
    setDueInDays(tpl.due_in_days === null ? '' : String(tpl.due_in_days))
    toast.success(t('Форма заполнена по шаблону «{{name}}»', { name: tpl.name }))
  }

  const nextRun = repeat ? occurrenceOnOrAfter(schedule, addDays(today, 1)) : null

  const isAssignment = kind === 'assignment'

  async function submit() {
    if (!title.trim() || !stateId || busy) return
    setBusy(true)
    try {
      if (repeat) {
        // «Повторять» (6.F4): the first issue now, the rule for the next ones.
        const days = dueInDays.trim() === '' ? null : Math.min(365, Math.max(0, Number(dueInDays) || 0))
        const rule = await createRecurringRule(slug, projectId, {
          ...schedule,
          due_in_days: days,
          create_now: true,
          data: {
            title: title.trim(),
            description: description.trim() || undefined,
            kind,
            priority,
            assignee_ids: assigneeIds,
            primary_assignee_id: effectivePrimary,
            label_ids: labelIds,
            checklist,
            ...(isAssignment && {
              controller_id: controllerId || null,
              requires_review: requiresReview,
              basis: basis.trim() || null,
            }),
          },
        })
        toast.success(
          isAssignment ? t('Поручение создано и будет повторяться') : t('Задача создана и будет повторяться'),
          { description: describeSchedule(schedule) },
        )
        if (rule.created_issue) onCreated(rule.created_issue)
        dropDraft(true)
        reset()
        onOpenChange(false)
        return
      }
      const issue = await createIssue(slug, projectId, {
        title: title.trim(),
        state_id: stateId,
        priority,
        description: description.trim() || undefined,
        assignee_ids: assigneeIds.length ? assigneeIds : undefined,
        primary_assignee_id: effectivePrimary,
        due_date: dateInputToIso(due),
        kind,
        ...(labelIds.length > 0 && { label_ids: labelIds }),
        ...(checklist.length > 0 && { checklist }),
        ...(isAssignment && {
          controller_id: controllerId || null,
          requires_review: requiresReview,
          basis: basis.trim() || null,
        }),
      })
      toast.success(isAssignment ? t('Поручение создано') : t('Задача создана'))
      onCreated(issue)
      // Created: the draft has done its job.
      dropDraft(true)
      reset()
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось создать задачу')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close()
        else onOpenChange(v)
      }}
    >
      {/* Tall with «Повторять» on: scrolls inside the screen on a phone. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader className="flex-row items-center gap-2 space-y-0 pr-8">
          <DialogTitle>{isAssignment ? t('Новое поручение') : t('Новая задача')}</DialogTitle>
          {/* No templates — no button (ADR-019). */}
          {templates.length > 0 && (
            <span className="ml-auto">
              <TemplatePicker templates={templates} onPick={applyTemplate} />
            </span>
          )}
          {/* Ф11 11.F2: many assignments at once from a protocol or a text. */}
          {aiEnabled && (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                navigate(`/ai/drafts?project=${projectId}`)
              }}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/10 dark:text-violet-300',
                templates.length === 0 && 'ml-auto',
              )}
              title={t('AI найдёт поручения в протоколе или тексте и подготовит черновики')}
            >
              <Sparkles size={13} />
              {t('Из текста или протокола')}
            </button>
          )}
        </DialogHeader>

        {/* Kind */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { k: 'assignment', label: t('Поручение'), hint: t('с контролёром и проверкой результата') },
              { k: 'task', label: t('Задача'), hint: t('обычная рабочая задача') },
            ] as const
          ).map(({ k, label, hint }) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-left transition-colors',
                kind === k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {k === 'assignment' && <ShieldCheck size={14} className="text-primary" />}
                {label}
              </span>
              <span className="block text-[11px] text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            placeholder={isAssignment ? t('Что поручается?') : t('Название задачи')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
          />
          <Textarea
            placeholder={t('Описание, требования к результату (необязательно)')}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {isAssignment && (
            <Input
              placeholder={t('Основание: например, «Протокол ректората №5 от 12.10.2026»')}
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            />
          )}

          <div className="flex flex-wrap gap-1.5">
            {/* A repeated issue starts in the project's default state. */}
            {!repeat && <StateChip states={states} value={stateId} onChange={setStateId} />}
            <PriorityChip value={priority} onChange={setPriority} />
            <AssigneesChip
              members={members}
              value={assigneeIds}
              primary={effectivePrimary}
              onChange={setAssigneeIds}
              onPrimary={setPrimaryId}
            />
            {isAssignment && <ControllerChip members={members} value={controllerId} onChange={setControllerId} />}
            {!repeat && <DueDateChip value={due} onChange={setDue} />}
            <ChecklistChip value={checklist} onChange={setChecklist} />
          </div>

          {isAssignment && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span>
                <span className="block text-sm font-medium">{t('Требует проверки результата')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('Исполнитель сдаёт отчёт, контролёр принимает или возвращает на доработку.')}
                </span>
              </span>
              <Switch checked={requiresReview} onCheckedChange={setRequiresReview} />
            </label>
          )}

          {/* Ф6 6.F4: a report that creates itself on schedule. */}
          <div className="rounded-md border border-border">
            <label className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Repeat size={14} className="text-muted-foreground" />
                  {t('Повторять')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t('Первая задача создаётся сейчас, следующие — сами по расписанию.')}
                </span>
              </span>
              <Switch checked={repeat} onCheckedChange={setRepeat} aria-label={t('Повторять')} />
            </label>
            {repeat && (
              <div className="flex flex-col gap-2.5 border-t border-border px-3 py-2.5">
                <RepeatFields
                  value={schedule}
                  onChange={setSchedule}
                  next={
                    nextRun
                      ? t('следующая — {{date}}', { date: dayLabel(nextRun) })
                      : t('следующих не будет: дата окончания уже прошла')
                  }
                />
                <label className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {t('Срок исполнения — через')}
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={dueInDays}
                    onChange={(e) => setDueInDays(e.target.value)}
                    placeholder="—"
                    className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    aria-label={t('Срок исполнения в днях')}
                  />
                  {t('дн. после создания')}
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {draftState !== 'idle' && (
            <span
              className="flex items-center gap-1.5 self-center text-xs text-muted-foreground sm:mr-auto"
              role="status"
            >
              {draftState === 'saved' && <CloudCheck size={14} />}
              {draftState === 'saving' ? t('Сохраняем черновик…') : t('Черновик сохранён')}
            </span>
          )}
          <Button variant="outline" onClick={close}>
            {t('Отмена')}
          </Button>
          <Button onClick={submit} disabled={busy || !title.trim() || !stateId}>
            {busy ? t('Создаём…') : isAssignment ? t('Создать поручение') : t('Создать задачу')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
