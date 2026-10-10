"use client";
import { useQuery } from "@tanstack/react-query";
import { publicFetch } from "@/lib/api";
import type { FuturesMarketStatus } from "@/lib/fnoExplore";

// All consumers share a cache. The provider owns NSE polling; the F&O page
// owns NFO polling. Other consumers never create a second interval.
export const marketStatusKey = (segment: "NSE" | "NFO") => ["market-status", segment] as const;
export function useMarketStatus(segment: "NSE" | "NFO", enabled = true, poll = false) {
  return useQuery({
    queryKey: marketStatusKey(segment),
    queryFn: ({ signal }) => publicFetch<FuturesMarketStatus & { last_tick?: string }>(`/market/status?segment=${segment}`, AbortSignal.any([signal, AbortSignal.timeout(8000)])),
    enabled,
    staleTime: 10_000,
    refetchInterval: poll ? 15_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
