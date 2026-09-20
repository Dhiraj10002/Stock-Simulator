import { create } from "zustand";

interface UIStoreState {
  isOptionChainOpen: boolean;
  isPerformanceOpen: boolean;
  isSearchPaletteOpen: boolean;
  isOrderSheetOpen: boolean;
  isShortcutsGuideOpen: boolean;
  performanceInitialTab: "analytics" | "journal" | "statement";

  // Actions
  setOptionChainOpen: (open: boolean) => void;
  setPerformanceOpen: (
    open: boolean,
    initialTab?: "analytics" | "journal" | "statement"
  ) => void;
  setSearchPaletteOpen: (open: boolean) => void;
  setOrderSheetOpen: (open: boolean) => void;
  setShortcutsGuideOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  isOptionChainOpen: false,
  isPerformanceOpen: false,
  isSearchPaletteOpen: false,
  isOrderSheetOpen: false,
  isShortcutsGuideOpen: false,
  performanceInitialTab: "analytics",

  setOptionChainOpen: (open) => set({ isOptionChainOpen: open }),
  setPerformanceOpen: (open, initialTab = "analytics") =>
    set({
      isPerformanceOpen: open,
      performanceInitialTab: initialTab,
    }),
  setSearchPaletteOpen: (open) => set({ isSearchPaletteOpen: open }),
  setOrderSheetOpen: (open) => set({ isOrderSheetOpen: open }),
  setShortcutsGuideOpen: (open) => set({ isShortcutsGuideOpen: open }),
}));
