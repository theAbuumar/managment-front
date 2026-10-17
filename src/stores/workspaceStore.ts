import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { WorkspaceData } from '@/api/workspace'

// The full workspace record (incl. timezone for deadlines, logo, settings).
type Workspace = WorkspaceData

interface WorkspaceState {
  workspace: Workspace | null
  workspaces: Workspace[]
  setWorkspace: (workspace: Workspace) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  addWorkspace: (workspace: Workspace) => void
  reset: () => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      workspace: null,
      workspaces: [],
      setWorkspace: (workspace) => set({ workspace }),
      setWorkspaces: (workspaces) => set({ workspaces }),
      addWorkspace: (workspace) =>
        set((s) => ({
          workspaces: s.workspaces.some((w) => w.id === workspace.id)
            ? s.workspaces
            : [...s.workspaces, workspace],
        })),
      reset: () => set({ workspace: null, workspaces: [] }),
    }),
    { name: 'workspace-storage' },
  ),
)
