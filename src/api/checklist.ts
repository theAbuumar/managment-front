import client from './client'

// Checklist of an issue (6.B5): its steps, ticked with who and when. Every write
// returns the whole checklist, so callers replace their copy with the answer.

export interface ChecklistItem {
  id: string
  issue_id: string
  text: string
  is_done: boolean
  done_by_id: string | null
  done_by: {
    id: string
    display_name: string
    avatar_url: string | null
  } | null
  done_at: string | null
  order: number
  created_at: string
  updated_at: string
}

export interface Checklist {
  data: ChecklistItem[]
  total: number
  done: number
}

const base = (slug: string, projectId: string, issueId: string) =>
  `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/checklist`

export const getChecklist = (
  slug: string,
  projectId: string,
  issueId: string,
) => client.get<unknown, Checklist>(base(slug, projectId, issueId))

export const addChecklistItem = (
  slug: string,
  projectId: string,
  issueId: string,
  text: string,
) => client.post<unknown, Checklist>(base(slug, projectId, issueId), { text })

export const updateChecklistItem = (
  slug: string,
  projectId: string,
  issueId: string,
  itemId: string,
  body: { text?: string; is_done?: boolean },
) =>
  client.patch<unknown, Checklist>(
    `${base(slug, projectId, issueId)}/${itemId}`,
    body,
  )

export const deleteChecklistItem = (
  slug: string,
  projectId: string,
  issueId: string,
  itemId: string,
) =>
  client.delete<unknown, Checklist>(
    `${base(slug, projectId, issueId)}/${itemId}`,
  )

export const reorderChecklist = (
  slug: string,
  projectId: string,
  issueId: string,
  itemIds: string[],
) =>
  client.patch<unknown, Checklist>(
    `${base(slug, projectId, issueId)}/reorder`,
    {
      item_ids: itemIds,
    },
  )
