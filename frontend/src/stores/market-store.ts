import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import { Quote, Instrument } from "@/types";

export type MarketStatus = "PRE_OPEN" | "OPEN" | "POST_MARKET" | "CLOSED" | "HOLIDAY";
export type ConnectionState = "connected" | "connecting" | "disconnected";

export interface FeedStatus {
  feedProvider: "angel_one" | "synthetic" | "unknown" | "none";
  feedState: "LIVE" | "FALLBACK" | "CONNECTING" | "DISCONNECTED" | "RETRYING" | "STOPPED" | "UNAVAILABLE";
  isSynthetic: boolean;
  lastTick?: string | null;
  updatedAt?: string | null;
}

interface MarketStoreState {
  quotes: Record<string, Quote>;
  instruments: Record<string, Instrument>;
  instrumentList: Instrument[];
  marketStatus: MarketStatus;
  connectionState: ConnectionState;
  lastTickTimestamp: number | null;
  feedStatus: FeedStatus;
  feedProvider: "Angel One" | "Synthetic" | "Connecting" | "Offline";

  // Actions
  setQuotes: (quotes: Record<string, Quote>) => void;
  updateQuote: (quote: Quote) => void;
  setInstruments: (instruments: Instrument[]) => void;
  setMarketStatus: (status: MarketStatus) => void;
  setConnectionState: (state: ConnectionState) => void;
  setLastTickTimestamp: (timestamp: number) => void;
  setFeedStatus: (status: Partial<FeedStatus>) => void;
  setFeedProvider: (provider: "Angel One" | "Synthetic" | "Connecting" | "Offline") => void;
}

function deriveFeedProviderLegacy(feedStatus: FeedStatus, connectionState: ConnectionState): "Angel One" | "Synthetic" | "Connecting" | "Offline" {
  if (connectionState === "disconnected" || feedStatus.feedState === "DISCONNECTED" || feedStatus.feedState === "UNAVAILABLE") {
    return "Offline";
  }
  if (feedStatus.feedState === "CONNECTING") {
    return "Connecting";
  }
  if (feedStatus.feedProvider === "angel_one" && !feedStatus.isSynthetic) {
    return "Angel One";
  }
  return "Synthetic";
}

export const useMarketStore = create<MarketStoreState>((set) => ({
  quotes: {},
  instruments: {},
  instrumentList: [],
  marketStatus: "CLOSED",
  connectionState: "disconnected",
  lastTickTimestamp: null,
  feedStatus: {
    feedProvider: "unknown",
    feedState: "DISCONNECTED",
    isSynthetic: true,
    lastTick: null,
    updatedAt: null,
  },
  feedProvider: "Offline",

  setQuotes: (quotes) => set({ quotes }),
  setInstruments: (instrumentList) => {
    const map: Record<string, Instrument> = {};
    for (const inst of instrumentList) {
      map[inst.symbol.toUpperCase()] = inst;
      if (inst.display_symbol) {
        map[inst.display_symbol.toUpperCase()] = inst;
      }
    }
    set({ instruments: map, instrumentList });
  },
  updateQuote: (quote) =>
    set((state) => ({
      quotes: {
        ...state.quotes,
        [quote.symbol]: quote,
      },
      lastTickTimestamp: Date.now(),
    })),
  setMarketStatus: (marketStatus) => set({ marketStatus }),
  setConnectionState: (connectionState) =>
    set((state) => ({
      connectionState,
      feedProvider: deriveFeedProviderLegacy(state.feedStatus, connectionState),
    })),
  setLastTickTimestamp: (lastTickTimestamp) => set({ lastTickTimestamp }),
  setFeedStatus: (status) =>
    set((state) => {
      const nextStatus: FeedStatus = {
        ...state.feedStatus,
        ...status,
      };
      return {
        feedStatus: nextStatus,
        feedProvider: deriveFeedProviderLegacy(nextStatus, state.connectionState),
      };
    }),
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

/**
 * Multi-symbol selector — returns quotes only for the specified symbols.
 * Uses shallow equality to prevent re-renders when unrelated symbols change.
 * Use this instead of `(s) => s.quotes` in components displaying lists of stocks.
 */
export const useMultiSymbolQuotes = (symbols: string[]): Record<string, Quote> => {
  return useMarketStore(
    useShallow((state) => {
      const result: Record<string, Quote> = {};
      for (const sym of symbols) {
        const upper = sym.toUpperCase();
        const clean = upper.replace("-EQ", "");
        const q = state.quotes[clean] || state.quotes[upper];
        if (q) result[clean] = q;
      }
      return result;
    })
  );
};

/**
 * Hook to retrieve all active canonical instruments.
 */
export const useCanonicalInstruments = (): Instrument[] => {
  return useMarketStore((state) => state.instrumentList);
};

/**
 * Hook to look up a canonical instrument by symbol.
 */
export const useCanonicalInstrument = (symbol: string | undefined): Instrument | undefined => {
  return useMarketStore((state) => {
    if (!symbol) return undefined;
    const upper = symbol.toUpperCase();
    const clean = upper.replace("-EQ", "");
    return state.instruments[clean] || state.instruments[upper];
  });
};
