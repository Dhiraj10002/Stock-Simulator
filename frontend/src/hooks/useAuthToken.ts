"use client";

import { useSyncExternalStore } from "react";
import { getAuthToken, purgeLegacyCredentials } from "@/lib/api";

function subscribe(listener: () => void) {
  purgeLegacyCredentials();
  const onStorage = (event: StorageEvent) => {
    if (event.key === "auth-session-change" || !event.key) {
      listener();
      setTimeout(listener, 25);
      setTimeout(listener, 100);
      setTimeout(listener, 250);
    }
  };
  window.addEventListener("auth-changed", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("auth-changed", listener);
    window.removeEventListener("storage", onStorage);
  };
}

// Hydration must begin with the same anonymous snapshot as the server.
const serverSnapshot = () => "";

export function useAuthToken() {
  return useSyncExternalStore(subscribe, getAuthToken, serverSnapshot);
}
