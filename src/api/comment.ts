import client from './client'

export interface Comment {
  id: string
  issue_id: string
  author_id: string
  body: string
  parent_comment_id: string | null
  created_at: string
  updated_at: string
  /** Set when the text was edited («изменено», 4.F8). */
  edited_at?: string | null
  /** A deleted comment comes back only as the head of a thread with replies, without text. */
  deleted_at: string | null
  author?: {
    id: string
    display_name: string
    last_name?: string | null
    first_name?: string | null
    middle_name?: string | null
    avatar_url: string | null
  }
}

const base = (slug: string, projectId: string, issueId: string) =>
  `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/comments`

export const getComments = (slug: string, projectId: string, issueId: string) =>
  client.get<unknown, Comment[]>(`${base(slug, projectId, issueId)}/`)

/** A reply joins the thread of `parentId` (one level: a reply to a reply goes to its head). */
export const createComment = (
  slug: string,
  projectId: string,
  issueId: string,
  body: string,
  parentId?: string | null,
) =>
  client.post<unknown, Comment>(`${base(slug, projectId, issueId)}/`, {
    body,
    ...(parentId && { parent_comment_id: parentId }),
  })

/** The author or an admin; people mentioned for the first time are notified. */
export const updateComment = (
  slug: string,
  projectId: string,
  issueId: string,
  commentId: string,
  body: string,
) =>
  client.patch<unknown, Comment>(
    `${base(slug, projectId, issueId)}/${commentId}`,
    { body },
  )

export const deleteComment = (
  slug: string,
  projectId: string,
  issueId: string,
  commentId: string,
) =>
  client.delete<unknown, void>(`${base(slug, projectId, issueId)}/${commentId}`)
