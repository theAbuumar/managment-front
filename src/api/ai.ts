import client from './client'
import type { IssuePriorityValue } from './issue'
import type { AnalyticsFilters, Period, Scope } from './analytics'

// AI assistant (Ф11, backend record "11.B1–11.B6, 11.T1", ADR-028). The server
// decides whether it is on: with `status.enabled === false` the UI shows no AI
// elements at all. AI only proposes — a person creates, edits and downloads.

export interface AiStatus {
  enabled: boolean
  provider?: string
  model?: string
  daily_limit?: number
  used_today?: number
  remaining_today?: number
  resets_at?: string
}

export const getAiStatus = (slug: string) =>
  client.get<unknown, AiStatus>(`/workspaces/${slug}/ai/status`)

// ─── Drafts from a document (11.B2) ───────────────────────────────────────────

export interface AiPerson {
  id: string
  display_name: string
  full_name: string
  position: string | null
  avatar_url: string | null
  department: { id: string; name: string; short_name: string | null } | null
}

export interface AiDepartment {
  id: string
  name: string
  short_name: string | null
}

export interface AiDraft {
  title: string
  description: string
  priority: IssuePriorityValue
  /** `person` — one assignee; `distribution` — a copy per department (6.B1). */
  mode: 'person' | 'distribution'
  assignee: AiPerson | null
  departments: AiDepartment[]
  controller: AiPerson | null
  /** YYYY-MM-DD in the workspace zone. */
  due_date: string | null
  basis: string | null
  /** How the text names the assignee. */
  assignee_text: string | null
  /** The fragment of the document the assignment comes from. */
  source_quote: string | null
  /** Doubts a person should check. */
  warnings: string[]
}

export interface AiDraftsResult {
  basis: string | null
  drafts: AiDraft[]
  source: {
    kind: 'text' | 'txt' | 'docx' | 'pdf'
    name: string | null
    chars: number | null
  }
  model: string
  generated_at: string
}

export interface AiDraftsInput {
  text?: string
  /** base64 bytes of a .txt, .docx or .pdf up to 10 MB */
  file?: { name: string; data: string }
}

export const draftIssues = (slug: string, body: AiDraftsInput) =>
  client.post<unknown, AiDraftsResult>(
    `/workspaces/${slug}/ai/draft-issues`,
    body,
  )

// ─── Issue summary (11.B3) ────────────────────────────────────────────────────

export interface AiSummary {
  issue_id: string
  essence: string
  status: string
  blockers: string[]
  next_steps: string[]
  model: string
  generated_at: string
}

export const summarizeIssue = (
  slug: string,
  projectId: string,
  issueId: string,
) =>
  client.post<unknown, AiSummary>(
    `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/ai/summary`,
  )

// ─── Analytical memo (11.B4) ──────────────────────────────────────────────────

export interface AiMemo {
  title: string
  /** `## ` headings, `- ` lists, `**bold**`. */
  text: string
  period: Period
  scope: Scope
  model: string
  generated_at: string
}

export const generateMemo = (
  slug: string,
  filters: AnalyticsFilters & { focus?: string },
) => client.post<unknown, AiMemo>(`/workspaces/${slug}/ai/report`, filters)

/** The edited memo as a file: the browser saves it under `fileName`. */
export async function downloadMemo(
  slug: string,
  body: { format: 'pdf' | 'docx'; title: string; text: string },
  fileName: string,
): Promise<void> {
  const blob = await client.post<unknown, Blob>(
    `/workspaces/${slug}/ai/report/export`,
    body,
    {
      responseType: 'blob',
    },
  )
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(link.href)
  }, 10_000)
}

// ─── AI panel (11.B5) ─────────────────────────────────────────────────────────

/** An issue an answer is about; only issues a tool returned are linked. */
export interface AiIssueRef {
  id: string
  key: string
  title: string
  project_id: string
}

export interface AiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  issues: AiIssueRef[]
  created_at: string
}

export interface AiConversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface AiAnswer {
  conversation: AiConversation
  question: AiMessage
  message: AiMessage
  model: string
}

export const askAi = (
  slug: string,
  body: { question: string; conversation_id?: string },
) => client.post<unknown, AiAnswer>(`/workspaces/${slug}/ai/ask`, body)

export const getConversations = (slug: string) =>
  client.get<unknown, { data: AiConversation[] }>(
    `/workspaces/${slug}/ai/conversations`,
  )

export const getConversation = (slug: string, id: string) =>
  client.get<unknown, AiConversation & { messages: AiMessage[] }>(
    `/workspaces/${slug}/ai/conversations/${id}`,
  )

export const deleteConversation = (slug: string, id: string) =>
  client.delete<unknown, void>(`/workspaces/${slug}/ai/conversations/${id}`)
