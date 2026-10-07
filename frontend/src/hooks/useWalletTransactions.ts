"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAccountPolling } from "@/hooks/useAccountPolling";
import type { Transaction } from "@/types";

export interface UseWalletTransactionsReturn {
  transactions: Transaction[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useWalletTransactions(tokenProp?: string): UseWalletTransactionsReturn {
  const { scope, interval } = useAccountPolling();
  const token = tokenProp !== undefined ? tokenProp : scope;

  const { data, isLoading, isError, error, refetch } = useQuery<Transaction[]>({
    queryKey: ["wallet-transactions", token],
    queryFn: ({ signal }) => apiFetch<Transaction[]>("/wallet/transactions", { signal }),
    enabled: !!token && token === scope,
    staleTime: 5000,
    refetchInterval: interval,
    refetchOnWindowFocus: true,
  });

  return {
    transactions: data || [],
    isLoading,
    isError,
    error,
    refetch,
  };
}
