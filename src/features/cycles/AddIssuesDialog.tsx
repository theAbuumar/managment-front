import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Cycle } from '@/api/cycle'
import type { Issue } from '@/api/issue'
import type { State } from '@/api/state'
import { errorText } from '@/lib/errorMessages'
import { cn } from '@/lib/utils'
import {
  addIssuesToScope,
  addedText,
  inScope,
  type Scope,
  type ScopeKind,
} from './scopes'

/**
 * «Добавить задачи» of the board's banner: a searchable checklist of the
 * project's issues that are not in this cycle or module yet, added in one
 * request. Open issues come first; a cycle names the one an issue leaves.
 */
export function AddIssuesDialog({
  kind,
  scope,
  open,
  onOpenChange,
  slug,
  projectId,
  identifier,
  issues,
  states,
  cycles,
  onAdded,
}: {
  kind: ScopeKind
  scope: Scope
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  projectId: string
  /** Project key for «ACCR-12». */
  identifier: string
  /** Every issue of the project loaded on the board. */
  issues: Issue[]
  states: State[]
  /** Names of the cycles issues may leave. */
  cycles: Cycle[]
  onAdded: (issueIds: string[]) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const isCycle = kind === 'cycle'

  const stateOf = (issue: Issue) =>
    states.find((s) => s.id === issue.state_id) ?? issue.state
  const candidates = useMemo(() => {
    const groupOf = (issue: Issue) =>
      (states.find((s) => s.id === issue.state_id) ?? issue.state)?.group
    const closed = (issue: Issue) => {
      const g = groupOf(issue)
      return g === 'completed' || g === 'cancelled'
    }
    // Issues of no cycle before those another cycle would lose.
    const elsewhere = (issue: Issue) => kind === 'cycle' && !!issue.cycle_id
    return issues
      .filter((i) => !inScope(i, kind, scope.id))
      .sort(
        (a, b) =>
          Number(closed(a)) - Number(closed(b)) ||
          Number(elsewhere(a)) - Number(elsewhere(b)) ||
          b.sequence_id - a.sequence_id,
      )
  }, [issues, states, kind, scope.id])

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? candidates.filter(
        (i) =>
          i.title.toLowerCase().includes(needle) ||
          `${identifier}-${i.sequence_id}`.toLowerCase().includes(needle) ||
          String(i.sequence_id) === needle.replace(/^#/, ''),
      )
    : candidates
  const allShownPicked =
    shown.length > 0 && shown.every((i) => picked.has(i.id))

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleShown() {
    setPicked((prev) => {
      const next = new Set(prev)
      for (const i of shown) {
        if (allShownPicked) next.delete(i.id)
        else next.add(i.id)
      }
      return next
    })
  }

  async function submit() {
    // Only what is still a candidate (the board may have changed meanwhile).
    const ids = candidates.filter((i) => picked.has(i.id)).map((i) => i.id)
    if (ids.length === 0 || busy) return
    setBusy(true)
    try {
      const added = await addIssuesToScope(kind, slug, projectId, scope.id, ids)
      onAdded(ids)
      onOpenChange(false)
      toast.success(addedText(kind, scope.name, added))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось добавить задачи')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle className="pr-6">
            {isCycle
              ? t('Добавить задачи в этап «{{name}}»', { name: scope.name })
              : t('Добавить задачи в модуль «{{name}}»', { name: scope.name })}
          </DialogTitle>
          <DialogDescription>
            {isCycle
              ? t(
                  'Задача бывает только в одном этапе: из другого этапа она перейдёт в этот.',
                )
              : t('Задача может входить в несколько модулей сразу.')}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Поиск по названию или номеру')}
            aria-label={t('Поиск задач')}
            className="pl-8"
          />
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-md border border-border">
          {shown.length > 0 && (
            <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={allShownPicked}
                onChange={toggleShown}
                className="size-4 shrink-0 accent-primary"
              />
              {needle
                ? t('Все найденные: {{n}}', { n: shown.length })
                : t('Все задачи: {{n}}', { n: shown.length })}
            </label>
          )}
          <ul className="max-h-[min(22rem,45dvh)] divide-y divide-border overflow-y-auto">
            {shown.map((issue) => {
              const state = stateOf(issue)
              const closed =
                state?.group === 'completed' || state?.group === 'cancelled'
              const from =
                isCycle && issue.cycle_id
                  ? cycles.find((c) => c.id === issue.cycle_id)?.name
                  : undefined
              return (
                <li key={issue.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 px-3 py-2 transition-colors hover:bg-muted/60',
                      picked.has(issue.id) && 'bg-primary/5',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(issue.id)}
                      onChange={() => toggle(issue.id)}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: state?.color }}
                          title={state?.name}
                        />
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {identifier}-{issue.sequence_id}
                        </span>
                        <span
                          className={cn(
                            'truncate',
                            closed && 'text-muted-foreground line-through',
                          )}
                        >
                          {issue.title}
                        </span>
                      </span>
                      {from && (
                        <span className="mt-0.5 block truncate pl-4 text-[11px] text-amber-600 dark:text-amber-400">
                          {t('Сейчас в этапе «{{name}}»', { name: from })}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          {shown.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {candidates.length === 0
                ? isCycle
                  ? t('Все задачи проекта уже в этом этапе.')
                  : t('Все задачи проекта уже в этом модуле.')
                : t('Ничего не найдено.')}
            </p>
          )}
        </div>

        <DialogFooter className="mt-4 items-center">
          <span
            className="mr-auto text-xs text-muted-foreground"
            aria-live="polite"
          >
            {picked.size > 0 && t('Выбрано: {{n}}', { n: picked.size })}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Отмена')}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={picked.size === 0 || busy}
          >
            {t('Добавить')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
