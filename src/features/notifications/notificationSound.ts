// The "new notification" chime (Ф8 8.F2): two soft sine notes synthesised with the
// Web Audio API, so there is no sound file to load and it works offline (13.D3).

let audio: AudioContext | null = null
/** Shared across tabs: a burst lands in every open tab, only one should chime. */
const LAST_PLAYED_KEY = 'notification-sound-at'
const QUIET_MS = 1500

function context(): AudioContext | null {
  if (audio) return audio
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  audio = Ctor ? new Ctor() : null
  return audio
}

function claimChime(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_PLAYED_KEY) ?? 0)
    const now = Date.now()
    if (now - last < QUIET_MS) return false
    localStorage.setItem(LAST_PLAYED_KEY, String(now))
  } catch {
    // Storage blocked (private mode): just play.
  }
  return true
}

/**
 * Play the chime. Browsers keep audio muted until the user has interacted with
 * the page; until then this is silently skipped. `force` (the "listen" button in
 * the profile) ignores the cross-tab quiet period.
 */
export function playNotificationSound(force = false) {
  // No click on the page yet: the browser would hold the sound until one, late.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive)
    return
  const ctx = context()
  if (!ctx || (!force && !claimChime())) return
  const requested = performance.now()
  void ctx
    .resume()
    .then(() => {
      if (ctx.state !== 'running' || performance.now() - requested > 1000)
        return
      const start = ctx.currentTime + 0.01
      for (const [freq, offset] of [
        [880, 0],
        [1318.5, 0.12],
      ] as const) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const t0 = start + offset
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t0)
        osc.stop(t0 + 0.4)
      }
    })
    .catch(() => {})
}
