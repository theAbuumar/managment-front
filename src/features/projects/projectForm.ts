import { transliterate } from '@/lib/translit'
import type { ProjectStatus, ProjectVisibility } from '@/api/project'

export interface ProjectFormValue {
  name: string
  identifier: string
  description: string
  status: ProjectStatus
  visibility: ProjectVisibility
  start: string
  target: string
  department_id: string
  lead_id: string
  icon: string
  color: string
  member_ids: string[]
}

export const EMPTY_PROJECT: ProjectFormValue = {
  name: '',
  identifier: '',
  description: '',
  status: 'active',
  visibility: 'public',
  start: '',
  target: '',
  department_id: '',
  lead_id: '',
  icon: '📁',
  color: '#3B82F6',
  member_ids: [],
}

export const ICONS = ['📁', '🎓', '📝', '💻', '🏫', '🔬', '👥', '📊', '🏛️', '📚', '🌍', '⚙️', '🏆', '💰']
export const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6B7280']
export const NONE = '__none__'

/** «Приёмная кампания 2027» → "PK2027"; «Цифровизация» → "TSIFRO". */
export function identifierFor(name: string): string {
  const words = transliterate(name).toUpperCase().match(/[A-Z0-9]+/g) ?? []
  if (words.length === 0) return ''
  if (words.length === 1) return words[0]!.slice(0, 6)
  const letters = words.filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('')
  const digits = words.filter((w) => /^\d+$/.test(w)).join('')
  return (letters + digits).slice(0, 10)
}

