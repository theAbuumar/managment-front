import client from './client'
import type { Issue, IssueKind, IssuePriorityValue } from './issue'

// Issue templates (6.B3, ADR-030) and the fields they share with recurring rules
// (6.B4): the issue as the create form holds it.

export interface IssueFields {
  title: string
  description?: string
  kind?: IssueKind
  priority?: IssuePriorityValue
  assignee_ids?: string[]
  primary_assignee_id?: string
  controller_id?: string | null
  requires_review?: boolean
  basis?: string | null
  label_ids?: string[]
  checklist?: string[]
}

export interface IssueTemplate {
  id: string
  /** null — a workspace template (admins manage them, no labels). */
  project_id: string | null
  project: {
    id: string
    name: string
    identifier: string
    icon: string | null
    color: string | null
  } | null
  name: string
  data: IssueFields
  /** The issue is due this many days after it is created; null — no deadline. */
  due_in_days: number | null
  created_by_id: string | null
  created_by: {
    id: string
    display_name: string
    avatar_url: string | null
  } | null
  can_edit: boolean
  created_at: string
  updated_at: string
}

export interface TemplateBody {
  name: string
  project_id?: string | null
  data: IssueFields
  due_in_days?: number | null
}

/** All templates I see; with `projectId` — those usable in that project. */
export const getTemplates = (slug: string, projectId?: string) =>
  client.get<unknown, { data: IssueTemplate[] }>(
    `/workspaces/${slug}/templates`,
    {
      params: projectId ? { project_id: projectId } : undefined,
    },
  )

export const createTemplate = (slug: string, body: TemplateBody) =>
  client.post<unknown, IssueTemplate>(`/workspaces/${slug}/templates`, body)

export const updateTemplate = (
  slug: string,
  id: string,
  body: Partial<Omit<TemplateBody, 'project_id'>>,
) =>
  client.patch<unknown, IssueTemplate>(
    `/workspaces/${slug}/templates/${id}`,
    body,
  )

export const deleteTemplate = (slug: string, id: string) =>
  client.delete<unknown, void>(`/workspaces/${slug}/templates/${id}`)

/** Create the issue from the template right away. */
export const applyTemplate = (
  slug: string,
  id: string,
  body: { project_id?: string; title?: string },
) =>
  client.post<unknown, Issue>(`/workspaces/${slug}/templates/${id}/apply`, body)
