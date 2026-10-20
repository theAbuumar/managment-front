import client from './client'
import { t } from '@/i18n'
import type { GroupProgress } from './cycle'

// Модули (ADR-021, 4.F4): a lasting part of a project's work with a lead and a
// status. An issue may be in any number of modules.

export type ModuleStatus =
  'backlog' | 'in_progress' | 'paused' | 'completed' | 'cancelled'

export const MODULE_STATUSES: Record<
  ModuleStatus,
  { label: () => string; color: string }
> = {
  backlog: { label: () => t('Запланирован'), color: '#6B7280' },
  in_progress: { label: () => t('В работе'), color: '#3B82F6' },
  paused: { label: () => t('Приостановлен'), color: '#F59E0B' },
  completed: { label: () => t('Завершён'), color: '#10B981' },
  cancelled: { label: () => t('Отменён'), color: '#EF4444' },
}

export interface Module {
  id: string
  project_id: string
  name: string
  description: string | null
  status: ModuleStatus
  lead_id: string | null
  start_date: string | null
  target_date: string | null
  progress: GroupProgress
  created_at: string
  updated_at: string
}

export interface ModuleInput {
  name: string
  description?: string | null
  status?: ModuleStatus
  lead_id?: string | null
  start_date?: string | null
  target_date?: string | null
}

const base = (slug: string, projectId: string) =>
  `/workspaces/${slug}/projects/${projectId}/modules`

export const getModules = (slug: string, projectId: string) =>
  client.get<unknown, Module[]>(`${base(slug, projectId)}/`)

export const getModule = (slug: string, projectId: string, moduleId: string) =>
  client.get<unknown, Module>(`${base(slug, projectId)}/${moduleId}`)

export const createModule = (
  slug: string,
  projectId: string,
  data: ModuleInput,
) => client.post<unknown, Module>(`${base(slug, projectId)}/`, data)

export const updateModule = (
  slug: string,
  projectId: string,
  moduleId: string,
  data: Partial<ModuleInput>,
) => client.patch<unknown, Module>(`${base(slug, projectId)}/${moduleId}`, data)

/** Admin+ (ADR-031); the issues stay where they are. */
export const deleteModule = (
  slug: string,
  projectId: string,
  moduleId: string,
) => client.delete<unknown, void>(`${base(slug, projectId)}/${moduleId}`)

export const addIssuesToModule = (
  slug: string,
  projectId: string,
  moduleId: string,
  issueIds: string[],
) =>
  client.post<unknown, { added: number }>(
    `${base(slug, projectId)}/${moduleId}/issues`,
    {
      issue_ids: issueIds,
    },
  )

export const removeIssueFromModule = (
  slug: string,
  projectId: string,
  moduleId: string,
  issueId: string,
) =>
  client.delete<unknown, void>(
    `${base(slug, projectId)}/${moduleId}/issues/${issueId}`,
  )
