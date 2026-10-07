"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthToken } from "@/hooks/useAuthToken";
import { getAuthToken, sessionFetch } from "@/lib/api";
import { accountEventDecoder, accountStreamHealthy, isAccountQuery, setAccountStreamHealth } from "@/lib/accountSync";

const visibleSnapshot = () => document.visibilityState !== "hidden";
const serverVisible = () => true;
function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
export function AccountSyncProvider({ children }: { children: React.ReactNode }) {
  const scope = useAuthToken();
  const visible = useSyncExternalStore(subscribeVisibility, visibleSnapshot, serverVisible);
  const queries = useQueryClient();
  useEffect(() => {
    if (!scope || !visible) return;
    const controller = new AbortController();
    let cursor = "";
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let healthTimer: ReturnType<typeof setTimeout> | undefined;
    let refetchTimer: ReturnType<typeof setTimeout> | undefined;
    let lastRefetch = 0;
    const active = () => !controller.signal.aborted && getAuthToken() === scope;
    const reconcile = () => {
      if (!active() || refetchTimer) return;
      // Coalesce local acceptance and server commit notifications into one pass.
      refetchTimer = setTimeout(() => {
        refetchTimer = undefined;
        if (!active()) return;
        lastRefetch = Date.now();
        void queries.invalidateQueries({ predicate: query => isAccountQuery(query.queryKey, scope), refetchType: "active" });
      }, Math.max(100, 400 - (Date.now() - lastRefetch)));
    };
    const healthy = () => {
      setAccountStreamHealth(scope);
      clearTimeout(healthTimer);
      healthTimer = setTimeout(() => { setAccountStreamHealth(""); reconcile(); }, 35_000);
    };
    const localChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === scope) reconcile();
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("stock-simulator-account");
      channel.onmessage = event => { if (event.data?.scope === scope) reconcile(); };
    } catch { /* A server stream and polling remain available. */ }
    window.addEventListener("account-changed", localChange);
    const connect = async () => {
      let ready = false;
      let failed = false;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const connection = new AbortController();
      // Require a first frame within 12s and a heartbeat within 35s.
      let watchdog = setTimeout(() => connection.abort(), 12_000);
      try {
        const response = await sessionFetch("/account/events", {
          signal: AbortSignal.any([controller.signal, connection.signal]),
          headers: { Accept: "text/event-stream" },
        });
        if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) throw new Error("Account stream unavailable");
        reader = response.body.getReader();
        const decode = new TextDecoder();
        const consume = accountEventDecoder(event => {
          if (!active()) return;
          if (event.kind === "unavailable") throw new Error("Account stream unavailable");
          clearTimeout(watchdog);
          watchdog = setTimeout(() => connection.abort(), 35_000);
          if (event.kind === "ready") {
            ready = true;
            retry = 0;
          }
          healthy();
          if (!cursor || cursor !== event.revision) reconcile();
          cursor = event.revision;
        });
        while (active()) {
          const { value, done } = await reader.read();
          if (done) break;
          consume(decode.decode(value, { stream: true }));
        }
        if (!ready) throw new Error("Missing account stream handshake");
      } catch {
        failed = true;
        if (active()) {
          const wasHealthy = accountStreamHealthy(scope);
          setAccountStreamHealth("");
          if (wasHealthy) reconcile();
        }
      } finally {
        clearTimeout(watchdog);
        if (reader) await reader.cancel().catch(() => {});
      }
      if (!active()) return;
      // Bounded sessions renew quietly; outages back off without a reconnect storm.
      const delay = failed ? Math.min(30_000, 1000 * 2 ** Math.min(retry++, 5)) * (0.75 + Math.random() * 0.5) : 250;
      reconnectTimer = setTimeout(() => { void connect(); }, delay);
    };
    reconcile(); // Focus/reconnect reconciles changes missed while hidden.
    void connect();
    return () => {
      controller.abort();
      clearTimeout(reconnectTimer);
      clearTimeout(healthTimer);
      clearTimeout(refetchTimer);
      channel?.close();
      window.removeEventListener("account-changed", localChange);
      setAccountStreamHealth("");
    };
  }, [scope, visible, queries]);
  return children;
}
