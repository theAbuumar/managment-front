import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { create } from 'zustand'
import { getMySummary, type MySummary } from '@/api/control'
import { onApiMutation } from '@/api/client'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useNotificationStore } from '@/stores/notificationStore'

// "My work" counters for the sidebar (Ф5 5.F6), from one COUNT-only request.
// AppShell keeps them fresh with useSummarySync(); the sidebar only reads.

const POLL_MS = 60_000

interface SummaryState {
  /** Counters of `slug`'s workspace; null until loaded. */
  summary: MySummary | null
  slug: string | null
  set: (slug: string, summary: MySummary) => void
}

export const useSummaryStore = create<SummaryState>((set) => ({
  summary: null,
  slug: null,
  set: (slug, summary) => set({ slug, summary }),
}))

/** Counters for the current workspace (null while another workspace's are shown). */
export function useMySummary(): MySummary | null {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  return useSummaryStore((s) => (s.slug === slug ? s.summary : null))
}

/**
 * Load the counters and keep them current: on workspace switch, on navigation,
 * every minute, when the tab regains focus, and shortly after any write to the
 * API (a task created, handed in, accepted…).
 */
export function useSummarySync() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const { pathname } = useLocation()

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const load = async () => {
      const summary = await getMySummary(slug).catch(() => null)
      if (cancelled || !summary) return
      useSummaryStore.getState().set(slug, summary)
      useNotificationStore
        .getState()
        .setUnreadCount(summary.unread_notifications)
    }
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(load, 400)
    }

    void load()
    const poll = setInterval(load, POLL_MS)
    const unsubscribe = onApiMutation((url) => {
      if (url.includes(`/workspaces/${slug}/`)) soon()
    })
    window.addEventListener('focus', soon)
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(poll)
      unsubscribe()
      window.removeEventListener('focus', soon)
    }
  }, [slug, pathname])
}
