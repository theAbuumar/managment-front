import type { WorkspaceMember } from '@/api/workspace'

/** «@handle» of a member — the part of their email before «@» — or null without an email. */
export function mentionHandle(member: WorkspaceMember): string | null {
  const local = member.user.email?.split('@')[0]?.toLowerCase()
  return local || null
}
