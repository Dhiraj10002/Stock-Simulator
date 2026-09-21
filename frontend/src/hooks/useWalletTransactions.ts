"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, getAuthToken } from "@/lib/api";
import type { Transaction } from "@/types";

export interface UseWalletTransactionsReturn {
  transactions: Transaction[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useWalletTransactions(tokenProp?: string): UseWalletTransactionsReturn {
  const token = tokenProp !== undefined ? tokenProp : getAuthToken();

  const { data, isLoading, isError, error, refetch } = useQuery<Transaction[]>({
    queryKey: ["wallet-transactions", token],
    queryFn: () => apiFetch<Transaction[]>("/wallet/transactions"),
    enabled: !!token,
    staleTime: 5000,
    refetchInterval: 10000,
  });

  return {
    transactions: data || [],
    isLoading,
    isError,
    error,
    refetch,
  };
}
