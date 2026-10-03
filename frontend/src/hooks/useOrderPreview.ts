"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";

export interface OrderPreview {
  quote_source?: string;
  quote_updated_at?: string;
  required_funds_paise: number;
  available_balance_paise: number;
  estimated_price_paise: number;
  sufficient_funds: boolean;
}

export function useOrderPreview(request: {symbol: string; side: string; type: string; product: string; quantity: number; price_paise: number; trigger_price_paise?: number}, enabled = true) {
  const token = useAuthToken();
  const query = useQuery<OrderPreview>({
    queryKey: ["order-preview", token, request],
    queryFn: () => apiFetch<OrderPreview>("/orders/preview", {method: "POST", body: JSON.stringify(request)}),
    enabled: enabled && !!token && !!request.symbol && request.quantity > 0,
    refetchInterval: 5000, retry: false,
  });
  return {...query, data: !query.isError && !query.isFetching ? query.data : undefined};
}
