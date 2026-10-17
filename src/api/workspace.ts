import client from './client'

export interface WorkspaceData {
  id: string
  name: string
  slug: string
  owner_id?: string
}

// Token is attached by the axios request interceptor — callers don't pass it.
export const getWorkspaces = () =>
  client.get<unknown, WorkspaceData[]>('/workspaces/')

export const createWorkspace = (name: string, slug: string) =>
  client.post<unknown, WorkspaceData>('/workspaces/', { name, slug })

// Backend only accepts name/slug.
export const updateWorkspace = (
  slug: string,
  data: { name?: string; slug?: string },
) => client.patch<unknown, WorkspaceData>(`/workspaces/${slug}`, data)

// Owner-only on the backend (403 otherwise); returns 204.
export const deleteWorkspace = (slug: string) =>
  client.delete<unknown, void>(`/workspaces/${slug}`)

// Roles an admin can assign — the workspace owner role is not assignable.
export type AssignableRole = 'admin' | 'member' | 'guest'
export type MemberRole = 'owner' | AssignableRole

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: MemberRole
  created_at?: string
  user: {
    id: string
    email: string
    display_name: string
    avatar_url: string | null
  }
}

export const getWorkspaceMembers = (workspaceSlug: string) =>
  client.get<unknown, WorkspaceMember[]>(`/workspaces/${workspaceSlug}/members`)

// Email-token invite for people who may not have an account yet (they get a signup
// link by email). See inviteExistingUser for inviting already-registered users.
export const inviteMember = (
  workspaceSlug: string,
  email: string,
  role: string,
) =>
  client.post<unknown, unknown>(`/workspaces/${workspaceSlug}/members/invite`, {
    email,
    role,
  })

// Directly add an already-registered user by id (admin+).
export const addMember = (
  workspaceSlug: string,
  userId: string,
  role: AssignableRole = 'member',
) =>
  client.post<unknown, WorkspaceMember>(
    `/workspaces/${workspaceSlug}/members`,
    {
      user_id: userId,
      role,
    },
  )

// Change a member's role (admin+). The owner's role cannot be changed, and you
// cannot change your own role — the backend rejects both with 403.
export const changeMemberRole = (
  workspaceSlug: string,
  userId: string,
  role: AssignableRole,
) =>
  client.patch<unknown, WorkspaceMember>(
    `/workspaces/${workspaceSlug}/members/${userId}`,
    { role },
  )

// Remove a member (admin+). Cannot remove the owner or yourself.
export const removeMember = (workspaceSlug: string, userId: string) =>
  client.delete<unknown, void>(`/workspaces/${workspaceSlug}/members/${userId}`)

export type InviteChannel = 'email' | 'telegram'

export interface InviteExistingUserResult {
  invite: {
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
  // Channels the invite was pushed to; the in-app inbox copy always exists too.
  delivered_to: InviteChannel[]
}

// Invite an already-registered user (identified by email or user_id). Creates a
// pending invite that lands in their in-app invitations inbox and is also emailed /
// sent over Telegram where available. Accepting it makes them a member.
export const inviteExistingUser = (
  workspaceSlug: string,
  body: { email?: string; user_id?: string; role?: AssignableRole },
) =>
  client.post<unknown, InviteExistingUserResult>(
    `/workspaces/${workspaceSlug}/members/invite-user`,
    body,
  )

// Leave the workspace yourself (any role but owner → 403 OWNER_CANNOT_LEAVE).
export const leaveWorkspace = (workspaceSlug: string) =>
  client.post<unknown, void>(`/workspaces/${workspaceSlug}/leave`)
