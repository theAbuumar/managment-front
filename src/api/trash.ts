import client from './client'

// The trash of a workspace (Ф7 7.B6, ADR-017). Admins see and manage everything;
// a member sees and restores the issues they deleted themselves.

export type TrashType = 'issue' | 'project'

export interface TrashItem {
  type: TrashType
  id: string
  /** Issue title or project name. */
  name: string
  /** `ACCR-12` for an issue, `ACCR` for a project. */
  key: string
  /** `task` | `assignment` for an issue, null for a project. */
  kind: string | null
  project: { id: string; name: string; identifier: string } | null
  deleted_at: string
  deleted_by: { id: string; display_name: string } | null
  /** When it is removed for good automatically. */
  purge_at: string
  can_restore: boolean
  can_purge: boolean
}

export interface TrashPage {
  data: TrashItem[]
  next_cursor: string | null
  retention_days: number
}

export interface TrashResult {
  type: TrashType
  id: string
  name: string
  key: string
  project_id: string
}

export const getTrash = (
  slug: string,
  params: { type?: TrashType; cursor?: string; limit?: number } = {},
) => client.get<unknown, TrashPage>(`/workspaces/${slug}/trash/`, { params })

/** 409 PROJECT_IN_TRASH: the issue's project is deleted too — restore it first. */
export const restoreFromTrash = (slug: string, type: TrashType, id: string) =>
  client.post<unknown, TrashResult>(
    `/workspaces/${slug}/trash/${type}/${id}/restore`,
  )

/** «Удалить навсегда» (admins): with all issues of a project and the files. */
export const purgeFromTrash = (slug: string, type: TrashType, id: string) =>
  client.delete<unknown, unknown>(`/workspaces/${slug}/trash/${type}/${id}`)
