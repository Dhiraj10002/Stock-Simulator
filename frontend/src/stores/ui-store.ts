import { create } from "zustand";

interface UIStoreState {
  isSearchPaletteOpen: boolean;
  searchInitialQuery: string;
  isShortcutsGuideOpen: boolean;
  setSearchPaletteOpen: (open: boolean, initialQuery?: string) => void;
  setShortcutsGuideOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  isSearchPaletteOpen: false,
  searchInitialQuery: "",
  isShortcutsGuideOpen: false,
  setSearchPaletteOpen: (open, initialQuery = "") =>
    set({ isSearchPaletteOpen: open, searchInitialQuery: initialQuery }),
  setShortcutsGuideOpen: (open) => set({ isShortcutsGuideOpen: open }),
}));
