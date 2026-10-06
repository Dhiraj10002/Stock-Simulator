import { create } from "zustand";

interface TradingStoreState {
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;
}

export const useTradingStore = create<TradingStoreState>((set) => ({
  selectedSymbol: "RELIANCE",
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol.toUpperCase() }),
}));
