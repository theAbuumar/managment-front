import client from './client'

// action is a dotted string like 'issue.created' / 'issue.updated'. For an
// 'issue.updated' entry, `field` says which field changed and old/new_value
// hold the raw stored values (state ids, priority strings, etc.).
export interface Activity {
  id: string
  workspace_id: string
  issue_id: string | null
  actor_id: string
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  actor?: {
    id: string
    display_name: string
    avatar_url: string | null
  }
}

interface ActivityPage {
  data: Activity[]
  next_cursor: string | null
}

// Newest-first activity history for an issue, a page at a time (4.F11): pass the
// previous page's `next_cursor` for the older entries.
export const getActivity = (
  slug: string,
  projectId: string,
  issueId: string,
  cursor?: string | null,
) =>
  client.get<unknown, ActivityPage>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/activity/`,
    { params: { limit: 50, ...(cursor && { cursor }) } },
  )

// ─── Workspace feed (7.B3) ────────────────────────────────────────────────────

/** Kinds of events the feed filters by; several = any of them. */
export type FeedType =
  | 'created'
  | 'state'
  | 'review'
  | 'deadline'
  | 'people'
  | 'comments'
  | 'files'
  | 'checklist'
  | 'trash'
  /** Cycles, modules, sub-issues and relations (4.F3–4.F7). */
  | 'structure'

export interface FeedItem {
  id: string
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  /** Name of the state, person or label the value refers to. */
  old_label: string | null
  new_label: string | null
  created_at: string
  actor: { id: string; display_name: string; avatar_url: string | null }
  issue: {
    id: string
    sequence_id: number
    title: string
    kind: 'task' | 'assignment'
    /** Set when the task is in the trash. */
    deleted_at: string | null
    project: {
      id: string
      name: string
      identifier: string
      icon: string | null
      color: string | null
    }
  }
}

export interface FeedParams {
  type?: FeedType[]
  project?: string
  /** With sub-departments. */
  department?: string
  actor?: string
  /** "YYYY-MM-DD" in the workspace time zone, inclusive. */
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

/**
 * Who did what across the workspace, newest first. Admins see everything,
 * department heads — their department with sub-departments; others get 403.
 */
export const getWorkspaceActivity = (slug: string, params: FeedParams = {}) =>
  client.get<unknown, { data: FeedItem[]; next_cursor: string | null }>(
    `/workspaces/${slug}/activity`,
    { params, paramsSerializer: { indexes: null } },
  )
