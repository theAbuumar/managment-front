import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { CalendarRange, Check, Search, ShieldCheck, Star, UserCheck, Users } from 'lucide-react'
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
import { dateInputToIso } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'
import { createIssue, type Issue, type IssueKind, type IssuePriorityValue } from '@/api/issue'
import type { State } from '@/api/state'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'

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
function PriorityChip({ value, onChange }: { value: IssuePriorityValue; onChange: (v: IssuePriorityValue) => void }) {
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
function AssigneesChip({
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
function ControllerChip({ members, value, onChange }: { members: WorkspaceMember[]; value: string; onChange: (id: string) => void }) {
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
function DueDateChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

export function CreateIssueDialog({
  open,
  onOpenChange,
  slug,
  projectId,
  states,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  slug: string
  projectId: string
  states: State[]
  onCreated: (issue: Issue) => void
}) {
  const { t } = useTranslation()
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
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [busy, setBusy] = useState(false)

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
      const list = await getWorkspaceMembers(slug).catch(() => [])
      if (!cancelled) setMembers(list)
    })()
    return () => {
      cancelled = true
    }
  }, [open, slug, states, me])

  // The first chosen assignee is the primary one until changed explicitly.
  const effectivePrimary =
    primaryId && assigneeIds.includes(primaryId) ? primaryId : assigneeIds[0]

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
  }

  const isAssignment = kind === 'assignment'

  async function submit() {
    if (!title.trim() || !stateId || busy) return
    setBusy(true)
    try {
      const issue = await createIssue(slug, projectId, {
        title: title.trim(),
        state_id: stateId,
        priority,
        description: description.trim() || undefined,
        assignee_ids: assigneeIds.length ? assigneeIds : undefined,
        primary_assignee_id: effectivePrimary,
        due_date: dateInputToIso(due),
        kind,
        ...(isAssignment && {
          controller_id: controllerId || null,
          requires_review: requiresReview,
          basis: basis.trim() || null,
        }),
      })
      toast.success(isAssignment ? t('Поручение создано') : t('Задача создана'))
      onCreated(issue)
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
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isAssignment ? t('Новое поручение') : t('Новая задача')}</DialogTitle>
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
            <StateChip states={states} value={stateId} onChange={setStateId} />
            <PriorityChip value={priority} onChange={setPriority} />
            <AssigneesChip
              members={members}
              value={assigneeIds}
              primary={effectivePrimary}
              onChange={setAssigneeIds}
              onPrimary={setPrimaryId}
            />
            {isAssignment && <ControllerChip members={members} value={controllerId} onChange={setControllerId} />}
            <DueDateChip value={due} onChange={setDue} />
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
