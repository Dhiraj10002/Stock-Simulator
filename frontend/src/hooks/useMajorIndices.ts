"use client";

import { useQuery } from "@tanstack/react-query";
import { publicFetch } from "@/lib/api";
import { displayQuote } from "@/lib/fnoExplore";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import { useDisplayPolling } from "@/hooks/useDisplayPolling";
import type { Quote } from "@/types";

export const MAJOR_INDICES = [
  { name: "NIFTY 50", symbolKey: "NIFTY" },
  { name: "SENSEX", symbolKey: "SENSEX" },
  { name: "BANK NIFTY", symbolKey: "BANKNIFTY" },
  { name: "MIDCP NIFTY", symbolKey: "MIDCPNIFTY" },
  { name: "FIN NIFTY", symbolKey: "FINNIFTY" },
];

export const MAJOR_INDICES_SYMBOLS = MAJOR_INDICES.map((i) => i.symbolKey);

export function useMajorIndicesQuotes() {
  const stream = useMultiSymbolQuotes(MAJOR_INDICES_SYMBOLS);
  useTargetedSubscription(MAJOR_INDICES_SYMBOLS);
  const displayInterval = useDisplayPolling(MAJOR_INDICES_SYMBOLS);

  const query = useQuery({
    queryKey: ["indices-strip"],
    queryFn: ({ signal }) =>
      publicFetch<Record<string, Quote>>(
        `/market/quotes/batch?symbols=${encodeURIComponent(MAJOR_INDICES_SYMBOLS.join(","))}`,
        AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      ),
    refetchInterval: displayInterval,
    retry: false,
    staleTime: 5000,
  });

  const getQuote = (symbolKey: string): Quote | undefined => {
    const candidate = displayQuote(
      query.data?.[symbolKey],
      stream[symbolKey],
      query.isError,
    );
    return candidate?.source === "angelone_live" ? candidate : undefined;
  };

  return {
    getQuote,
    niftyQuote: getQuote("NIFTY"),
    sensexQuote: getQuote("SENSEX"),
    bankNiftyQuote: getQuote("BANKNIFTY"),
    midcpNiftyQuote: getQuote("MIDCPNIFTY"),
    finNiftyQuote: getQuote("FINNIFTY"),
    isLoading: query.isLoading,
    isError: query.isError,
    data: query.data,
  };
}
