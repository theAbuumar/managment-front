import { useCallback, useState } from 'react'

// Drafts of what a person types (12.F5): a comment, a report, a reason. Kept in
// localStorage per user and task until it is sent, so a lost connection, a
// reload or a closed dialog never throws the text away. Cleared on sign-out.

const PREFIX = 'draft:'

function read(key: string | null): string {
  if (!key) return ''
  try {
    return localStorage.getItem(PREFIX + key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string | null, value: string) {
  if (!key) return
  try {
    if (value) localStorage.setItem(PREFIX + key, value)
    else localStorage.removeItem(PREFIX + key)
  } catch {
    // Storage unavailable (private mode, quota) — the text stays in the field.
  }
}

/**
 * A text field's value that survives reloads, keyed e.g. `${userId}:comment:${issueId}`
 * (null — not saved). Returns the value, a setter and `clear` for after sending.
 */
export function useDraft(
  key: string | null,
): [string, (value: string) => void, () => void] {
  const [state, setState] = useState(() => ({ key, value: read(key) }))
  // Another task (key) opened in the same component: show its own draft.
  let current = state
  if (state.key !== key) {
    current = { key, value: read(key) }
    setState(current)
  }
  const set = useCallback(
    (value: string) => {
      setState({ key, value })
      write(key, value)
    },
    [key],
  )
  const clear = useCallback(() => set(''), [set])
  return [current.value, set, clear]
}

/** Remove every saved draft (on sign-out: they may be private). */
export function clearDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k)
    }
  } catch {
    // Storage unavailable — nothing was saved either.
  }
}
