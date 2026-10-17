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
  /** Only on deadline_change_decided. */
  details?: { approved: boolean; new_due_date: string } | null
}

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
