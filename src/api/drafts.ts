import client from './client'
import type { Issue, IssueKind, IssuePriorityValue } from './issue'

// Drafts of new issues (7.B5): the create form saves itself as you type; a draft
// is personal and becomes an issue with «Опубликовать».

export interface DraftData {
  title?: string
  description?: string
  kind?: IssueKind
  state_id?: string
  priority?: IssuePriorityValue
  assignee_ids?: string[]
  primary_assignee_id?: string
  controller_id?: string | null
  requires_review?: boolean
  basis?: string | null
  due_date?: string | null
  checklist?: string[]
}

export interface IssueDraft {
  id: string
  project_id: string | null
  project: {
    id: string
    name: string
    identifier: string
    icon: string | null
    color: string | null
  } | null
  data: DraftData
  created_at: string
  updated_at: string
}

export const getDrafts = (slug: string) =>
  client.get<unknown, { data: IssueDraft[] }>(`/workspaces/${slug}/drafts`)

export const getDraft = (slug: string, id: string) =>
  client.get<unknown, IssueDraft>(`/workspaces/${slug}/drafts/${id}`)

export const createDraft = (
  slug: string,
  body: { project_id?: string | null; data: DraftData },
) => client.post<unknown, IssueDraft>(`/workspaces/${slug}/drafts`, body)

export const updateDraft = (
  slug: string,
  id: string,
  body: { project_id?: string | null; data?: DraftData },
) => client.patch<unknown, IssueDraft>(`/workspaces/${slug}/drafts/${id}`, body)

export const deleteDraft = (slug: string, id: string) =>
  client.delete<unknown, void>(`/workspaces/${slug}/drafts/${id}`)

/** The draft becomes an issue in its project and is removed. */
export const publishDraft = (slug: string, id: string) =>
  client.post<unknown, Issue>(`/workspaces/${slug}/drafts/${id}/publish`)
