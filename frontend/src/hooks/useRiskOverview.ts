"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, getAuthToken } from "@/lib/api";
import type { RiskOverview } from "@/types";

export interface UseRiskOverviewReturn {
  overview: RiskOverview | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  status: "HEALTHY" | "WARNING" | "MARGIN_CALL" | "CRITICAL" | null;
  isHealthy: boolean;
  isWarning: boolean;
  isMarginCall: boolean;
  isCritical: boolean;
  isBreached: boolean; // true if WARNING, MARGIN_CALL, or CRITICAL
}

export function useRiskOverview(tokenProp?: string): UseRiskOverviewReturn {
  const token = tokenProp !== undefined ? tokenProp : getAuthToken();

  const { data, isLoading, isError, error, refetch } = useQuery<RiskOverview>({
    queryKey: ["risk-overview", token],
    queryFn: () => apiFetch<RiskOverview>("/risk/overview"),
    enabled: !!token,
    refetchInterval: 10000, // Poll every 10 seconds for live risk monitoring
    staleTime: 5000,
  });

  const overview = data ?? null;
  const status = overview?.status ?? null;

  const isHealthy = status === "HEALTHY";
  const isWarning = status === "WARNING";
  const isMarginCall = status === "MARGIN_CALL";
  const isCritical = status === "CRITICAL";
  const isBreached = isWarning || isMarginCall || isCritical;

  return {
    overview,
    isLoading,
    isError,
    error,
    refetch,
    status,
    isHealthy,
    isWarning,
    isMarginCall,
    isCritical,
    isBreached,
  };
}
