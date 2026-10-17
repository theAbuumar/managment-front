// IANA time zones for the profile and workspace settings (Ф3 3.F1, 3.F2). The
// list comes from the browser's ICU data, labelled in Russian with the current
// UTC offset: "UTC+05:00 · Узбекистан, стандартное время".

export interface TimeZoneOption {
  id: string
  /** "UTC+05:00" at the current moment (DST-aware). */
  offset: string
  offsetMinutes: number
  /** Russian generic name, e.g. "Москва, стандартное время". */
  name: string
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function zonePart(id: string, style: 'longOffset' | 'longGeneric'): string {
  return (
    new Intl.DateTimeFormat('ru-RU', { timeZone: id, timeZoneName: style })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  )
}

function describe(id: string): TimeZoneOption | null {
  try {
    // "GMT+05:00" / "GMT-03:30" / "GMT" (zero offset).
    const raw = zonePart(id, 'longOffset')
    const m = /([+-])(\d{2}):(\d{2})/.exec(raw)
    const sign = m?.[1] === '-' ? -1 : 1
    const offsetMinutes = m ? sign * (Number(m[2]) * 60 + Number(m[3])) : 0
    const offset = m ? `UTC${m[1]}${m[2]}:${m[3]}` : 'UTC+00:00'
    return { id, offset, offsetMinutes, name: zonePart(id, 'longGeneric') }
  } catch {
    return null
  }
}

let cache: TimeZoneOption[] | null = null

/** All zones sorted by offset, then id. `extra` keeps a stored non-canonical id listed. */
export function listTimeZones(extra?: string | null): TimeZoneOption[] {
  if (!cache) {
    const ids = new Set(Intl.supportedValuesOf('timeZone'))
    ids.add('UTC')
    cache = [...ids]
      .map(describe)
      .filter((z): z is TimeZoneOption => z !== null)
      .sort(
        (a, b) => a.offsetMinutes - b.offsetMinutes || a.id.localeCompare(b.id),
      )
  }
  if (extra && !cache.some((z) => z.id === extra)) {
    const z = describe(extra)
    if (z) return [z, ...cache]
  }
  return cache
}

/** "UTC+05:00 · Узбекистан, стандартное время" */
export function timeZoneLabel(id: string): string {
  const z = describe(id)
  return z ? `${z.offset} · ${z.name}` : id
}
