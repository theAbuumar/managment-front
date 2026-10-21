import client from './client'

// In-app notifications live in the backend `notifications` module, mounted at
// /workspaces/:slug/notifications and scoped to the requesting member. Rows are
// written inside the same transaction as the triggering mutation; Telegram /
// email delivery is a separate fan-out on the backend. Every type of ADR-020:
export type NotificationType =
  | 'issue_assigned'
  | 'comment_added'
  | 'mentioned'
  | 'state_changed'
  | 'review_requested'
  | 'review_approved'
  | 'review_returned'
  | 'acknowledged'
  | 'due_soon'
  | 'overdue'
  | 'escalated'
  | 'deadline_change_requested'
  | 'deadline_change_decided'
  | 'invite_received'
  | 'report_ready'
  | 'digest'

export interface NotificationActor {
  id: string
  display_name: string
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
  avatar_url: string | null
}

/** Enough of the issue to render the row and open it. */
export interface NotificationIssue {
  id: string
  title: string
  sequence_id: number
  project_id: string
  kind: 'task' | 'assignment'
  due_date: string | null
  project: { identifier: string; name: string }
}

export interface AppNotification {
  id: string
  workspace_id: string
  recipient_id: string
  actor_id: string
  type: NotificationType
  issue_id: string | null
  entity_id: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
  actor: NotificationActor
  issue?: NotificationIssue | null
  /** deadline_change_decided: the decision; report_ready: the sending of a planned report. */
  details?: DeadlineDecision | ReportReady | null
}

export interface DeadlineDecision {
  approved: boolean
  new_due_date: string
}

/** «Отчёт готов» (10.B5): what to call it and which sending to download. */
export interface ReportReady {
  run_id: string
  schedule_id: string
  report: 'discipline' | 'assignments' | 'project'
  name: string | null
  period_from: string
  period_to: string
  file_name: string | null
}

export const isReportReady = (d: AppNotification['details']): d is ReportReady =>
  !!d && 'run_id' in d

export interface NotificationPage {
  data: AppNotification[]
  unread_count: number
  next_cursor: string | null
}

interface ListParams {
  // Filter by read state; omit for all. Serialized as ?read=true|false.
  read?: boolean
  // Only these types (sent comma-separated).
  type?: NotificationType[]
  cursor?: string
  limit?: number
}

export const getNotifications = (slug: string, params?: ListParams) =>
  client.get<unknown, NotificationPage>(`/workspaces/${slug}/notifications/`, {
    params: { ...params, type: params?.type?.length ? params.type.join(',') : undefined },
  })

export const markNotificationRead = (slug: string, id: string) =>
  client.post<unknown, AppNotification>(
    `/workspaces/${slug}/notifications/${id}/read`,
  )

export const markNotificationUnread = (slug: string, id: string) =>
  client.post<unknown, AppNotification>(
    `/workspaces/${slug}/notifications/${id}/unread`,
  )

export const markAllNotificationsRead = (slug: string) =>
  client.post<unknown, { updated: number }>(
    `/workspaces/${slug}/notifications/read-all`,
  )

// ─── Personal notification settings (8.B2) ────────────────────────────────────

export type NotificationGroup = 'assigned' | 'review' | 'deadlines' | 'escalation'
export type ChannelMatrix = Record<NotificationGroup, boolean>

/** Which events go to Telegram / email and quiet hours; in-app is always on. */
export interface NotificationSettings {
  telegram: ChannelMatrix
  /** The fallback channel: used when the message does not go to Telegram. */
  email: ChannelMatrix
  /** Local hours (profile time zone, else the workspace one). */
  quiet_hours: { enabled: boolean; from: number; to: number }
  /** Channels that can reach the user at all. */
  channels: { telegram: boolean; email: boolean }
  groups: NotificationGroup[]
}

export type NotificationSettingsPatch = {
  telegram?: Partial<ChannelMatrix>
  email?: Partial<ChannelMatrix>
  quiet_hours?: Partial<NotificationSettings['quiet_hours']>
}

export const getNotificationSettings = () =>
  client.get<unknown, NotificationSettings>('/auth/me/notification-settings')

export const updateNotificationSettings = (patch: NotificationSettingsPatch) =>
  client.put<unknown, NotificationSettings>('/auth/me/notification-settings', patch)

export const sendTestNotification = () =>
  client.post<unknown, { delivered_to: 'telegram' | 'email' | null }>(
    '/auth/me/notification-settings/test',
  )
