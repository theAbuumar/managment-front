import client from './client'
import { t } from '@/i18n'

// Этапы (Cycles, ADR-021, 4.F3): a period of a project with its issues. An issue
// is in at most one cycle; joining and leaving are recorded in its history.

export type CycleStatus = 'upcoming' | 'active' | 'completed'

export const CYCLE_STATUSES: Record<
  CycleStatus,
  { label: () => string; color: string }
> = {
  upcoming: { label: () => t('Впереди'), color: '#6B7280' },
  active: { label: () => t('Идёт'), color: '#3B82F6' },
  completed: { label: () => t('Завершён'), color: '#10B981' },
}

/** Issues by state group; done = completed + cancelled (trash left out). */
export interface GroupProgress {
  total: number
  backlog: number
  unstarted: number
  started: number
  review: number
  completed: number
  cancelled: number
  completion_percentage: number
}

export interface Cycle {
  id: string
  project_id: string
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
  /** By the dates, as days of the workspace time zone. */
  status: CycleStatus
  progress: GroupProgress
  created_at: string
  updated_at: string
}

export interface CycleInput {
  name: string
  description?: string | null
  start_date?: string | null
  end_date?: string | null
}

const base = (slug: string, projectId: string) =>
  `/workspaces/${slug}/projects/${projectId}/cycles`

export const getCycles = (slug: string, projectId: string) =>
  client.get<unknown, Cycle[]>(`${base(slug, projectId)}/`)

export const getCycle = (slug: string, projectId: string, cycleId: string) =>
  client.get<unknown, Cycle>(`${base(slug, projectId)}/${cycleId}`)

export const createCycle = (
  slug: string,
  projectId: string,
  data: CycleInput,
) => client.post<unknown, Cycle>(`${base(slug, projectId)}/`, data)

export const updateCycle = (
  slug: string,
  projectId: string,
  cycleId: string,
  data: Partial<CycleInput>,
) => client.patch<unknown, Cycle>(`${base(slug, projectId)}/${cycleId}`, data)

/** Admin+ (ADR-031); the issues stay, out of any cycle. */
export const deleteCycle = (slug: string, projectId: string, cycleId: string) =>
  client.delete<unknown, void>(`${base(slug, projectId)}/${cycleId}`)

/** An issue in another cycle moves here; `added` counts the ones that moved. */
export const addIssuesToCycle = (
  slug: string,
  projectId: string,
  cycleId: string,
  issueIds: string[],
) =>
  client.post<unknown, { added: number }>(
    `${base(slug, projectId)}/${cycleId}/issues`,
    {
      issue_ids: issueIds,
    },
  )

export const removeIssueFromCycle = (
  slug: string,
  projectId: string,
  cycleId: string,
  issueId: string,
) =>
  client.delete<unknown, void>(
    `${base(slug, projectId)}/${cycleId}/issues/${issueId}`,
  )
