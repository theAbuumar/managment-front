import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { create } from 'zustand'
import { getMySummary, type MySummary } from '@/api/control'
import { onApiMutation } from '@/api/client'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useRealtime, useRealtimeStatus } from '@/lib/realtime'

// "My work" counters for the sidebar (Ф5 5.F6) and the bell's unread count, from
// one COUNT-only request. AppShell keeps them fresh with useSummarySync(); the
// sidebar and the Topbar only read.

/** Fallback polling, only while the live stream (8.F1) is down. */
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

/** My role in the current workspace (from the summary); null until loaded. */
export function useMyRole() {
  return useMySummary()?.role ?? null
}

/** A guest only reads (12.B4): hide create and edit controls for them. */
export function useReadOnly(): boolean {
  return useMyRole() === 'guest'
}

/**
 * Load the counters and keep them current: on workspace switch, on navigation,
 * on every live event (a notification, a task changed by someone else), when the
 * tab regains focus, shortly after any own write to the API — and every minute
 * only while the live stream is down.
 */
export function useSummarySync() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const { pathname } = useLocation()
  // The effect's debounced reload, also triggered by live events.
  const reloadSoon = useRef<(() => void) | null>(null)
  useRealtime((m) => {
    if (!m.type.startsWith('comment.')) reloadSoon.current?.()
  })

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

    reloadSoon.current = soon
    void load()
    const poll = setInterval(() => {
      if (!useRealtimeStatus.getState().connected) void load()
    }, POLL_MS)
    const unsubscribe = onApiMutation((url) => {
      if (url.includes(`/workspaces/${slug}/`)) soon()
    })
    window.addEventListener('focus', soon)
    return () => {
      cancelled = true
      reloadSoon.current = null
      clearTimeout(timer)
      clearInterval(poll)
      unsubscribe()
      window.removeEventListener('focus', soon)
    }
  }, [slug, pathname])
}
