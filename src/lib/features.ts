// Section flags (ADR-019). A section without a real page is hidden from every
// navigation list and has no route — the UI never shows "coming soon". Flip a flag
// to true in the same change that ships the page.
export const FEATURES = {
  drafts: false,
  trash: false,
  views: false,
  cycles: false,
  modules: false,
  analytics: false,
  ai: false,
  orgStructure: true,
  projectStates: false,
  projectMembers: false,
} as const

export type FeatureFlag = keyof typeof FEATURES

/** Keep only the items whose flag is on (items without a flag are always shown). */
export function enabled<T extends { feature?: FeatureFlag }>(items: T[]): T[] {
  return items.filter((item) => !item.feature || FEATURES[item.feature])
}
