// Page filters that live in the URL and are what a saved view stores (7.F5,
// ADR-029). A project's board reads its filters from the address and applies
// them to the loaded issues; the workspace list (/issues) passes its own to
// GET WS/issues. A view opens by putting its filters back into the address.

import { t } from '@/i18n'
import { STATE_GROUPS, type StateGroup } from '@/api/state'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import type { Issue, IssueKind, IssuePriorityValue } from '@/api/issue'
import type { SavedView, ViewFilters, ViewMode } from '@/api/views'
import { deadlineInfo } from '@/lib/deadline'

// ─── Project board ───────────────────────────────────────────────────────────

export type QuickFilter =
  'all' | 'mine' | 'control' | 'overdue' | 'review' | 'unack'
export const QUICK_FILTERS: { key: QuickFilter; label: () => string }[] = [
  { key: 'all', label: () => t('Все') },
  { key: 'mine', label: () => t('Мои') },
  { key: 'control', label: () => t('На контроле') },
  { key: 'overdue', label: () => t('Просрочено') },
  { key: 'review', label: () => t('На проверке') },
  { key: 'unack', label: () => t('Не ознакомлены') },
]

export const PRIORITIES: IssuePriorityValue[] = [
  'urgent',
  'high',
  'medium',
  'low',
  'none',
]
export const GROUPS = Object.keys(STATE_GROUPS) as StateGroup[]

export interface BoardFilters {
  quick: QuickFilter
  /** Any of these state groups. */
  group: StateGroup[]
  priority: IssuePriorityValue[]
  /** A user id or `me`. */
  assignee: string | null
  kind: IssueKind | null
  /** Any of these labels. */
  label: string[]
}

/** URL keys of the board's filters (besides `view`, the display mode). */
export const BOARD_KEYS = [
  'quick',
  'group',
  'priority',
  'assignee',
  'kind',
  'label',
] as const

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

export function readBoardFilters(params: URLSearchParams): BoardFilters {
  const quick = params.get('quick') as QuickFilter | null
  const kind = params.get('kind')
  return {
    quick: quick && QUICK_FILTERS.some((q) => q.key === quick) ? quick : 'all',
    group: list(params.get('group')).filter(
      (g): g is StateGroup => g in STATE_GROUPS,
    ),
    priority: list(params.get('priority')).filter(
      (p): p is IssuePriorityValue =>
        PRIORITIES.includes(p as IssuePriorityValue),
    ),
    assignee: params.get('assignee') || null,
    kind: kind === 'task' || kind === 'assignment' ? kind : null,
    label: list(params.get('label')),
  }
}

/** The filters as URL values (only the ones that are set). */
export function boardFilterValues(f: BoardFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.quick !== 'all') out.quick = f.quick
  if (f.group.length) out.group = f.group.join(',')
  if (f.priority.length) out.priority = f.priority.join(',')
  if (f.assignee) out.assignee = f.assignee
  if (f.kind) out.kind = f.kind
  if (f.label.length) out.label = f.label.join(',')
  return out
}

/** How many panel filters are on (the quick filter has its own row). */
export function panelCount(f: BoardFilters): number {
  return (
    (f.group.length ? 1 : 0) +
    (f.priority.length ? 1 : 0) +
    (f.assignee ? 1 : 0) +
    (f.kind ? 1 : 0) +
    (f.label.length ? 1 : 0)
  )
}

export function matchesBoard(
  issue: Issue,
  f: BoardFilters,
  ctx: {
    me: string | undefined
    group: StateGroup | undefined
    timeZone: string
  },
): boolean {
  const open = ctx.group !== 'completed' && ctx.group !== 'cancelled'
  switch (f.quick) {
    case 'mine':
      if (!issue.assignees.some((a) => a.user_id === ctx.me)) return false
      break
    case 'control':
      if (
        !open ||
        (issue.controller_id ??
          (issue.kind === 'assignment' ? issue.created_by_id : null)) !== ctx.me
      )
        return false
      break
    case 'overdue':
      if (
        !open ||
        deadlineInfo(issue.due_date, ctx.group, ctx.timeZone).tone !== 'overdue'
      )
        return false
      break
    case 'review':
      if (ctx.group !== 'review') return false
      break
    case 'unack':
      if (
        !open ||
        issue.kind !== 'assignment' ||
        !issue.assignees.some((a) => !a.acknowledged_at)
      )
        return false
      break
  }
  if (f.group.length && (!ctx.group || !f.group.includes(ctx.group)))
    return false
  if (f.priority.length && !f.priority.includes(issue.priority)) return false
  if (f.kind && issue.kind !== f.kind) return false
  if (f.assignee) {
    const who = f.assignee === 'me' ? ctx.me : f.assignee
    if (!issue.assignees.some((a) => a.user_id === who)) return false
  }
  if (f.label.length && !issue.labels.some((l) => f.label.includes(l.label_id)))
    return false
  return true
}

