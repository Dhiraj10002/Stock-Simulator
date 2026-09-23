import { create } from "zustand";
import { Quote } from "@/types";

export type MarketStatus = "PRE_OPEN" | "OPEN" | "POST_MARKET" | "CLOSED" | "HOLIDAY";
export type ConnectionState = "connected" | "connecting" | "disconnected";

interface MarketStoreState {
  quotes: Record<string, Quote>;
  marketStatus: MarketStatus;
  connectionState: ConnectionState;
  lastTickTimestamp: number | null;
  feedProvider: "Angel One" | "Synthetic" | "Connecting" | "Offline";

  // Actions
  setQuotes: (quotes: Record<string, Quote>) => void;
  updateQuote: (quote: Quote) => void;
  setMarketStatus: (status: MarketStatus) => void;
  setConnectionState: (state: ConnectionState) => void;
  setLastTickTimestamp: (timestamp: number) => void;
  setFeedProvider: (provider: "Angel One" | "Synthetic" | "Connecting" | "Offline") => void;
}

export const useMarketStore = create<MarketStoreState>((set) => ({
  quotes: {},
  marketStatus: "CLOSED",
  connectionState: "disconnected",
  lastTickTimestamp: null,
  feedProvider: "Offline",

  setQuotes: (quotes) => set({ quotes }),
  updateQuote: (quote) =>
    set((state) => {
      let nextProvider = state.feedProvider;
      if (quote.source === "synthetic" || quote.source === "initial_seed") {
        nextProvider = "Synthetic";
      } else if (quote.source === "angelone_live") {
        nextProvider = "Angel One";
      }

      return {
        quotes: {
          ...state.quotes,
          [quote.symbol]: quote,
        },
        feedProvider: nextProvider,
        lastTickTimestamp: Date.now(),
      };
    }),
  setMarketStatus: (marketStatus) => set({ marketStatus }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setLastTickTimestamp: (lastTickTimestamp) => set({ lastTickTimestamp }),
  setFeedProvider: (feedProvider) => set({ feedProvider }),
}));

/**
 * Symbol-specific selector to prevent broad re-renders across the whole application.
 * Only triggers a re-render when this specific symbol's quote changes.
 */
export const useSymbolQuote = (symbol: string | undefined): Quote | undefined => {
  return useMarketStore((state) => {
    if (!symbol) return undefined;
    const upper = symbol.toUpperCase();
    const clean = upper.replace("-EQ", "");
    return state.quotes[clean] || state.quotes[upper];
  });
};

