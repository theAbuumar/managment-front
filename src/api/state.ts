import client from './client'
import { t } from '@/i18n'

// State groups mirror the backend enum. `review` is "На проверке" (Ф5): the work
// was handed in and waits for the controller.
export type StateGroup =
  'backlog' | 'unstarted' | 'started' | 'review' | 'completed' | 'cancelled'

export interface State {
  id: string
  project_id: string
  name: string
  color: string
  group: StateGroup
  order: number
  is_default: boolean
  created_at?: string
  updated_at?: string
}

/** Labels and colours of the state groups (for chips, filters, analytics). */
export const STATE_GROUPS: Record<StateGroup, { label: () => string; color: string }> = {
  backlog: { label: () => t('Бэклог'), color: '#6B7280' },
  unstarted: { label: () => t('К выполнению'), color: '#374151' },
  started: { label: () => t('В работе'), color: '#3B82F6' },
  review: { label: () => t('На проверке'), color: '#8B5CF6' },
  completed: { label: () => t('Готово'), color: '#10B981' },
  cancelled: { label: () => t('Отменено'), color: '#EF4444' },
}

export const OPEN_GROUPS: StateGroup[] = ['backlog', 'unstarted', 'started', 'review']

// Board columns for a project, already ordered by `order` on the backend. Every
// project is seeded with Бэклог / К выполнению / В работе / На проверке / Готово / Отменено.
export const getStates = (slug: string, projectId: string) =>
  client.get<unknown, State[]>(
    `/workspaces/${slug}/projects/${projectId}/states/`,
  )

// ─── Managing states (4.F1, admin+, ADR-031) ─────────────────────────────────
// Every group keeps at least one state (409 LAST_STATE_IN_GROUP) and the project
// has exactly one default state (409 DEFAULT_STATE when unsetting or deleting it).

export interface StateInput {
  name: string
  color: string
  group: StateGroup
  is_default?: boolean
}

export const createState = (slug: string, projectId: string, data: StateInput) =>
  client.post<unknown, State>(`/workspaces/${slug}/projects/${projectId}/states/`, data)

export const updateState = (
  slug: string,
  projectId: string,
  stateId: string,
  data: Partial<StateInput>,
) =>
  client.patch<unknown, State>(
    `/workspaces/${slug}/projects/${projectId}/states/${stateId}`,
    data,
  )

/** Issues of the state (in the trash too) move to `transferTo`; the move is in their history. */
export const deleteState = (
  slug: string,
  projectId: string,
  stateId: string,
  transferTo: string,
) =>
  client.delete<unknown, void>(
    `/workspaces/${slug}/projects/${projectId}/states/${stateId}`,
    { params: { transfer_to_state_id: transferTo } },
  )

/** The board order: every state of the project once, first column first. */
export const reorderStates = (slug: string, projectId: string, stateIds: string[]) =>
  client.put<unknown, State[]>(
    `/workspaces/${slug}/projects/${projectId}/states/order`,
    { state_ids: stateIds },
  )
