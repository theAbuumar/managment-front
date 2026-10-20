// Section flags (ADR-019). A section without a real page is hidden from every
// navigation list and has no route — the UI never shows "coming soon". Flip a flag
// to true in the same change that ships the page.
export const FEATURES = {
  drafts: true,
  trash: true,
  // Workspace feed (7.F9): admins and department heads.
  activity: true,
  views: true,
  // Этапы and модули of a project (4.F3, 4.F4).
  cycles: true,
  modules: true,
  analytics: true,
  // Written (Ф11); shown only when the server has AI on for me (stores/aiStore).
  ai: true,
  orgStructure: true,
  projectStates: true,
  projectMembers: true,
} as const

export type FeatureFlag = keyof typeof FEATURES

/** Keep only the items whose flag is on (items without a flag are always shown). */
export function enabled<T extends { feature?: FeatureFlag }>(items: T[]): T[] {
  return items.filter((item) => !item.feature || FEATURES[item.feature])
}
