import client from './client'

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
