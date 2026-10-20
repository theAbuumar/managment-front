import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { CalendarRange, CircleDot, Flag, Tag, UserCheck, X } from 'lucide-react'
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
  onDone,
  onClear,
}: {
  slug: string
  projectId: string
  selected: string[]
  states: State[]
  members: WorkspaceMember[]
  labels: Label[]
  /** After a change: re-read the issues; keep only the failed ones selected. */
  onDone: (result: BulkResult) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [due, setDue] = useState('')
  const [dueOpen, setDueOpen] = useState(false)
  const assignable = members.filter((m) => m.role !== 'guest' && !m.deactivated_at)

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
