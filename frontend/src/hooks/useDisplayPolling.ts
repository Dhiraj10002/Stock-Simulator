"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useMarketStore } from "@/stores/market-store";
import { displayPollingInterval, sessionDisplayInterval } from "@/lib/displayPolling";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let unsubscribeStore: (() => void) | undefined;
function notify() { for (const listener of listeners) listener(); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    // One shared clock detects silent sockets. React only rerenders a consumer
    // when its interval changes, rather than on every tick or clock second.
    timer = setInterval(() => { if (!document.hidden) notify(); }, 1000);
    unsubscribeStore = useMarketStore.subscribe(notify);
    document.addEventListener("visibilitychange", notify);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      unsubscribeStore?.();
      document.removeEventListener("visibilitychange", notify);
    }
  };
}

export function useDisplayPolling(symbols: string[] | string | undefined, fallbackMs = 10_000) {
  const key = (typeof symbols === "string" ? [symbols] : symbols || []).join(",");
  const snapshot = useCallback(() => displayPollingInterval(useMarketStore.getState(), key.split(","), fallbackMs), [key, fallbackMs]);
  return useSyncExternalStore(subscribe, snapshot, () => fallbackMs);
}

export function useSessionDisplayPolling(fallbackMs: number) {
  const snapshot = useCallback(() => sessionDisplayInterval(useMarketStore.getState(), fallbackMs), [fallbackMs]);
  return useSyncExternalStore(subscribe, snapshot, () => fallbackMs);
}
