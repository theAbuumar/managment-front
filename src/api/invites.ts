import client from './client'
import type { MemberRole } from './workspace'

// A pending workspace invitation addressed to the current user. Mounted at
// /api/v1/invitations on the backend — NOT workspace-scoped, since the recipient
// is not yet a member of the inviting workspace.

export interface MemberInvite {
  id: string
  workspace_id: string
  inviter_id: string
  target_user_id: string
  role: MemberRole
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  expires_at: string
  responded_at: string | null
  created_at: string
}

export interface InviteInboxItem extends MemberInvite {
  workspace: { id: string; name: string; slug: string }
  inviter: { id: string; display_name: string; avatar_url: string | null }
}

export interface InviteResponseResult {
  invite: MemberInvite
  // The membership created on accept; null on decline.
  member: {
    workspace_id: string
    user_id: string
    role: MemberRole
    created_at?: string
    updated_at?: string
  } | null
}

// The current user's pending, non-expired invitations across all workspaces.
export const getMyInvites = () =>
  client.get<unknown, InviteInboxItem[]>('/invitations/')

export const acceptInvite = (inviteId: string) =>
  client.post<unknown, InviteResponseResult>(`/invitations/${inviteId}/accept`)

export const declineInvite = (inviteId: string) =>
  client.post<unknown, InviteResponseResult>(`/invitations/${inviteId}/decline`)

// ─── Email-token invitations (people invited by address, maybe without an account) ─
// The invite email links to the SPA page /invites/:token, which uses these.

export interface TokenInvite {
  id: string
  workspace_id: string
  email: string
  role: MemberRole
  expires_at: string
  workspace: { id: string; name: string; slug: string }
  invited_by: { id: string; display_name: string; email: string }
}

// Public: inspect an invite before signing in.
export const getInviteByToken = (token: string) =>
  client.get<unknown, TokenInvite>(`/invites/${encodeURIComponent(token)}`)

// Requires a session whose email matches the invite (else INVITE_EMAIL_MISMATCH).
export const acceptInviteByToken = (token: string) =>
  client.post<
    unknown,
    { workspace_id: string; user_id: string; role: MemberRole }
  >(`/invites/${encodeURIComponent(token)}/accept`)
