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
