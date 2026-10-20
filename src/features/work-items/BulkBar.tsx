import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { CalendarRange, CircleDot, Flag, Layers, RefreshCw, Tag, UserCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { cn } from '@/lib/utils'
import { pluralize } from '@/lib/plural'
import { dateInputToIso } from '@/lib/dates'
import { errorText, getFriendlyMessage } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import {
  bulkUpdateIssues,
  type BulkBody,
  type BulkResult,
  type IssuePriorityValue,
} from '@/api/issue'
import type { State } from '@/api/state'
import type { Label } from '@/api/label'
import type { WorkspaceMember } from '@/api/workspace'
import { CYCLE_STATUSES, type Cycle } from '@/api/cycle'
import { MODULE_STATUSES, type Module } from '@/api/module'
import {
  addIssuesToScope,
  addedText,
  dateRange,
  scopeEnd,
  type Scope,
  type ScopeKind,
} from '@/features/cycles/scopes'

// Массовые действия (Ф6 6.F6): one change for the selected issues of the list.
// The server checks each issue by the regular rules, so the answer may be partial
// («Изменено 8 из 10»); what was not changed stays selected, with the reasons.

const PRIORITIES: IssuePriorityValue[] = ['urgent', 'high', 'medium', 'low', 'none']

const btnCls =
  'flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50 data-[state=open]:bg-accent'

export function BulkBar({
  slug,
  projectId,
  selected,
  states,
  members,
  labels,
  cycles = [],
  modules = [],
  onDone,
  onClear,
}: {
  slug: string
  projectId: string
  selected: string[]
  states: State[]
  members: WorkspaceMember[]
  labels: Label[]
  /** «В этап…» / «В модуль…» (4.F3, 4.F4) appear when the project has any. */
  cycles?: Cycle[]
  modules?: Module[]
  /** After a change: re-read the issues; keep only the failed ones selected. */
  onDone: (result: BulkResult) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [due, setDue] = useState('')
  const [dueOpen, setDueOpen] = useState(false)
  const assignable = members.filter((m) => m.role !== 'guest' && !m.deactivated_at)
  // Running and coming first; finished ones are still offered, last.
  const cycleOrder = { active: 0, upcoming: 1, completed: 2 }
  const cycleList = [...cycles].sort((a, b) => cycleOrder[a.status] - cycleOrder[b.status])
  const moduleOrder = { in_progress: 0, backlog: 1, paused: 2, completed: 3, cancelled: 4 }
  const moduleList = [...modules].sort((a, b) => moduleOrder[a.status] - moduleOrder[b.status])

  // Joining a cycle or module is all or nothing (one request), unlike the bulk
  // endpoint: on success every selected issue is in it, so nothing stays selected.
  async function addTo(kind: ScopeKind, scope: Scope) {
    if (busy || selected.length === 0) return
    setBusy(true)
    try {
      const added = await addIssuesToScope(kind, slug, projectId, scope.id, selected)
      toast.success(addedText(kind, scope.name, added))
      onDone({ updated: [...selected], failed: [] })
    } catch (err) {
      toast.error(errorText(err, t('Не удалось добавить задачи')))
    } finally {
      setBusy(false)
    }
  }

  async function apply(change: Omit<BulkBody, 'issue_ids'>) {
    if (busy || selected.length === 0) return
    setBusy(true)
    try {
      const result = await bulkUpdateIssues(slug, projectId, { issue_ids: selected, ...change })
      const total = selected.length
      if (result.failed.length === 0) {
        toast.success(
          t('Изменено: {{n}}', {
            n: pluralize(result.updated.length, [t('задача'), t('задачи'), t('задач')]),
          }),
        )
      } else {
        // The reasons, one line per kind: «2 — поручение закрывает только контролёр».
        const byCode = new Map<string, number>()
        for (const f of result.failed) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1)
        toast.warning(t('Изменено {{n}} из {{total}}', { n: result.updated.length, total }), {
          description: [...byCode]
            .map(([code, n]) => `${n} — ${getFriendlyMessage(code)}`)
            .join('\n'),
          duration: 10_000,
        })
      }
      onDone(result)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось изменить задачи')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={t('Действия с выбранными задачами')}
      className="absolute inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <span className="mr-1 shrink-0 text-sm font-medium" aria-live="polite">
          {t('Выбрано: {{n}}', { n: selected.length })}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={btnCls} disabled={busy}>
              <CircleDot size={13} />
              {t('Состояние')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {states.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => apply({ state_id: s.id })}>
                <span className="mr-2 size-2.5 rounded-full" style={{ background: s.color }} />
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={btnCls} disabled={busy}>
              <Flag size={13} />
              {t('Приоритет')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {PRIORITIES.map((p) => {
              const meta = PRIORITY_CONFIG[p]
              const Icon = meta.icon
              return (
                <DropdownMenuItem key={p} onClick={() => apply({ priority: p })}>
                  <Icon size={14} className={cn('mr-2', meta.iconColor)} />
                  {meta.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={btnCls} disabled={busy}>
              <UserCheck size={13} />
              {t('Исполнитель')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t('Станет единственным исполнителем')}
            </DropdownMenuLabel>
            {assignable.map((m) => (
              <DropdownMenuItem
                key={m.user_id}
                onClick={() => apply({ assignee_id: m.user_id })}
              >
                <PersonAvatar person={{ ...m.user, id: m.user_id }} size={20} />
                <span className="ml-2 truncate">{shortName(m.user)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <PopoverPrimitive.Root open={dueOpen} onOpenChange={setDueOpen}>
          <PopoverPrimitive.Trigger asChild>
            <button type="button" className={btnCls} disabled={busy}>
              <CalendarRange size={13} />
              {t('Срок')}
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              side="top"
              align="start"
              sideOffset={6}
              className="z-50 w-60 rounded-md border border-border bg-popover p-3 shadow-md"
            >
              <label className="text-xs text-muted-foreground">
                {t('Новый срок для выбранных')}
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!due}
                  onClick={() => {
                    setDueOpen(false)
                    void apply({ due_date: dateInputToIso(due) })
                  }}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  {t('Установить')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDueOpen(false)
                    void apply({ due_date: null })
                  }}
                  className="text-xs text-destructive hover:underline"
                >
                  {t('Убрать срок')}
                </button>
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>

        {labels.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={btnCls} disabled={busy}>
                <Tag size={13} />
                {t('Метка')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('Добавить')}
              </DropdownMenuLabel>
              {labels.map((l) => (
                <DropdownMenuItem key={`add-${l.id}`} onClick={() => apply({ add_label_id: l.id })}>
                  <span className="mr-2 size-2.5 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('Снять')}
              </DropdownMenuLabel>
              {labels.map((l) => (
                <DropdownMenuItem
                  key={`remove-${l.id}`}
                  onClick={() => apply({ remove_label_id: l.id })}
                >
                  <span className="mr-2 size-2.5 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {cycleList.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={btnCls} disabled={busy}>
                <RefreshCw size={13} />
                {t('В этап…')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('Задачи из другого этапа перейдут в выбранный')}
              </DropdownMenuLabel>
              {cycleList.map((c) => (
                <ScopeItem
                  key={c.id}
                  scope={c}
                  color={CYCLE_STATUSES[c.status].color}
                  onClick={() => addTo('cycle', c)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {moduleList.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={btnCls} disabled={busy}>
                <Layers size={13} />
                {t('В модуль…')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('Добавить в модуль')}
              </DropdownMenuLabel>
              {moduleList.map((m) => (
                <ScopeItem
                  key={m.id}
                  scope={m}
                  color={MODULE_STATUSES[m.status].color}
                  onClick={() => addTo('module', m)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <button
          type="button"
          onClick={onClear}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={13} />
          {t('Снять выделение')}
        </button>
      </div>
    </div>
  )
}

/** A cycle or module in the menu: status dot, name, dates. */
function ScopeItem({ scope, color, onClick }: { scope: Scope; color: string; onClick: () => void }) {
  const range = dateRange(scope.start_date, scopeEnd(scope))
  return (
    <DropdownMenuItem onClick={onClick}>
      <span className="mr-2 size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate">{scope.name}</span>
      {range && <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">{range}</span>}
    </DropdownMenuItem>
  )
}
