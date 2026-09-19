import { create } from "zustand";

interface UIStoreState {
  isOptionChainOpen: boolean;
  isPerformanceOpen: boolean;
  isSearchPaletteOpen: boolean;
  isOrderSheetOpen: boolean;
  performanceInitialTab: "analytics" | "journal" | "contract-notes" | "statement";

  // Actions
  setOptionChainOpen: (open: boolean) => void;
  setPerformanceOpen: (
    open: boolean,
    initialTab?: "analytics" | "journal" | "contract-notes" | "statement"
  ) => void;
  setSearchPaletteOpen: (open: boolean) => void;
  setOrderSheetOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  isOptionChainOpen: false,
  isPerformanceOpen: false,
  isSearchPaletteOpen: false,
  isOrderSheetOpen: false,
  performanceInitialTab: "analytics",

  setOptionChainOpen: (open) => set({ isOptionChainOpen: open }),
  setPerformanceOpen: (open, initialTab = "analytics") =>
    set({
      isPerformanceOpen: open,
      performanceInitialTab: initialTab,
    }),
  setSearchPaletteOpen: (open) => set({ isSearchPaletteOpen: open }),
  setOrderSheetOpen: (open) => set({ isOrderSheetOpen: open }),
}));
