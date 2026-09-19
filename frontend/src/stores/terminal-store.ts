import { create } from "zustand";

export type TerminalProduct = "DELIVERY" | "INTRADAY" | "FNO";
export type TerminalDeskTab = "positions" | "orders" | "gtt" | "copilot" | "depth";

export interface ChartIndicators {
  vwap: boolean;
  ema9: boolean;
  ema21: boolean;
  sma50: boolean;
  bollinger: boolean;
}

interface TerminalStoreState {
  selectedSymbol: string;
  selectedProduct: TerminalProduct;
  selectedTimeframe: string;
  indicators: ChartIndicators;
  activeDeskTab: TerminalDeskTab;
  activeWatchlistId: number;

  // Actions
  setSelectedSymbol: (symbol: string) => void;
  setSelectedProduct: (product: TerminalProduct) => void;
  setSelectedTimeframe: (timeframe: string) => void;
  toggleIndicator: (indicator: keyof ChartIndicators) => void;
  setIndicators: (indicators: Partial<ChartIndicators>) => void;
  setActiveDeskTab: (tab: TerminalDeskTab) => void;
  setActiveWatchlistId: (id: number) => void;
}

export const useTerminalStore = create<TerminalStoreState>((set) => ({
  selectedSymbol: "RELIANCE",
  selectedProduct: "DELIVERY",
  selectedTimeframe: "1D",
  indicators: {
    vwap: true,
    ema9: false,
    ema21: false,
    sma50: false,
    bollinger: false,
  },
  activeDeskTab: "positions",
  activeWatchlistId: 1,

  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol.toUpperCase() }),
  setSelectedProduct: (product) => set({ selectedProduct: product }),
  setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),
  toggleIndicator: (indicator) =>
    set((state) => ({
      indicators: {
        ...state.indicators,
        [indicator]: !state.indicators[indicator],
      },
    })),
  setIndicators: (newIndicators) =>
    set((state) => ({
      indicators: {
        ...state.indicators,
        ...newIndicators,
      },
    })),
  setActiveDeskTab: (tab) => set({ activeDeskTab: tab }),
  setActiveWatchlistId: (id) => set({ activeWatchlistId: id }),
}));
