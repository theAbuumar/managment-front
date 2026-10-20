import client from './client'
import { t } from '@/i18n'
import type { StateGroup } from './state'

// Relations between issues (блокирует, связана, дубликат).

export type RelationType = 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates'

/** One link inside a project; `blocks` reads «issue блокирует related_issue». */
export interface ProjectRelation {
  id: string
  issue_id: string
  related_issue_id: string
  relation_type: Exclude<RelationType, 'blocked_by'>
  created_at: string
}

/** Every link between a project's issues in one request, each pair once (7.F4). */
export const getProjectRelations = (
  slug: string,
  projectId: string,
  type?: ProjectRelation['relation_type'],
) =>
  client.get<unknown, { data: ProjectRelation[] }>(
    `/workspaces/${slug}/projects/${projectId}/relations`,
    { params: type ? { type } : undefined },
  )

// ─── Links of one issue (4.F6) ───────────────────────────────────────────────

/** How a link reads from the open issue. */
export const RELATION_LABELS: Record<RelationType, () => string> = {
  blocks: () => t('Блокирует'),
  blocked_by: () => t('Блокируется'),
  relates_to: () => t('Связана с'),
  duplicates: () => t('Дубликат'),
}

export interface IssueLink {
  id: string
  issue_id: string
  related_issue_id: string
  relation_type: RelationType
  created_at: string
  related_issue: {
    id: string
    sequence_id: number
    title: string
    priority: string
    project_id: string
    project: { id: string; identifier: string; name: string }
    state: { id: string; name: string; group: StateGroup; color: string }
  }
}

export type IssueRelations = Record<RelationType, IssueLink[]>

const issueBase = (slug: string, projectId: string, issueId: string) =>
  `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/relations`

/** Issues in the trash and ones the viewer cannot see are left out (ADR-031). */
export const getIssueRelations = (
  slug: string,
  projectId: string,
  issueId: string,
) =>
  client.get<unknown, IssueRelations>(`${issueBase(slug, projectId, issueId)}/`)

/** Any issue of the workspace the viewer sees, other projects too (404 otherwise). */
export const createRelation = (
  slug: string,
  projectId: string,
  issueId: string,
  relatedIssueId: string,
  type: RelationType,
) =>
  client.post<unknown, IssueLink>(`${issueBase(slug, projectId, issueId)}/`, {
    related_issue_id: relatedIssueId,
    relation_type: type,
  })

export const deleteRelation = (
  slug: string,
  projectId: string,
  issueId: string,
  linkId: string,
) =>
  client.delete<unknown, void>(
    `${issueBase(slug, projectId, issueId)}/${linkId}`,
  )
