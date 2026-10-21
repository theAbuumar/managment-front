import client from './client'

// Плановые отчёты (Ф10 10.B5, ADR-032): a document of «Аналитика» sent by itself —
// «каждый понедельник в 08:00 справка за прошлую неделю ректору». Built with the
// author's rights; anyone but the author receives it only from an admin.

export type PlannedReport = 'discipline' | 'assignments' | 'project'
export type ReportPeriod =
  'previous_week' | 'previous_month' | 'previous_quarter' | 'last_30_days'
export type ReportFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly'
export type ReportChannel = 'telegram' | 'email'

export interface ReportFilters {
  department?: string[]
  project?: string[]
  kind?: 'task' | 'assignment'
}

export interface ReportPerson {
  id: string
  display_name: string
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
  avatar_url: string | null
}

export interface ReportRecipient extends ReportPerson {
  /** Still an active member. */
  active: boolean
  /** Shown to those who can edit the report; null otherwise. */
  has_telegram: boolean | null
  has_email: boolean | null
}

export interface ReportDelivery {
  user_id: string
  channel: ReportChannel
  status: 'sent' | 'failed' | 'skipped'
  /** NO_TELEGRAM, NO_EMAIL, NOT_MEMBER or the transport's message. */
  error?: string | null
}

export interface ReportRunSummary {
  created: number
  completed: number
  on_time: number
  late: number
  overdue: number
  open: number
  discipline: number | null
}

export interface ReportRun {
  id: string
  schedule_id: string
  /** «Отправить сейчас»; null — by the schedule. */
  triggered_by_id: string | null
  period_from: string
  period_to: string
  status: 'sent' | 'partial' | 'failed'
  /** Why the document was not made. */
  error: string | null
  file_name: string | null
  file_size: number | null
  summary: Partial<ReportRunSummary>
  /** A recipient who cannot edit the report sees only their own. */
  deliveries: ReportDelivery[]
  can_download: boolean
  created_at: string
}

export interface ReportSchedule {
  id: string
  name: string | null
  report: PlannedReport
  filters: ReportFilters
  period: ReportPeriod
  frequency: ReportFrequency
  by_weekday: number[]
  by_monthday: number | null
  time: string
  recipient_ids: string[]
  recipients: ReportRecipient[]
  channels: ReportChannel[]
  next_run_at: string | null
  last_run_at: string | null
  /** Why it paused (AUTHOR_NOT_MEMBER…) or why the latest run made nothing. */
  last_error: string | null
  is_active: boolean
  created_by: ReportPerson
  can_edit: boolean
  last_run: ReportRun | null
  created_at: string
  updated_at: string
}

export interface ReportScheduleInput {
  name?: string | null
  report: PlannedReport
  filters?: ReportFilters
  period?: ReportPeriod
  frequency: ReportFrequency
  by_weekday?: number[]
  by_monthday?: number
  time?: string
  recipient_ids?: string[]
  channels?: ReportChannel[]
}

const base = (slug: string) => `/workspaces/${slug}/report-schedules`

export const getReportSchedules = (slug: string) =>
  client.get<unknown, { data: ReportSchedule[] }>(base(slug))

export const createReportSchedule = (slug: string, data: ReportScheduleInput) =>
  client.post<unknown, ReportSchedule>(base(slug), data)

export const updateReportSchedule = (
  slug: string,
  id: string,
  data: Partial<ReportScheduleInput> & { is_active?: boolean },
) => client.patch<unknown, ReportSchedule>(`${base(slug)}/${id}`, data)

export const deleteReportSchedule = (slug: string, id: string) =>
  client.delete<unknown, void>(`${base(slug)}/${id}`)

/** «Отправить сейчас»: the sending, with its deliveries. */
export const sendReportNow = (slug: string, id: string) =>
  client.post<unknown, ReportRun>(`${base(slug)}/${id}/run`)

export const getReportRuns = (slug: string, id: string) =>
  client.get<unknown, { data: ReportRun[] }>(`${base(slug)}/${id}/runs`)

/** Download the stored file of a sending (written to the audit log). */
export async function downloadReportRun(
  slug: string,
  runId: string,
): Promise<void> {
  const { url, file_name } = await client.get<
    unknown,
    { url: string; file_name: string }
  >(`/workspaces/${slug}/report-runs/${runId}/download`)
  const link = document.createElement('a')
  link.href = url
  link.download = file_name
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
