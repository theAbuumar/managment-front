import client from './client'
import { t } from '@/i18n'

export interface WorkspaceData {
  id: string
  name: string
  slug: string
  owner_id?: string
  short_name?: string | null
  description?: string | null
  logo_url?: string | null
  /** IANA zone: deadlines and reminders are computed in it. */
  timezone?: string
  locale?: string
}

// Token is attached by the axios request interceptor — callers don't pass it.
export const getWorkspaces = () =>
  client.get<unknown, WorkspaceData[]>('/workspaces/')

// The browser's zone becomes the workspace zone by default (deadlines, reminders).
export const createWorkspace = (name: string, slug: string) =>
  client.post<unknown, WorkspaceData>('/workspaces/', {
    name,
    slug,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })

export const getWorkspace = (slug: string) =>
  client.get<unknown, WorkspaceData>(`/workspaces/${slug}`)

export const updateWorkspace = (
  slug: string,
  data: {
    name?: string
    slug?: string
    short_name?: string | null
    description?: string | null
    logo_url?: string | null
    timezone?: string
    locale?: string
  },
) => client.patch<unknown, WorkspaceData>(`/workspaces/${slug}`, data)

// Owner-only on the backend (403 otherwise); returns 204.
export const deleteWorkspace = (slug: string) =>
  client.delete<unknown, void>(`/workspaces/${slug}`)

// Roles an admin can assign — the workspace owner role is not assignable.
export type AssignableRole = 'admin' | 'member' | 'guest'
export type MemberRole = 'owner' | AssignableRole

export const ROLE_LABELS: Record<MemberRole, () => string> = {
  owner: () => t('Владелец'),
  admin: () => t('Администратор'),
  member: () => t('Участник'),
  guest: () => t('Гость'),
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: MemberRole
  /** Place in the org structure (independent of the access role). */
  department_id?: string | null
  position?: string | null
  created_at?: string
  user: {
    id: string
    email: string | null
    display_name: string
    last_name?: string | null
    first_name?: string | null
    middle_name?: string | null
    phone?: string | null
    avatar_url: string | null
  }
  department?: { id: string; name: string; short_name: string | null } | null
}

export const getWorkspaceMembers = (
  workspaceSlug: string,
  params?: { department?: string; subtree?: boolean; search?: string },
) =>
  client.get<unknown, WorkspaceMember[]>(`/workspaces/${workspaceSlug}/members`, {
    params,
  })

// Role, department and/or position (admin+). The owner's role and your own role
// cannot change; department/position can be set for anyone.
export const updateMember = (
  workspaceSlug: string,
  userId: string,
  data: { role?: AssignableRole; department_id?: string | null; position?: string | null },
) =>
  client.patch<unknown, WorkspaceMember>(
    `/workspaces/${workspaceSlug}/members/${userId}`,
    data,
  )

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
