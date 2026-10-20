import client from './client'
import type { Issue } from './issue'
import type { IssueFields } from './templates'

// Recurring issues (6.B4, ADR-030): a rule keeps the fields of an issue and a
// schedule in the workspace zone; the server creates one issue per run.

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Schedule {
  frequency: Frequency
  /** Every N days / weeks / months / quarters / years. */
  interval: number
  /** weekly: ISO weekdays, 1 = Monday … 7 = Sunday. */
  by_weekday: number[]
  /** monthly/quarterly/yearly: 1–31; past the month's end — its last day. */
  by_monthday: number | null
  /** yearly: 1–12. */
  by_month: number | null
  /** Local "HH:MM". */
  time: string
  /** Local "YYYY-MM-DD". */
  start_date: string
  until: string | null
}

export interface RecurringRule extends Schedule {
  id: string
  project_id: string
  created_by_id: string
  created_by: { id: string; display_name: string; avatar_url: string | null }
  data: IssueFields
  due_in_days: number | null
  next_run_at: string | null
  last_run_at: string | null
  /** Why the latest run made nothing (an error code); AUTHOR_NOT_MEMBER etc. pause it. */
  last_error: string | null
  is_active: boolean
  issues_count: number
  last_issue: {
    id: string
    sequence_id: number
    title: string
    created_at: string
  } | null
  can_edit: boolean
  created_at: string
  updated_at: string
}

export type RuleBody = Partial<Schedule> & {
  frequency: Frequency
  data: IssueFields
  due_in_days?: number | null
  /** «Повторять» in the create form: the first issue now. */
  create_now?: boolean
}

const base = (slug: string, projectId: string) =>
  `/workspaces/${slug}/projects/${projectId}/recurring`

export const getRecurringRules = (slug: string, projectId: string) =>
  client.get<unknown, { data: RecurringRule[] }>(base(slug, projectId))

export const createRecurringRule = (
  slug: string,
  projectId: string,
  body: RuleBody,
) =>
  client.post<unknown, RecurringRule & { created_issue: Issue | null }>(
    base(slug, projectId),
    body,
  )

export const updateRecurringRule = (
  slug: string,
  projectId: string,
  id: string,
  body: Partial<Schedule> & {
    data?: IssueFields
    due_in_days?: number | null
    is_active?: boolean
  },
) =>
  client.patch<unknown, RecurringRule>(`${base(slug, projectId)}/${id}`, body)

export const deleteRecurringRule = (
  slug: string,
  projectId: string,
  id: string,
) => client.delete<unknown, void>(`${base(slug, projectId)}/${id}`)

/** «Создать сейчас»: one issue outside the schedule. */
export const runRecurringRule = (slug: string, projectId: string, id: string) =>
  client.post<unknown, Issue>(`${base(slug, projectId)}/${id}/run`)
