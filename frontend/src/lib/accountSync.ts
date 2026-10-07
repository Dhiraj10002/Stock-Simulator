/** Account events are invalidation hints, never balances or authorization. */
export const accountPrefixes = new Set(["wallet", "portfolio", "orders", "trades", "wallet-transactions", "risk", "reports", "analytics"]);
export function isAccountQuery(key: readonly unknown[], scope: string): boolean {
  return !!scope && typeof key[0] === "string" && accountPrefixes.has(key[0]) && key.includes(scope);
}
export function isAccountMutation(path: string, method: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  if (path.split("?")[0] === "/orders/preview") return false;
  return /^\/(orders|wallet|simulation|portfolio|trades)(?:\/|\?|$)/.test(path);
}
export function accountPollingInterval(scope: string, healthy: boolean, hasPositions = false): number | false {
  return scope ? healthy && !hasPositions ? 30_000 : 5_000 : false;
}
export type AccountEvent = { kind: "ready" | "change" | "heartbeat" | "unavailable"; revision: string };
/** Incremental bounded SSE decoder. Handles frames split across network chunks. */
export function accountEventDecoder(emit: (event: AccountEvent) => void) {
  let pending = "";
  return (chunk: string) => {
    pending += chunk;
    // Normalize CRLF only after a complete pair (a trailing CR may be split).
    pending = pending.replace(/\r\n/g, "\n");
    for (;;) {
      const end = pending.indexOf("\n\n");
      if (end < 0) break;
      if (end > 16_384) throw new Error("Account event too large");
      const frame = pending.slice(0, end);
      pending = pending.slice(end + 2);
      const text = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (!text) continue;
      const value = JSON.parse(text) as AccountEvent;
      if (!["ready", "change", "heartbeat", "unavailable"].includes(value.kind) || !/^(0|[a-f0-9-]{36})$/i.test(value.revision)) throw new Error("Invalid account event");
      emit(value);
    }
    if (pending.length > 16_384) throw new Error("Account event too large");
  };
}
let healthyScope = "";
const listeners = new Set<() => void>();
export function setAccountStreamHealth(scope: string) {
  if (scope === healthyScope) return;
  healthyScope = scope;
  for (const listener of listeners) listener();
}
export function accountStreamHealthy(scope: string) { return !!scope && scope === healthyScope; }
export function subscribeAccountHealth(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyAccountMutation(scope: string) {
  if (!scope || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("account-changed", { detail: scope }));
  // Messages contain a non-secret cache scope only; every refetch is authenticated.
  try {
    const channel = new BroadcastChannel("stock-simulator-account");
    channel.postMessage({ scope });
    channel.close();
  } catch { /* Periodic reconciliation works if browser storage is restricted. */ }
}
