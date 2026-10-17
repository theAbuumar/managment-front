// How people are shown across the app (Ф3 3.F7): "Иванов И. И." in compact
// places, the full name on hover / in profiles. Falls back to display_name for
// accounts without ФИО (created before Ф3 or via a provider).

export interface PersonLike {
  display_name?: string | null
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
  email?: string | null
}

/** "Иванов Иван Иванович" */
export function fullName(p: PersonLike | null | undefined): string {
  if (!p) return ''
  const parts = [p.last_name, p.first_name, p.middle_name].filter((x) => x && x.trim())
  return parts.length > 0 ? parts.join(' ') : (p.display_name || p.email || '')
}

/** "Иванов И. И." — parsed from ФИО, or from a "Фамилия Имя Отчество" display_name. */
export function shortName(p: PersonLike | null | undefined): string {
  if (!p) return ''
  let last = p.last_name?.trim()
  let first = p.first_name?.trim()
  let middle = p.middle_name?.trim()
  if (!last && !first && p.display_name) {
    const words = p.display_name.trim().split(/\s+/)
    if (words.length >= 2) [last, first, middle] = words
    else return p.display_name
  }
  if (!last) return p.display_name || p.email || ''
  const initials = [first, middle]
    .filter((x): x is string => Boolean(x))
    .map((x) => `${x[0]!.toUpperCase()}.`)
    .join(' ')
  return initials ? `${last} ${initials}` : last
}

/** Two-letter avatar initials: «ИИ» from Иванов Иван. */
export function initials(p: PersonLike | null | undefined): string {
  if (!p) return '?'
  const last = p.last_name?.trim()
  const first = p.first_name?.trim()
  if (last && first) return `${last[0]}${first[0]}`.toUpperCase()
  const words = (p.display_name || p.email || '?').trim().split(/\s+/)
  return (words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : words[0]!.slice(0, 2)).toUpperCase()
}

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

/** Stable avatar colour per user id. */
export function avatarColor(id: string | null | undefined): string {
  if (!id) return PALETTE[0]!
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]!
}
