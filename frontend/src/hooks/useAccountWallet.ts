"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getAuthToken } from "@/lib/api";
import type { Wallet } from "@/types";

// One authoritative wallet cache. Never seed it with demonstration capital,
// and never return a previous successful value after a failed refresh.
export function useAccountWallet() {
  const [token, setToken] = useState(getAuthToken);
  useEffect(() => {
    const update = () => setToken(getAuthToken());
    window.addEventListener("auth-changed", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("auth-changed", update); window.removeEventListener("storage", update); };
  }, []);
  const query = useQuery<Wallet>({
    queryKey: ["wallet", "authoritative", token],
    queryFn: () => apiFetch<Wallet>("/wallet"),
    enabled: !!token, refetchInterval: token ? 5000 : false, retry: false,
  });
  return { ...query, data: token && !query.isError ? query.data : undefined };
}
