import { create } from "zustand";

interface UIStoreState {
  isSearchPaletteOpen: boolean;
  isShortcutsGuideOpen: boolean;
  setSearchPaletteOpen: (open: boolean) => void;
  setShortcutsGuideOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  isSearchPaletteOpen: false,
  isShortcutsGuideOpen: false,
  setSearchPaletteOpen: (open) => set({ isSearchPaletteOpen: open }),
  setShortcutsGuideOpen: (open) => set({ isShortcutsGuideOpen: open }),
}));
