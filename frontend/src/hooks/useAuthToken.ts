"use client";

import { useSyncExternalStore } from "react";
import { getAuthToken } from "@/lib/api";

function subscribe(listener: () => void) {
  window.addEventListener("auth-changed", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("auth-changed", listener);
    window.removeEventListener("storage", listener);
  };
}

// Hydration must begin with the same anonymous snapshot as the server.
const serverSnapshot = () => "";

export function useAuthToken() {
  return useSyncExternalStore(subscribe, getAuthToken, serverSnapshot);
}
