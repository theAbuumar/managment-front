import { useEffect } from 'react'
import { create } from 'zustand'
import { getAiStatus, type AiStatus } from '@/api/ai'
import { onApiMutation } from '@/api/client'
import { FEATURES } from '@/lib/features'
import { useWorkspaceStore } from '@/stores/workspaceStore'

// Is the AI assistant on for me in this workspace (Ф11, ADR-028)? The section
// flag says the pages exist; the server says whether AI runs here (AI_ENABLED)
// and whether I may use it (not a guest). Until the answer comes, AI is hidden —
// with AI off there is not a single AI element in the interface.

interface AiState {
  slug: string | null
  status: AiStatus | null
  set: (slug: string, status: AiStatus) => void
}

export const useAiStore = create<AiState>((set) => ({
  slug: null,
  status: null,
  set: (slug, status) => set({ slug, status }),
}))

/** The assistant's status in the current workspace; null while unknown. */
export function useAiStatus(): AiStatus | null {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  return useAiStore((s) => (s.slug === slug ? s.status : null))
}

/** Show AI elements: the section exists and the server has AI on for me. */
export function useAiEnabled(): boolean {
  const status = useAiStatus()
  return FEATURES.ai && status?.enabled === true
}

async function load(slug: string) {
  const status = await getAiStatus(slug).catch(() => null)
  if (status) useAiStore.getState().set(slug, status)
}

/** Reload the status (the requests left today) of the current workspace. */
export function refreshAiStatus(): void {
  const slug = useWorkspaceStore.getState().workspace?.slug
  if (slug && FEATURES.ai) void load(slug)
}

/** AppShell: load the status on workspace switch and after each AI request. */
export function useAiStatusSync(): void {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  useEffect(() => {
    if (!slug || !FEATURES.ai) return
    void load(slug)
    return onApiMutation((url) => {
      if (url.includes(`/workspaces/${slug}/`) && url.includes('/ai/'))
        void load(slug)
    })
  }, [slug])
}
