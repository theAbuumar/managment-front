import client from './client'

// Audit log of a workspace (Ф12 12.B1, `GET WS/audit`), admins and the owner only.

export type AuditGroup =
  'auth' | 'members' | 'structure' | 'deletions' | 'exports' | 'settings'

export interface AuditEntry {
  id: string
  created_at: string
  /** e.g. `member.updated`, `issue.deleted`, `report.exported`, `auth.login` */
  action: string
  actor: { id: string; display_name: string } | null
  target: { type: string; id: string | null; name: string | null } | null
  /** Whitelisted request fields: role, department_id, fields, method, report… */
  meta: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
}

export interface AuditPage {
  data: AuditEntry[]
  next_cursor: string | null
}

export const getAudit = (
  slug: string,
  params: { group?: AuditGroup; cursor?: string; limit?: number } = {},
) => client.get<unknown, AuditPage>(`/workspaces/${slug}/audit/`, { params })
