import { useWorkspaceStore } from '@/stores/workspaceStore'

/**
 * Absolute deep link to an issue: `/w/:workspaceSlug/browse/ABC-12` (ADR-006).
 * The same format the backend puts in emails and Telegram messages.
 */
export function issueLink(projectIdentifier: string, sequenceId: number, slug?: string): string {
  const ws = slug ?? useWorkspaceStore.getState().workspace?.slug ?? ''
  return `${window.location.origin}/w/${ws}/browse/${projectIdentifier}-${sequenceId}`
}

/** Key of a workspace-list row (rows carry their project): "ACCR-12". */
export function issueKey(issue: { sequence_id: number; project?: { identifier: string } }): string {
  return issue.project ? `${issue.project.identifier}-${issue.sequence_id}` : `#${issue.sequence_id}`
}
