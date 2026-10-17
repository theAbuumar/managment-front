import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import {
  EventStreamContentType,
  fetchEventSource,
} from '@microsoft/fetch-event-source'
import { API_BASE_URL, onApiMutation, refreshSession } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

// Live updates over Server-Sent Events (Ф8 8.F1, ADR-010): one stream per tab
// for the current workspace, `GET WS/events`. Pages subscribe with
// `useRealtime()` and reload what an event touches; `resync` means events were
// missed (server restart, long disconnect) — reload everything shown.
//
// fetch-event-source is used instead of EventSource because it can send the
// Bearer header. It reconnects by itself and resends Last-Event-ID, so the
// backend replays what happened while the connection was down.

export type RealtimeEventType =
  | 'notification.created'
  | 'issue.created'
  | 'issue.updated'
  | 'issue.deleted'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'review.submitted'
  | 'review.approved'
  | 'review.returned'

export interface RealtimeEvent {
  id: string
  type: RealtimeEventType
  workspace_id: string
  issue_id: string | null
  project_id: string | null
  actor: { id: string; display_name: string } | null
  /** issue.updated: the fields that changed (absent for a reorder). */
  fields?: string[]
  notification_type?: string
  at: string
}

export type RealtimeMessage = RealtimeEvent | { type: 'resync' }

type Listener = (message: RealtimeMessage) => void
const listeners = new Set<Listener>()

/** Whether the stream is open; the sidebar counters poll only while it is not. */
export const useRealtimeStatus = create<{ connected: boolean }>(() => ({
  connected: false,
}))

/** Subscribe a component to live events of the current workspace. */
export function useRealtime(listener: Listener) {
  // The latest callback is called, so callers need no useCallback.
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => {
    const fn: Listener = (message) => latest.current(message)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
}

// This tab's own writes come back as events too; their effect is already on
// screen (the page applied the API response), so pages skip such echoes.
let lastOwnWrite = 0
onApiMutation(() => {
  lastOwnWrite = Date.now()
})

/** An event caused by the signed-in user from this very tab, a moment ago. */
export function isOwnEcho(event: RealtimeEvent): boolean {
  return (
    event.actor?.id === useAuthStore.getState().user?.id &&
    Date.now() - lastOwnWrite < 5000
  )
}

class RetriableError extends Error {}
class FatalError extends Error {}

const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 30_000

/**
 * Keep the stream of the current workspace open while signed in (mounted once,
 * in AppShell). Reconnects on workspace switch, renews an expired token.
 */
export function useRealtimeConnection() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const signedIn = useAuthStore((s) => Boolean(s.token))

  useEffect(() => {
    if (!slug || !signedIn) return
    const ctrl = new AbortController()
    let retry = RETRY_MIN_MS

    void fetchEventSource(`${API_BASE_URL}/workspaces/${slug}/events`, {
      signal: ctrl.signal,
      // Keep listening in a background tab: the bell and the title stay current.
      openWhenHidden: true,
      // The token is read on every (re)connect — it rotates every 15 minutes.
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string>),
            Authorization: `Bearer ${useAuthStore.getState().token ?? ''}`,
          },
        }),
      async onopen(res) {
        const type = res.headers.get('content-type') ?? ''
        if (res.ok && type.startsWith(EventStreamContentType)) {
          retry = RETRY_MIN_MS
          useRealtimeStatus.setState({ connected: true })
          return
        }
        if (res.status === 401) {
          // The access token expired: renew it, then reconnect.
          if (await refreshSession()) throw new RetriableError()
          throw new FatalError()
        }
        // Not a member any more / workspace gone: stop until the next switch.
        if (res.status === 403 || res.status === 404) throw new FatalError()
        throw new RetriableError()
      },
      onmessage(msg) {
        if (msg.event === 'ready' || !msg.event) return
        if (msg.event === 'resync') {
          listeners.forEach((fn) => fn({ type: 'resync' }))
          return
        }
        let event: RealtimeEvent
        try {
          event = JSON.parse(msg.data)
        } catch {
          return
        }
        listeners.forEach((fn) => fn(event))
      },
      onclose() {
        // The server ends the stream when the token expires — reconnect.
        useRealtimeStatus.setState({ connected: false })
        throw new RetriableError()
      },
      onerror(err) {
        useRealtimeStatus.setState({ connected: false })
        if (err instanceof FatalError) throw err
        const wait = retry
        retry = Math.min(retry * 2, RETRY_MAX_MS)
        return wait
      },
    }).catch(() => {
      // Fatal: stays offline; the counters fall back to polling.
    })

    return () => {
      ctrl.abort()
      useRealtimeStatus.setState({ connected: false })
    }
  }, [slug, signedIn])
}
