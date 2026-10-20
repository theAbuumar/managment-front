import { useCallback, useEffect, useState } from 'react'
import { t } from '@/i18n'
import {
  CYCLE_STATUSES,
  addIssuesToCycle,
  getCycles,
  type Cycle,
  type GroupProgress,
} from '@/api/cycle'
import {
  MODULE_STATUSES,
  addIssuesToModule,
  getModules,
  type Module,
} from '@/api/module'
import type { Issue } from '@/api/issue'
import type { State, StateGroup } from '@/api/state'
import { FEATURES } from '@/lib/features'
import { isoToDateInput, shortDate } from '@/lib/dates'
import { pluralize } from '@/lib/plural'

// Этапы and модули (4.F3, 4.F4) share their pages, dialogs and the board's
// banner: a "scope" is either of them, `kind` tells which.

export type ScopeKind = 'cycle' | 'module'
export type Scope = Cycle | Module

/** Texts that differ between the two kinds. */
export const SCOPE_TEXT = {
  cycle: {
    one: () => t('Этап'),
    many: () => t('Этапы'),
    all: () => t('Все этапы'),
    create: () => t('Новый этап'),
    notFound: () =>
      t('Этап не найден — возможно, его удалили. Задачи остались в проекте.'),
  },
  module: {
    one: () => t('Модуль'),
    many: () => t('Модули'),
    all: () => t('Все модули'),
    create: () => t('Новый модуль'),
    notFound: () =>
      t('Модуль не найден — возможно, его удалили. Задачи остались в проекте.'),
  },
} satisfies Record<ScopeKind, Record<string, () => string>>

export const scopePath = (kind: ScopeKind, projectId: string) =>
  `/projects/${projectId}/${kind === 'cycle' ? 'cycles' : 'modules'}`

/** The board showing only this cycle's or module's issues. */
export const scopeBoardPath = (
  kind: ScopeKind,
  projectId: string,
  id: string,
) => `/projects/${projectId}/work-items?${kind}=${id}`

export function scopeStatus(scope: Scope): { label: string; color: string } {
  const meta =
    'end_date' in scope
      ? CYCLE_STATUSES[scope.status]
      : MODULE_STATUSES[scope.status]
  return { label: meta.label(), color: meta.color }
}

/** A cycle's end, a module's target date. */
export const scopeEnd = (scope: Scope) =>
  'end_date' in scope ? scope.end_date : scope.target_date

/** «1 сент. — 31 дек.»; an open end is «…»; null without any date. */
export function dateRange(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null
  return `${start ? shortDate(start) : '…'} — ${end ? shortDate(end) : '…'}`
}

/** Calendar days from today to the date, as days of the workspace zone. */
function daysUntil(iso: string, timeZone: string): number {
  const day = (value: string) => {
    const [y, m, d] = value.split('-').map(Number)
    return Date.UTC(y!, m! - 1, d!)
  }
  const today = isoToDateInput(new Date().toISOString(), timeZone)
  return Math.round(
    (day(isoToDateInput(iso, timeZone)) - day(today)) / 86_400_000,
  )
}

const days = (n: number) => pluralize(n, [t('день'), t('дня'), t('дней')])

/**
 * What the dates mean today: «Осталось 12 дней» for a running cycle, «Начнётся
 * через 3 дня» for a coming one, «Срок прошёл 2 дня назад» for an open module.
 */
export function timeHint(
  scope: Scope,
  timeZone: string,
): { text: string; overdue?: boolean } | null {
  if ('end_date' in scope) {
    if (scope.status === 'active' && scope.end_date) {
      const n = daysUntil(scope.end_date, timeZone)
      return n <= 0
        ? { text: t('Последний день') }
        : { text: t('Осталось {{n}}', { n: days(n) }) }
    }
    if (scope.status === 'upcoming' && scope.start_date) {
      const n = daysUntil(scope.start_date, timeZone)
      return n <= 1
        ? { text: t('Начнётся завтра') }
        : { text: t('Начнётся через {{n}}', { n: days(n) }) }
    }
    return null
  }
  if (
    !scope.target_date ||
    scope.status === 'completed' ||
    scope.status === 'cancelled'
  )
    return null
  const n = daysUntil(scope.target_date, timeZone)
  if (n < 0)
    return {
      text: t('Срок прошёл {{n}} назад', { n: days(-n) }),
      overdue: true,
    }
  if (n === 0) return { text: t('Срок сегодня') }
  return { text: t('Осталось {{n}}', { n: days(n) }) }
}

export function inScope(issue: Issue, kind: ScopeKind, id: string): boolean {
  return kind === 'cycle'
    ? issue.cycle_id === id
    : !!issue.modules?.some((m) => m.module_id === id)
}

