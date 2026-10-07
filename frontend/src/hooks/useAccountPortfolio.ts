"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { accountPollingInterval } from "@/lib/accountSync";
import { useAccountPolling } from "./useAccountPolling";
import type { Portfolio } from "@/types";

export function useAccountPortfolio(enabled = true) {
  const { scope, healthy } = useAccountPolling();
  const query = useQuery<Portfolio>({
    queryKey: ["portfolio", scope],
    queryFn: ({ signal }) => apiFetch<Portfolio>("/portfolio", { signal }),
    enabled: !!scope && enabled,
    refetchInterval: query => accountPollingInterval(scope, healthy, !query.state.data || query.state.data.positions.some(position => position.quantity !== 0)),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  // Preserve last positions for the unavailable/last-available UI. Consumers
  // must use isError and valuation_status before displaying authoritative P&L.
  return { ...query, data: scope ? query.data : undefined };
}
