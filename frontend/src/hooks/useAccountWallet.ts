"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import type { Wallet } from "@/types";

// One authoritative wallet cache. Never seed it with demonstration capital,
// and never return a previous successful value after a failed refresh.
export function useAccountWallet() {
  const token = useAuthToken();
  const query = useQuery<Wallet>({
    queryKey: ["wallet", "authoritative", token],
    queryFn: () => apiFetch<Wallet>("/wallet"),
    enabled: !!token, refetchInterval: token ? 5000 : false, retry: false,
  });
  return { ...query, data: token && !query.isError ? query.data : undefined };
}
