import { create } from 'zustand'

// Whether the server is reachable (12.F5). A request that gets no answer (or a
// 502/503/504 from the proxy while the API restarts) marks the app offline: a
// banner appears, reads wait for the connection and are repeated, and a probe
// checks the server with a growing pause until it answers again. The browser's
// own offline/online events feed the same state.

export const useConnection = create<{
  online: boolean
  /** When the current (or last) outage began, ms since epoch. */
  since: number
}>(() => ({ online: true, since: 0 }))

/** How the probe reaches the server; set by the API client (avoids an import cycle). */
let probeRequest: (() => Promise<boolean>) | null = null
export function setConnectionProbe(probe: () => Promise<boolean>) {
  probeRequest = probe
}

const PROBE_MIN_MS = 2000
const PROBE_MAX_MS = 10000
let probeTimer: ReturnType<typeof setTimeout> | null = null
let probeDelay = PROBE_MIN_MS
const waiters = new Set<() => void>()

function scheduleProbe(delay: number) {
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = setTimeout(() => void probe(), delay)
}

async function probe() {
  probeTimer = null
  if (useConnection.getState().online) return
  const ok = await (probeRequest?.() ?? Promise.resolve(false)).catch(
    () => false,
  )
  if (ok) {
    markOnline()
    return
  }
  probeDelay = Math.min(probeDelay * 2, PROBE_MAX_MS)
  scheduleProbe(probeDelay)
}

/** A request got no answer from the server. */
export function markOffline() {
  if (!useConnection.getState().online) return
  useConnection.setState({ online: false, since: Date.now() })
  probeDelay = PROBE_MIN_MS
  scheduleProbe(probeDelay)
}

/** The server answered: wake everything that waits for the connection. */
export function markOnline() {
  if (useConnection.getState().online) return
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = null
  useConnection.setState({ online: true })
  waiters.forEach((wake) => wake())
  waiters.clear()
}

/** Check the server right now (the banner's «Повторить» button). */
export function retryNow() {
  if (useConnection.getState().online) return
  probeDelay = PROBE_MIN_MS
  scheduleProbe(0)
}

/** Resolves true once the server answers again, false after `timeoutMs`. */
export function waitForOnline(timeoutMs: number): Promise<boolean> {
  if (useConnection.getState().online) return Promise.resolve(true)
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      waiters.delete(wake)
      resolve(false)
    }, timeoutMs)
    waiters.add(wake)
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', markOffline)
  window.addEventListener('online', retryNow)
}
