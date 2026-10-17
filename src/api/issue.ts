import client from './client'
import type { StateGroup } from './state'

// Matches the backend PRIORITIES enum. Note `none` is the lowest — the board's
// status-badge config also has a `backlog` key, but issues never use it.
export type IssuePriorityValue = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export interface UserBrief {
  id: string
  email: string | null
  display_name: string
  avatar_url: string | null
}

export interface IssueAssignee {
  user_id: string
  /** Ответственный исполнитель (the others are соисполнители). */
  is_primary?: boolean
  /** "Ознакомлен" timestamp; null until the assignee confirms. */
  acknowledged_at?: string | null
  user?: UserBrief
}

/** Задача or поручение (an assignment with a controller who accepts the result). */
export type IssueKind = 'task' | 'assignment'

export interface IssueLabelLink {
  label_id: string
  label?: {
    id: string
    name: string
    color: string
  }
}

export interface Issue {
  id: string
  workspace_id: string
  project_id: string
  sequence_id: number
  title: string
  description: string | null
  state_id: string
  priority: IssuePriorityValue
  parent_id: string | null
  estimate_points: number | null
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  created_by_id: string
  kind: IssueKind
  controller_id: string | null
  requires_review: boolean
  /** Основание: "Протокол ректората №5 от 12.10.2026". */
  basis: string | null
  controller?: UserBrief | null
  state?: { id: string; name: string; group: StateGroup; color: string }
  /** watchers; deadline_requests = approved deadline moves ("переносы"). */
  _count?: { watchers: number; deadline_requests: number }
  sort_order: number
  created_at: string
  updated_at: string
  assignees: IssueAssignee[]
  labels: IssueLabelLink[]
}

// The default (non-grouped) list response: a page of issues plus a cursor.
interface PagedIssues {
  data: Issue[]
  next_cursor: string | null
}

// The full set of query filters the backend's issue-list endpoint accepts. All
// are optional; the board only wires up a few, but the "Your Work" page and any
// future saved views can lean on the rest (assignee / created_by / date ranges…).
export interface ListParams {
  search?: string
  sort_by?: 'created_at' | 'updated_at' | 'priority' | 'due_date' | 'sort_order'
  order?: 'asc' | 'desc'
  limit?: number
  cursor?: string
  // Filters — each maps 1:1 to a backend query param.
  assignee?: string // user id of an assignee
  created_by?: string // user id of the creator
  state?: string // state id
  priority?: IssuePriorityValue
  label?: string // label id
  cycle?: string
  module?: string
  parent_id?: string
  kind?: IssueKind
  controller?: string // user id or 'me'
  watcher?: string // user id or 'me'
  // Execution-control filters, computed in the workspace time zone.
  overdue?: 'true' | 'false'
  due_within?: number
  open?: 'true' | 'false'
  review_pending?: 'true' | 'false'
  acknowledged?: 'true' | 'false'
  due_before?: string // ISO date/datetime
  due_after?: string
  created_before?: string
  created_after?: string
  // Ask the backend to bucket the results server-side instead of returning a flat page.
  group_by?: 'state' | 'priority' | 'assignee'
}

// Fetch a flat page of a project's issues. The board buckets them into columns
// client-side by `state_id`, which keeps optimistic drag-and-drop moves simple.
export const getIssues = (
  slug: string,
  projectId: string,
  params?: ListParams,
) =>
  client.get<unknown, PagedIssues>(
    `/workspaces/${slug}/projects/${projectId}/issues/`,
    { params },
  )

export interface CreateIssueBody {
  title: string
  state_id: string
  description?: string
  priority?: IssuePriorityValue
  assignee_ids?: string[]
  label_ids?: string[]
  start_date?: string | null
  due_date?: string | null
  kind?: IssueKind
  controller_id?: string | null
  requires_review?: boolean
  basis?: string | null
  primary_assignee_id?: string
}

export const createIssue = (
  slug: string,
  projectId: string,
  body: CreateIssueBody,
) =>
  client.post<unknown, Issue>(
    `/workspaces/${slug}/projects/${projectId}/issues/`,
    body,
  )

export type UpdateIssueBody = Partial<{
  title: string
  description: string | null
  state_id: string
  priority: IssuePriorityValue
  start_date: string | null
  due_date: string | null
  sort_order: number
  kind: IssueKind
  controller_id: string | null
  requires_review: boolean
  basis: string | null
  primary_assignee_id: string
}>

export const updateIssue = (
  slug: string,
  projectId: string,
  issueId: string,
  body: UpdateIssueBody,
) =>
  client.patch<unknown, Issue>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
    body,
  )

export const deleteIssue = (slug: string, projectId: string, issueId: string) =>
  client.delete<unknown, void>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
  )

export const getIssue = (slug: string, projectId: string, issueId: string) =>
  client.get<unknown, Issue>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}`,
  )

// Assignee/label mutations all return the full updated issue (with relations),
// so callers can drop the result straight back into their local state.
export const addAssignee = (
  slug: string,
  projectId: string,
  issueId: string,
  userId: string,
) =>
  client.post<unknown, Issue>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/assignees`,
    { user_id: userId },
  )

export const removeAssignee = (
  slug: string,
  projectId: string,
  issueId: string,
  userId: string,
) =>
  client.delete<unknown, Issue>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/assignees/${userId}`,
  )

export const addLabel = (
  slug: string,
  projectId: string,
  issueId: string,
  labelId: string,
) =>
  client.post<unknown, Issue>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/labels`,
    { label_id: labelId },
  )

export const removeLabel = (
  slug: string,
  projectId: string,
  issueId: string,
  labelId: string,
) =>
  client.delete<unknown, Issue>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/labels/${labelId}`,
  )

// Every issue matching `params`, following `next_cursor` page by page (the list
// endpoint caps a page at 100). `maxPages` guards against a runaway loop.
export async function getAllIssues(
  slug: string,
  projectId: string,
  params: Omit<ListParams, 'cursor' | 'limit' | 'group_by'> = {},
  maxPages = 50,
): Promise<Issue[]> {
  const all: Issue[] = []
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const res = await getIssues(slug, projectId, { ...params, limit: 100, cursor })
    all.push(...res.data)
    if (!res.next_cursor) break
    cursor = res.next_cursor
  }
  return all
}
