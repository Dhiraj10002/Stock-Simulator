import { create } from "zustand";
import { Quote } from "@/types";

export type MarketStatus = "OPEN" | "CLOSED" | "SYNTHETIC";
export type ConnectionState = "connected" | "connecting" | "disconnected";

interface MarketStoreState {
  quotes: Record<string, Quote>;
  marketStatus: MarketStatus;
  connectionState: ConnectionState;
  lastTickTimestamp: number | null;
  feedProvider: "Angel One" | "Synthetic" | "Offline";

  // Actions
  setQuotes: (quotes: Record<string, Quote>) => void;
  updateQuote: (quote: Quote) => void;
  setMarketStatus: (status: MarketStatus) => void;
  setConnectionState: (state: ConnectionState) => void;
  setLastTickTimestamp: (timestamp: number) => void;
  setFeedProvider: (provider: "Angel One" | "Synthetic" | "Offline") => void;
}

export const useMarketStore = create<MarketStoreState>((set) => ({
  quotes: {},
  marketStatus: "OPEN",
  connectionState: "disconnected",
  lastTickTimestamp: null,
  feedProvider: "Angel One",

  setQuotes: (quotes) => set({ quotes }),
  updateQuote: (quote) =>
    set((state) => ({
      quotes: {
        ...state.quotes,
        [quote.symbol]: quote,
      },
      lastTickTimestamp: Date.now(),
    })),
  setMarketStatus: (marketStatus) => set({ marketStatus }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setLastTickTimestamp: (lastTickTimestamp) => set({ lastTickTimestamp }),
  setFeedProvider: (feedProvider) => set({ feedProvider }),
}));
