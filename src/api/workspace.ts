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
  /** Access turned off by an admin (12.B7); null — active. */
  deactivated_at?: string | null
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

// Members whose access an admin turned off (12.B7) cannot be assigned or chosen:
// pickers and lists get only members with access; «Сотрудники» asks for everyone.
export async function getWorkspaceMembers(
  workspaceSlug: string,
  params?: {
    department?: string
    subtree?: boolean
    search?: string
    includeDeactivated?: boolean
  },
): Promise<WorkspaceMember[]> {
  const { includeDeactivated, ...query } = params ?? {}
  const list = await client.get<unknown, WorkspaceMember[]>(
    `/workspaces/${workspaceSlug}/members`,
    { params: query },
  )
  return includeDeactivated ? list : list.filter((m) => !m.deactivated_at)
}

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

// ─── Members' access (Ф12 12.B7, admin+) ─────────────────────────────────────

export type LoginProvider = 'email' | 'google' | 'github' | 'telegram'

export interface MemberAccess {
  user_id: string
  deactivated_at: string | null
  deactivated_by: { id: string; display_name: string } | null
  /** Latest sign-in on any device. */
  last_login_at: string | null
  /** Latest activity: a sign-in or a token refresh. */
  last_seen_at: string | null
  /** Devices signed in right now. */
  active_sessions: number
  providers: LoginProvider[]
  /** Open tasks where they are an assignee or the controller. */
  open_issues: number
}

export const getMemberAccess = (workspaceSlug: string) =>
  client.get<unknown, MemberAccess[]>(
    `/workspaces/${workspaceSlug}/members/access`,
  )

/** `signed_out` — their sessions ended (no workspace with access left). */
export const deactivateMember = (workspaceSlug: string, userId: string) =>
  client.post<unknown, { member: WorkspaceMember; signed_out: boolean }>(
    `/workspaces/${workspaceSlug}/members/${userId}/deactivate`,
  )

export const activateMember = (workspaceSlug: string, userId: string) =>
  client.post<unknown, WorkspaceMember>(
    `/workspaces/${workspaceSlug}/members/${userId}/activate`,
  )

/** Unlink a member's Telegram, Google or GitHub (a lost phone or account). */
export const resetMemberIdentity = (
  workspaceSlug: string,
  userId: string,
  provider: Exclude<LoginProvider, 'email'>,
) =>
  client.delete<unknown, void>(
    `/workspaces/${workspaceSlug}/members/${userId}/identities/${provider}`,
  )

