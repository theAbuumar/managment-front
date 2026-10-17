import client from './client'
import type { UserBrief } from './issue'
import { t } from '@/i18n'

export type ProjectVisibility = 'public' | 'private'
export type ProjectStatus = 'planned' | 'active' | 'paused' | 'completed'

export const PROJECT_STATUSES: Record<ProjectStatus, { label: () => string; color: string }> = {
  planned: { label: () => t('Запланирован'), color: '#6B7280' },
  active: { label: () => t('Активный'), color: '#3B82F6' },
  paused: { label: () => t('Приостановлен'), color: '#F59E0B' },
  completed: { label: () => t('Завершён'), color: '#10B981' },
}

export interface Project {
  id: string
  workspace_id: string
  name: string
  identifier: string
  description: string | null
  lead_id: string | null
  is_archived: boolean
  visibility: ProjectVisibility
  status: ProjectStatus
  start_date: string | null
  target_date: string | null
  /** Курирующее подразделение. */
  department_id: string | null
  icon: string | null
  color: string | null
  created_at?: string
  updated_at?: string
  lead?: UserBrief | null
  department?: { id: string; name: string; short_name: string | null } | null
  stats?: { members: number; issues: number; open_issues: number }
}

export interface ProjectInput {
  name: string
  identifier: string
  description?: string
  lead_id?: string | null
  visibility?: ProjectVisibility
  status?: ProjectStatus
  start_date?: string | null
  target_date?: string | null
  department_id?: string | null
  icon?: string | null
  color?: string | null
  member_ids?: string[]
}

export const getProjects = (slug: string) =>
  client.get<unknown, Project[]>(`/workspaces/${slug}/projects/`)

export const getProject = (slug: string, id: string) =>
  client.get<unknown, Project>(`/workspaces/${slug}/projects/${id}`)

export const createProject = (slug: string, data: ProjectInput) =>
  client.post<unknown, Project>(`/workspaces/${slug}/projects/`, data)

export const updateProject = (
  slug: string,
  id: string,
  data: Partial<Omit<ProjectInput, 'identifier' | 'member_ids' | 'description'>> & {
    description?: string | null
    is_archived?: boolean
  },
) => client.patch<unknown, Project>(`/workspaces/${slug}/projects/${id}`, data)

// Soft delete: the project goes to the trash.
export const deleteProject = (slug: string, id: string) =>
  client.delete<unknown, unknown>(`/workspaces/${slug}/projects/${id}`)
