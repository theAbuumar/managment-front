import client from './client'

// Global search of a workspace (Ф7 7.B2, `GET WS/search`) for the command
// palette: issues (key, then words with Russian morphology), projects, people,
// departments. `*_hl` and `snippet` wrap the matches in MARK_START … MARK_END.

export const MARK_START = '\u0001'
export const MARK_END = '\u0002'

export type SearchType = 'issues' | 'projects' | 'people' | 'departments'

export interface SearchIssue {
  id: string
  key: string
  title: string
  title_hl: string
  snippet: string | null
  kind: string
  project: { id: string; name: string; identifier: string }
  state: { name: string; group: string; color: string }
  due_date: string | null
  completed_at: string | null
}

export interface SearchResult {
  query: string
  issues: SearchIssue[]
  projects: {
    id: string
    name: string
    name_hl: string
    identifier: string
    color: string | null
  }[]
  people: {
    user_id: string
    display_name: string
    name_hl: string
    avatar_url: string | null
    position: string | null
    department: { id: string; name: string } | null
  }[]
  departments: {
    id: string
    name: string
    name_hl: string
    short_name: string | null
    head: { id: string; display_name: string } | null
  }[]
}

export const searchWorkspace = (
  slug: string,
  q: string,
  params: { types?: SearchType[]; limit?: number } = {},
) =>
  client.get<unknown, SearchResult>(`/workspaces/${slug}/search/`, {
    params: {
      q,
      limit: params.limit,
      types: params.types?.join(','),
    },
  })
