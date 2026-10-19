import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { ErrorPage } from '@/routes/ErrorPage'
import { ProtectedRoute, WorkspaceRoute } from '@/features/auth/ProtectedRoute'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import { ProjectSettingsLayout } from '@/features/projects/ProjectSettingsLayout'
import { FEATURES } from '@/lib/features'
import { lazyPage } from '@/routes/lazyPage'

// Pages load on first visit (own chunk each); the shell, login and guards stay in
// the main bundle so the first screen needs one request.
// The sign-in page carries the form libraries (react-hook-form, zod); signed-in
// pages don't need them in the main bundle (12.F4).
const AuthPage = lazyPage(() => import('@/features/auth/AuthPage'), 'AuthPage')
const CreateWorkspacePage = lazyPage(
  () => import('@/features/onboarding/CreateWorkspacePage'),
  'CreateWorkspacePage',
)
const InviteMembersPage = lazyPage(
  () => import('@/features/onboarding/InviteMembersPage'),
  'InviteMembersPage',
)
const MembersPage = lazyPage(
  () => import('@/features/settings/MembersPage'),
  'MembersPage',
)
const GeneralPage = lazyPage(
  () => import('@/features/settings/GeneralPage'),
  'GeneralPage',
)
const OrgStructurePage = lazyPage(
  () => import('@/features/settings/OrgStructurePage'),
  'OrgStructurePage',
)
const ControlSettingsPage = lazyPage(
  () => import('@/features/settings/ControlSettingsPage'),
  'ControlSettingsPage',
)
const AuditLogPage = lazyPage(
  () => import('@/features/settings/AuditLogPage'),
  'AuditLogPage',
)
const ProjectsPage = lazyPage(
  () => import('@/features/projects/ProjectsPage'),
  'ProjectsPage',
)
const ProjectGeneralPage = lazyPage(
  () => import('@/features/projects/ProjectGeneralPage'),
  'ProjectGeneralPage',
)
const ProjectLabelsPage = lazyPage(
  () => import('@/features/projects/ProjectLabelsPage'),
  'ProjectLabelsPage',
)
const WorkItemsPage = lazyPage(
  () => import('@/features/work-items/WorkItemsPage'),
  'WorkItemsPage',
)
const WorkspaceInvitesPage = lazyPage(
  () => import('@/features/invitations/WorkspaceInvitesPage'),
  'WorkspaceInvitesPage',
)
const InviteTokenPage = lazyPage(
  () => import('@/features/invitations/InviteTokenPage'),
  'InviteTokenPage',
)
const NotificationsPage = lazyPage(
  () => import('@/features/notifications/NotificationsPage'),
  'NotificationsPage',
)
const YourWorkPage = lazyPage(
  () => import('@/features/your-work/YourWorkPage'),
  'YourWorkPage',
)
const HomePage = lazyPage(() => import('@/features/home/HomePage'), 'HomePage')
const ProfilePage = lazyPage(
  () => import('@/features/profile/ProfilePage'),
  'ProfilePage',
)
const AnalyticsPage = lazyPage(
  () => import('@/features/analytics/AnalyticsPage'),
  'AnalyticsPage',
)
const IssuesDrilldownPage = lazyPage(
  () => import('@/features/analytics/IssuesDrilldownPage'),
  'IssuesDrilldownPage',
)
const DepartmentPage = lazyPage(
  () => import('@/features/analytics/DepartmentPage'),
  'DepartmentPage',
)
const AiAssistantPage = lazyPage(
  () => import('@/features/ai/AiAssistantPage'),
  'AiAssistantPage',
)
const AiDraftsPage = lazyPage(
  () => import('@/features/ai/AiDraftsPage'),
  'AiDraftsPage',
)
const TrashPage = lazyPage(() => import('@/features/trash/TrashPage'), 'TrashPage')
const AboutPage = lazyPage(() => import('@/features/about/AboutPage'), 'AboutPage')
const IssueDeepLinkPage = lazyPage(
  () => import('@/features/issues/IssueDeepLinkPage'),
  'IssueDeepLinkPage',
)

// Only sections with a real page are routed (ADR-019); new pages are added here
// together with their flag in src/lib/features.ts.
export const router = createBrowserRouter([
  { path: '/login', element: <AuthPage /> },
  // Public landing page for the link in an invitation email.
  { path: '/invites/:token', element: <InviteTokenPage /> },
  // Deep link to an issue from emails / Telegram / «Скопировать ссылку» (ADR-006).
  // Handles the signed-out case and the workspace switch itself.
  {
    path: '/w/:workspaceSlug/browse/:issueKey',
    element: <IssueDeepLinkPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/onboarding/workspace', element: <CreateWorkspacePage /> },
      { path: '/onboarding/members', element: <InviteMembersPage /> },
    ],
  },
  {
    element: <WorkspaceRoute />,
    children: [
      {
        path: '/settings',
        element: <SettingsLayout />,
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: 'general', element: <GeneralPage /> },
          { path: 'members', element: <MembersPage /> },
          { path: 'structure', element: <OrgStructurePage /> },
          { path: 'control', element: <ControlSettingsPage /> },
          { path: 'audit', element: <AuditLogPage /> },
        ],
      },
      {
        path: '/projects/:projectId/settings',
        element: <ProjectSettingsLayout />,
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: 'general', element: <ProjectGeneralPage /> },
          { path: 'labels', element: <ProjectLabelsPage /> },
        ],
      },
      {
        path: '/',
        element: <AppShell />,
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'your-work', element: <YourWorkPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'about', element: <AboutPage /> },
          // Canonical path — the backend's invite emails link here.
          { path: 'invitations', element: <WorkspaceInvitesPage /> },
          {
            path: 'workspace-invites',
            element: <Navigate to="/invitations" replace />,
          },
          { path: 'projects/:id/work-items', element: <WorkItemsPage /> },
          { path: 'projects-list', element: <ProjectsPage /> },
          // The list behind any analytics figure (GET WS/issues with filters in the URL).
          { path: 'issues', element: <IssuesDrilldownPage /> },
          ...(FEATURES.analytics
            ? [
                { path: 'analytics', element: <AnalyticsPage /> },
                { path: 'departments/:id', element: <DepartmentPage /> },
              ]
            : []),
          ...(FEATURES.trash ? [{ path: 'trash', element: <TrashPage /> }] : []),
          // AI assistant (Ф11): the pages go home themselves while AI is off.
          ...(FEATURES.ai
            ? [
                { path: 'ai', element: <AiAssistantPage /> },
                { path: 'ai/drafts', element: <AiDraftsPage /> },
              ]
            : []),
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
