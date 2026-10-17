import client from './client'
import type { IssueKind, PersonBrief, ProjectBrief } from './issue'
import type { StateGroup } from './state'

// Analytics and reports for the management (Ф10, backend records "10.B1…").
// Every response is already cut to the viewer's area: admins — the workspace,
// a department head — their subtree, anyone else — their own work (`scope`).

export interface AnalyticsFilters {
  /** Local dates YYYY-MM-DD, inclusive. Default: the last 30 days. */
  from?: string
  to?: string
  /** A department includes its sub-departments. */
  department?: string
  project?: string
  kind?: IssueKind
}

export interface Period {
  from: string
  to: string
}

export interface Scope {
  kind: 'all' | 'departments' | 'self'
  department_ids: string[]
}

export interface Counters {
  created: number
  completed: number
  on_time: number
  late: number
  no_deadline: number
  /** on time / (on time + late) × 100; null when nothing with a deadline was completed. */
  discipline: number | null
  open: number
  overdue: number
  unacknowledged: number
  median_execution_days: number | null
  median_reaction_hours: number | null
  deadline_changes: number
  returns: number
}

interface Envelope {
  period: Period
  scope: Scope
}

export interface Summary extends Envelope {
  previous_period: Period
  current: Counters
  previous: Counters
}

export interface DepartmentBrief {
  id: string
  name: string
  short_name: string | null
}

export interface DepartmentNode extends DepartmentBrief {
  head: (PersonBrief & { position: string | null }) | null
  own: Counters
  total: Counters
  children: DepartmentNode[]
}

export interface OverdueItem {
  id: string
  key: string
  title: string
  kind: IssueKind
  basis: string | null
  state_name: string
  state_group: StateGroup
  due_date: string
  days_overdue: number
  deadline_changes: number
  project: ProjectBrief | null
  department: DepartmentBrief | null
  assignee: (PersonBrief & { position: string | null }) | null
  controller: (PersonBrief & { position: string | null }) | null
}

export interface TrendPoint {
  key: string
  from: string
  to: string
  created: number
  completed: number
  on_time: number
  late: number
  discipline: number | null
  overdue: number
  deadline_changes: number
  returns: number
}

export interface Dashboard extends Summary {
  departments: (DepartmentBrief & { has_children: boolean; total: Counters })[]
  overdue: { total: number; items: OverdueItem[] }
  trend: TrendPoint[]
}

export interface AssigneeRow {
  user: PersonBrief & { position: string | null }
  department: DepartmentBrief | null
  open_primary: number
  open_co: number
  overdue: number
  completed: number
  on_time: number
  late: number
  discipline: number | null
}

export interface ProjectRow extends Counters {
  project: ProjectBrief
  total: number
  done: number
  progress: number
}

export interface DeadlineChanges extends Envelope {
  approved: number
  rejected: number
  pending: number
  returns: number
  items: {
    id: string
    issue_id: string
    key: string
    title: string
    project: ProjectBrief | null
    old_due_date: string | null
    new_due_date: string
    shift_days: number | null
    reason: string
    requested_by: PersonBrief | null
    decided_at: string
  }[]
}

export interface ReactionTime extends Envelope {
  median_hours: number | null
  acknowledged: number
  unacknowledged: number
  by_department: {
    department: DepartmentBrief
    parent_id: string | null
    median_hours: number | null
    acknowledged: number
  }[]
}

const url = (slug: string, path: string) =>
  `/workspaces/${slug}/analytics/${path}`
type Params = AnalyticsFilters & { limit?: number; bucket?: 'week' | 'month' }
const get = <T>(slug: string, path: string, params?: Params) =>
  client.get<unknown, T>(url(slug, path), { params })

export const getDashboard = (slug: string, params?: Params) =>
  get<Dashboard>(slug, 'dashboard', params)
export const getSummary = (slug: string, params?: Params) =>
  get<Summary>(slug, 'summary', params)
export const getByDepartment = (slug: string, params?: Params) =>
  get<Envelope & { tree: DepartmentNode[]; unassigned: Counters | null }>(
    slug,
    'by-department',
    params,
  )
export const getByAssignee = (slug: string, params?: Params) =>
  get<Envelope & { items: AssigneeRow[] }>(slug, 'by-assignee', params)
export const getByProject = (slug: string, params?: Params) =>
  get<Envelope & { items: ProjectRow[] }>(slug, 'by-project', params)
export const getTrends = (slug: string, params?: Params) =>
  get<Envelope & { bucket: 'week' | 'month'; items: TrendPoint[] }>(
    slug,
    'trends',
    params,
  )
export const getOverdue = (slug: string, params?: Params) =>
  get<Envelope & { total: number; items: OverdueItem[] }>(
    slug,
    'overdue',
    params,
  )
export const getDeadlineChanges = (slug: string, params?: Params) =>
  get<DeadlineChanges>(slug, 'deadline-changes', params)
export const getReactionTime = (slug: string, params?: Params) =>
  get<ReactionTime>(slug, 'reaction-time', params)

// ─── Reports (10.B4) ──────────────────────────────────────────────────────────

export type ReportKind = 'discipline.pdf' | 'assignments.xlsx'

/** Download a report with the current filters (the browser saves it under the server's name). */
export async function downloadReport(
  slug: string,
  report: ReportKind | { projectId: string },
  params: AnalyticsFilters,
  fallbackName: string,
): Promise<void> {
  const path =
    typeof report === 'string'
      ? `/workspaces/${slug}/reports/${report}`
      : `/workspaces/${slug}/projects/${report.projectId}/report.pdf`
  const blob = await client.get<unknown, Blob>(path, { params, responseType: 'blob' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fallbackName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  // Keep the link until the browser has picked the file name up.
  setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(link.href)
  }, 10_000)
}
