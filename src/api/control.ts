import client from './client'
import type { Issue, UserBrief } from './issue'

// Execution control (Ф5): hand-in for review, controller decisions,
// "Ознакомлен", deadline-change requests, watchers, workspace control settings.

const base = (slug: string, projectId: string, issueId: string) =>
  `/workspaces/${slug}/projects/${projectId}/issues/${issueId}`

export interface IssueReview {
  id: string
  issue_id: string
  report: string | null
  decision: 'pending' | 'approved' | 'returned'
  decision_comment: string | null
  submitted_at: string
  decided_at: string | null
  submitted_by: UserBrief
  decided_by: UserBrief | null
  attachments: { id: string; file_name: string; file_size: number; mime_type: string }[]
}

export interface DeadlineRequest {
  id: string
  issue_id: string
  old_due_date: string | null
  new_due_date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  decision_comment: string | null
  created_at: string
  decided_at: string | null
  requested_by: UserBrief
  decided_by: UserBrief | null
}

export interface Watcher {
  issue_id: string
  user_id: string
  user: UserBrief
}

export interface ControlSettings {
  reminder_days: number[]
  reminder_hour: number
  escalation_days: number
  require_report: boolean
}

// ─── Review cycle ──────────────────────────────────────────────────────────────

export const submitReview = (
  slug: string,
  projectId: string,
  issueId: string,
  body: { report?: string | null; attachment_ids?: string[] },
) => client.post<unknown, Issue>(`${base(slug, projectId, issueId)}/review/submit`, body)

export const approveReview = (
  slug: string,
  projectId: string,
  issueId: string,
  comment?: string | null,
) =>
  client.post<unknown, Issue>(`${base(slug, projectId, issueId)}/review/approve`, {
    comment: comment || null,
  })

export const returnReview = (slug: string, projectId: string, issueId: string, comment: string) =>
  client.post<unknown, Issue>(`${base(slug, projectId, issueId)}/review/return`, { comment })

export const getReviews = (slug: string, projectId: string, issueId: string) =>
  client.get<unknown, IssueReview[]>(`${base(slug, projectId, issueId)}/reviews`)

// ─── Acknowledgement ───────────────────────────────────────────────────────────

export const acknowledgeIssue = (slug: string, projectId: string, issueId: string) =>
  client.post<unknown, Issue>(`${base(slug, projectId, issueId)}/acknowledge`)

// ─── Deadline changes ─────────────────────────────────────────────────────────

export const getDeadlineRequests = (slug: string, projectId: string, issueId: string) =>
  client.get<unknown, DeadlineRequest[]>(`${base(slug, projectId, issueId)}/deadline-requests`)

export const requestDeadlineChange = (
  slug: string,
  projectId: string,
  issueId: string,
  body: { new_due_date: string; reason: string },
) =>
  client.post<unknown, DeadlineRequest>(
    `${base(slug, projectId, issueId)}/deadline-requests`,
    body,
  )

export const decideDeadlineRequest = (
  slug: string,
  projectId: string,
  issueId: string,
  requestId: string,
  approve: boolean,
  comment?: string | null,
) =>
  client.post<unknown, DeadlineRequest>(
    `${base(slug, projectId, issueId)}/deadline-requests/${requestId}/${approve ? 'approve' : 'reject'}`,
    { comment: comment || null },
  )

// ─── Watchers ─────────────────────────────────────────────────────────────────

export const getWatchers = (slug: string, projectId: string, issueId: string) =>
  client.get<unknown, Watcher[]>(`${base(slug, projectId, issueId)}/watchers`)

export const watchIssue = (slug: string, projectId: string, issueId: string) =>
  client.post<unknown, Watcher[]>(`${base(slug, projectId, issueId)}/watchers`)

export const unwatchIssue = (slug: string, projectId: string, issueId: string) =>
  client.delete<unknown, Watcher[]>(`${base(slug, projectId, issueId)}/watchers/me`)

// ─── Workspace settings ───────────────────────────────────────────────────────

export const getControlSettings = (slug: string) =>
  client.get<unknown, ControlSettings>(`/workspaces/${slug}/control/settings`)

export const updateControlSettings = (slug: string, data: Partial<ControlSettings>) =>
  client.patch<unknown, ControlSettings>(`/workspaces/${slug}/control/settings`, data)

export const runReminders = (slug: string) =>
  client.post<
    unknown,
    { workspaces: number; sent: { due_soon: number; overdue: number; escalated: number } }
  >(`/workspaces/${slug}/control/run-reminders`, { force: true })
