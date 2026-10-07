"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAccountPolling } from "@/hooks/useAccountPolling";
import type { Wallet } from "@/types";

// One authoritative wallet cache. Never seed it with demonstration capital,
// and never return a previous successful value after a failed refresh.
export function useAccountWallet() {
  const { scope: token, interval } = useAccountPolling();
  const query = useQuery<Wallet>({
    queryKey: ["wallet", "authoritative", token],
    queryFn: ({ signal }) => apiFetch<Wallet>("/wallet", { signal }),
    enabled: !!token, refetchInterval: interval, refetchIntervalInBackground: false, refetchOnWindowFocus: true, retry: false,
  });
  return { ...query, data: token && !query.isError ? query.data : undefined };
}
