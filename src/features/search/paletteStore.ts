import { create } from 'zustand'

/** Open state of the command palette (Ctrl+K), shared by the Topbar and the hotkeys. */
export const usePaletteStore = create<{
  open: boolean
  setOpen: (open: boolean) => void
}>((set) => ({ open: false, setOpen: (open) => set({ open }) }))

/** The shortcut hint for this system: ⌘K on a Mac, Ctrl K elsewhere. */
export function paletteShortcut(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'
}
