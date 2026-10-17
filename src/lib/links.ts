import { useWorkspaceStore } from '@/stores/workspaceStore'

/**
 * Absolute deep link to an issue: `/w/:workspaceSlug/browse/ABC-12` (ADR-006).
 * The same format the backend puts in emails and Telegram messages.
 */
export function issueLink(projectIdentifier: string, sequenceId: number, slug?: string): string {
  const ws = slug ?? useWorkspaceStore.getState().workspace?.slug ?? ''
  return `${window.location.origin}/w/${ws}/browse/${projectIdentifier}-${sequenceId}`
}
