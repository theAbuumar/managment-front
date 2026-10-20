import client from './client'

// Saved views (7.B4, ADR-029): a named set of page filters and a display mode.
// With a project it opens that project's board, without — the workspace list
// (/issues). Personal views are their author's; shared ones are everyone's and
// managed by admins.

export type ViewMode = 'board' | 'list' | 'calendar' | 'timeline'

export type ViewFilters = Record<string, string | string[]>

export interface SavedView {
  id: string
  name: string
  project_id: string | null
  project: {
    id: string
    name: string
    identifier: string
    icon: string | null
    color: string | null
  } | null
  filters: ViewFilters
  display: { view?: ViewMode }
  is_shared: boolean
  owner: { id: string; display_name: string; avatar_url: string | null }
  /** Personal — its author; shared — admins and the owner. */
  can_edit: boolean
  created_at: string
  updated_at: string
}

export interface SaveViewBody {
  name: string
  project_id?: string | null
  filters?: ViewFilters
  display?: { view?: ViewMode }
  is_shared?: boolean
}

/** `project`: a project's views, or `workspace` for the views of the workspace list. */
export const getViews = (slug: string, project?: string) =>
  client.get<unknown, { data: SavedView[] }>(`/workspaces/${slug}/views`, {
    params: project ? { project } : undefined,
  })

export const createView = (slug: string, body: SaveViewBody) =>
  client.post<unknown, SavedView>(`/workspaces/${slug}/views`, body)

export const updateView = (
  slug: string,
  id: string,
  body: Partial<Omit<SaveViewBody, 'project_id'>>,
) => client.patch<unknown, SavedView>(`/workspaces/${slug}/views/${id}`, body)

export const deleteView = (slug: string, id: string) =>
  client.delete<unknown, void>(`/workspaces/${slug}/views/${id}`)
