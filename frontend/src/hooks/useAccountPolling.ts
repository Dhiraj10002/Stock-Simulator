"use client";
import { useSyncExternalStore } from "react";
import { useAuthToken } from "./useAuthToken";
import { accountPollingInterval, accountStreamHealthy, subscribeAccountHealth } from "@/lib/accountSync";

export function useAccountPolling() {
  const scope = useAuthToken();
  const healthy = useSyncExternalStore(subscribeAccountHealth, () => accountStreamHealthy(scope), () => false);
  return { scope, healthy, interval: accountPollingInterval(scope, healthy) };
}