/**
 * The issue after joining, as the server makes it: one cycle at most (joining
 * another moves it), any number of modules. Own writes come back from the live
 * stream as echoes the board skips, so it patches its list itself.
 */
export function joinScope(issue: Issue, kind: ScopeKind, id: string): Issue {
  if (kind === 'cycle') return { ...issue, cycle_id: id }
  if (inScope(issue, kind, id)) return issue
  return { ...issue, modules: [...(issue.modules ?? []), { module_id: id }] }
}

// The API takes at most 100 issues per request.
const CHUNK = 100

/** Adds the issues (all or nothing per request); resolves with how many joined. */
export async function addIssuesToScope(
  kind: ScopeKind,
  slug: string,
  projectId: string,
  id: string,
  issueIds: string[],
): Promise<number> {
  let added = 0
  for (let i = 0; i < issueIds.length; i += CHUNK) {
    const part = issueIds.slice(i, i + CHUNK)
    const res =
      kind === 'cycle'
        ? await addIssuesToCycle(slug, projectId, id, part)
        : await addIssuesToModule(slug, projectId, id, part)
    added += res.added
  }
  return added
}

/** «Добавлено в этап «Осенний семестр»: 3 задачи». */
export function addedText(kind: ScopeKind, name: string, n: number): string {
  if (n === 0)
    return kind === 'cycle'
      ? t('Задачи уже в этапе «{{name}}»', { name })
      : t('Задачи уже в модуле «{{name}}»', { name })
  const count = pluralize(n, [t('задача'), t('задачи'), t('задач')])
  return kind === 'cycle'
    ? t('Добавлено в этап «{{name}}»: {{count}}', { name, count })
    : t('Добавлено в модуль «{{name}}»: {{count}}', { name, count })
}

export const EMPTY_PROGRESS: GroupProgress = {
  total: 0,
  backlog: 0,
  unstarted: 0,
  started: 0,
  review: 0,
  completed: 0,
  cancelled: 0,
  completion_percentage: 0,
}

/**
 * Progress counted from issues already on screen, by the server's rule (done =
 * completed + cancelled), so the board's banner follows every move at once.
 * The column an issue sits in wins over its embedded state, which an
 * optimistic move leaves stale.
 */
export function progressOf(issues: Issue[], states: State[]): GroupProgress {
  const p = { ...EMPTY_PROGRESS }
  for (const issue of issues) {
    const group: StateGroup | undefined =
      states.find((s) => s.id === issue.state_id)?.group ?? issue.state?.group
    if (!group) continue
    p[group] += 1
    p.total += 1
  }
  if (p.total > 0)
    p.completion_percentage = Math.round(
      ((p.completed + p.cancelled) / p.total) * 100,
    )
  return p
}

// A section that is off has nothing to load (and nothing to wait for).
const NONE: never[] = []

interface Loaded<T> {
  project: string
  items: T[]
}

/**
 * The cycles and modules of a project, for the board (banner, bulk bar, chips).
 * `null` while loading; lists of another project are never returned. `tick`
 * reloads them (the board's resync).
 */
export function useProjectScopes(
  slug: string | undefined,
  projectId: string | undefined,
  tick = 0,
) {
  const [cycles, setCycles] = useState<Loaded<Cycle> | null>(null)
  const [modules, setModules] = useState<Loaded<Module> | null>(null)

  useEffect(() => {
    if (!slug || !projectId) return
    let cancelled = false
    if (FEATURES.cycles)
      getCycles(slug, projectId).then(
        (items) => !cancelled && setCycles({ project: projectId, items }),
        () => !cancelled && setCycles({ project: projectId, items: [] }),
      )
    if (FEATURES.modules)
      getModules(slug, projectId).then(
        (items) => !cancelled && setModules({ project: projectId, items }),
        () => !cancelled && setModules({ project: projectId, items: [] }),
      )
    return () => {
      cancelled = true
    }
  }, [slug, projectId, tick])

  /** Put an edited cycle or module in place. */
  const save = useCallback(
    (kind: ScopeKind, item: Scope) => {
      const put = <T extends Scope>(prev: Loaded<T> | null) =>
        prev && prev.project === item.project_id
          ? {
              ...prev,
              items: prev.items.map((x) =>
                x.id === item.id ? (item as T) : x,
              ),
            }
          : prev
      if (kind === 'cycle') setCycles(put)
      else setModules(put)
    },
    [setCycles, setModules],
  )

  return {
    cycles: !FEATURES.cycles
      ? NONE
      : cycles && cycles.project === projectId
        ? cycles.items
        : null,
    modules: !FEATURES.modules
      ? NONE
      : modules && modules.project === projectId
        ? modules.items
        : null,
    save,
  }
}
