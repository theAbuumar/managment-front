import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CalendarRange,
  Layers,
  ListTree,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PersonAvatar } from '@/components/ui/person-avatar'
import type { Cycle } from '@/api/cycle'
import type { Issue } from '@/api/issue'
import type { State } from '@/api/state'
import type { WorkspaceMember } from '@/api/workspace'
import { fullName, shortName } from '@/lib/people'
import { AddIssuesDialog } from './AddIssuesDialog'
import { ScopeDialog } from './ScopeDialog'
import { ScopeProgress } from './ScopeProgress'
import {
  SCOPE_TEXT,
  dateRange,
  inScope,
  progressOf,
  scopeEnd,
  scopePath,
  scopeStatus,
  type Scope,
  type ScopeKind,
} from './scopes'

/**
 * The board opened for one cycle or module (`?cycle=` / `?module=`): what it
 * is, its dates and live progress (counted from the board's own issues, so a
 * moved card shows at once), «Добавить задачи», «Изменить», the way back to
 * the list and «×» that shows the whole project again.
 */
export function ScopeBanner({
  kind,
  id,
  scope,
  slug,
  projectId,
  identifier,
  issues,
  states,
  cycles,
  members,
  readOnly,
  onClear,
  onAdded,
  onSaved,
}: {
  kind: ScopeKind
  id: string
  /** undefined — still loading; null — no such cycle or module (deleted). */
  scope: Scope | null | undefined
  slug: string
  projectId: string
  identifier: string
  /** Every issue of the project on the board, before its filters. */
  issues: Issue[]
  states: State[]
  cycles: Cycle[]
  members: WorkspaceMember[]
  readOnly: boolean
  onClear: () => void
  onAdded: (issueIds: string[]) => void
  onSaved: (scope: Scope) => void
}) {
  const { t } = useTranslation()
  const text = SCOPE_TEXT[kind]
  const Icon = kind === 'cycle' ? RefreshCw : Layers
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  // A fresh form and selection on every opening.
  const [openings, setOpenings] = useState(0)

  const progress = useMemo(
    () =>
      progressOf(
        issues.filter((i) => inScope(i, kind, id)),
        states,
      ),
    [issues, states, kind, id],
  )

  const clearLabel =
    kind === 'cycle'
      ? t('Убрать фильтр по этапу')
      : t('Убрать фильтр по модулю')

  if (scope === undefined)
    return (
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-muted/30 px-4">
        <Skeleton className="size-6" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="hidden h-1.5 w-28 sm:block" />
      </div>
    )

  if (scope === null)
    return (
      <div
        role="status"
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      >
        <AlertCircle size={16} className="shrink-0" />
        <span className="min-w-0 flex-1">{text.notFound()}</span>
        <Button size="sm" variant="outline" onClick={onClear}>
          {t('Показать все задачи')}
        </Button>
      </div>
    )

  const status = scopeStatus(scope)
  const range = dateRange(scope.start_date, scopeEnd(scope))
  const leadId = 'lead_id' in scope ? scope.lead_id : null
  const lead = leadId ? members.find((m) => m.user_id === leadId) : undefined

  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2">
      <div className="flex items-start gap-2 md:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              title={text.one()}
            >
              <Icon size={13} />
            </span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {text.one()}
            </span>
            <span
              className="truncate text-sm font-semibold text-foreground"
              title={scope.description || scope.name}
            >
              {scope.name}
            </span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: `${status.color}1f`, color: status.color }}
            >
              {status.label}
            </span>
          </div>
          {range && (
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
              <CalendarRange size={12} />
              {range}
            </span>
          )}
          {lead && (
            <span
              className="flex min-w-0 items-center gap-1.5 text-xs text-foreground"
              title={t('Руководитель: {{name}}', { name: fullName(lead.user) })}
            >
              <PersonAvatar
                person={{ ...lead.user, id: lead.user_id }}
                size={18}
                title={false}
              />
              <span className="truncate">{shortName(lead.user)}</span>
            </span>
          )}
          <ScopeProgress progress={progress} compact />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              title={t('Добавить задачи')}
              onClick={() => {
                setOpenings((n) => n + 1)
                setAdding(true)
              }}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">{t('Добавить задачи')}</span>
            </Button>
          )}
          {!readOnly && (
            <Button
              size="sm"
              variant="ghost"
              className="px-2 xl:px-3"
              title={t('Изменить')}
              onClick={() => {
                setOpenings((n) => n + 1)
                setEditing(true)
              }}
            >
              <Pencil size={14} />
              <span className="hidden xl:inline">{t('Изменить')}</span>
            </Button>
          )}
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="px-2 xl:px-3"
            title={text.all()}
          >
            <Link to={scopePath(kind, projectId)}>
              <ListTree size={14} />
              <span className="hidden xl:inline">{text.all()}</span>
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            title={clearLabel}
            aria-label={clearLabel}
            onClick={onClear}
          >
            <X size={15} />
          </Button>
        </div>
      </div>

      {!readOnly && (
        <AddIssuesDialog
          key={`add-${openings}`}
          kind={kind}
          scope={scope}
          open={adding}
          onOpenChange={setAdding}
          slug={slug}
          projectId={projectId}
          identifier={identifier}
          issues={issues}
          states={states}
          cycles={cycles}
          onAdded={onAdded}
        />
      )}
      {!readOnly && (
        <ScopeDialog
          key={`edit-${openings}`}
          kind={kind}
          item={scope}
          open={editing}
          onOpenChange={setEditing}
          slug={slug}
          projectId={projectId}
          members={members}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
