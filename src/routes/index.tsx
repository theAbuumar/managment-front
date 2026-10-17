import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { ErrorPage } from '@/routes/ErrorPage'
import { AuthPage } from '@/features/auth/AuthPage'
import { ProtectedRoute, WorkspaceRoute } from '@/features/auth/ProtectedRoute'
import { CreateWorkspacePage } from '@/features/onboarding/CreateWorkspacePage'
import { InviteMembersPage } from '@/features/onboarding/InviteMembersPage'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import { MembersPage } from '@/features/settings/MembersPage'
import { GeneralPage } from '@/features/settings/GeneralPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ProjectSettingsLayout } from '@/features/projects/ProjectSettingsLayout'
import { ProjectGeneralPage } from '@/features/projects/ProjectGeneralPage'
import { ProjectLabelsPage } from '@/features/projects/ProjectLabelsPage'
import { WorkItemsPage } from '@/features/work-items/WorkItemsPage'
import { WorkspaceInvitesPage } from '@/features/invitations/WorkspaceInvitesPage'
import { InviteTokenPage } from '@/features/invitations/InviteTokenPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { YourWorkPage } from '@/features/your-work/YourWorkPage'
import { HomePage } from '@/features/home/HomePage'

// Only sections with a real page are routed (ADR-019); new pages are added here
// together with their flag in src/lib/features.ts.
export const router = createBrowserRouter([
  { path: '/login', element: <AuthPage /> },
  // Public landing page for the link in an invitation email.
  { path: '/invites/:token', element: <InviteTokenPage /> },
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
          { path: 'notifications', element: <NotificationsPage /> },
          // Canonical path — the backend's invite emails link here.
          { path: 'invitations', element: <WorkspaceInvitesPage /> },
          {
            path: 'workspace-invites',
            element: <Navigate to="/invitations" replace />,
          },
          { path: 'projects/:id/work-items', element: <WorkItemsPage /> },
          { path: 'projects-list', element: <ProjectsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