// ─── Workspace list (/issues) ────────────────────────────────────────────────

/** URL keys the workspace list understands (GET WS/issues, 7.B1). */
export const LIST_KEYS = [
  'department',
  'project',
  'kind',
  'assignee',
  'overdue',
  'open',
  'completed_from',
  'completed_to',
] as const

// ─── Saved views ─────────────────────────────────────────────────────────────

export const VIEW_LABELS: Record<ViewMode, () => string> = {
  board: () => t('Доска'),
  list: () => t('Список'),
  calendar: () => t('Календарь'),
  timeline: () => t('Таймлайн'),
}

const single = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.join(',') : v

/** The filters a page would save: its known keys that are set, as strings. */
export function pickFilters(
  params: URLSearchParams,
  keys: readonly string[],
): ViewFilters {
  const out: ViewFilters = {}
  for (const key of keys) {
    const v = params.get(key)
    if (v) out[key] = v
  }
  return out
}

/** Where a view opens: its project's board, or the workspace list with its name as the title. */
export function viewHref(
  view: Pick<SavedView, 'project_id' | 'filters' | 'display' | 'name'>,
): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(view.filters)) {
    const value = single(v)
    if (value) params.set(k, value)
  }
  if (view.project_id) {
    params.set('view', view.display.view ?? 'board')
    return `/projects/${view.project_id}/work-items?${params}`
  }
  params.set('title', view.name)
  return `/issues?${params}`
}

/** Is the page showing exactly this view? (same filters and display mode) */
export function isCurrent(
  view: Pick<SavedView, 'filters' | 'display'>,
  filters: ViewFilters,
  mode?: ViewMode,
): boolean {
  if (mode && (view.display.view ?? 'board') !== mode) return false
  const a = Object.entries(view.filters).map(([k, v]) => `${k}=${single(v)}`)
  const b = Object.entries(filters).map(([k, v]) => `${k}=${single(v)}`)
  return a.length === b.length && a.sort().join('&') === b.sort().join('&')
}

/** Names for ids in a filter summary (whatever the page has loaded). */
export interface FilterNames {
  person?: (id: string) => string | undefined
  department?: (id: string) => string | undefined
  project?: (id: string) => string | undefined
  label?: (id: string) => string | undefined
}

/** Human chips for a set of filters: «Просрочено», «Приоритет: срочный, высокий»… */
export function describeFilters(
  filters: ViewFilters,
  names: FilterNames = {},
): string[] {
  const chips: string[] = []
  const values = (key: string) => list(single(filters[key]) ?? null)
  const quick = QUICK_FILTERS.find((q) => q.key === single(filters.quick))
  if (quick && quick.key !== 'all') chips.push(quick.label())
  const kind = single(filters.kind)
  if (kind) chips.push(kind === 'assignment' ? t('Поручения') : t('Задачи'))
  if (values('group').length)
    chips.push(
      t('Состояние: {{list}}', {
        list: values('group')
          .map((g) => STATE_GROUPS[g as StateGroup]?.label().toLowerCase() ?? g)
          .join(', '),
      }),
    )
  if (values('priority').length)
    chips.push(
      t('Приоритет: {{list}}', {
        list: values('priority')
          .map(
            (p) =>
              PRIORITY_CONFIG[p as IssuePriorityValue]?.label.toLowerCase() ??
              p,
          )
          .join(', '),
      }),
    )
  const assignee = single(filters.assignee)
  if (assignee)
    chips.push(
      t('Исполнитель: {{name}}', {
        name:
          assignee === 'me'
            ? t('я')
            : (names.person?.(assignee) ?? t('сотрудник')),
      }),
    )
  if (values('label').length) {
    const named = values('label').map((id) => names.label?.(id))
    chips.push(
      named.every(Boolean)
        ? t('Метки: {{list}}', { list: named.join(', ') })
        : t('Меток: {{n}}', { n: named.length }),
    )
  }
  const department = single(filters.department)
  if (department)
    chips.push(names.department?.(department) ?? t('Подразделение'))
  const project = single(filters.project)
  if (project) chips.push(names.project?.(project) ?? t('Проект'))
  if (single(filters.overdue) === 'true') chips.push(t('Просрочено'))
  if (single(filters.open) === 'true') chips.push(t('Открытые'))
  const from = single(filters.completed_from)
  const to = single(filters.completed_to)
  if (from && to) chips.push(t('Выполнено с {{from}} по {{to}}', { from, to }))
  return chips
}
