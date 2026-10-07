// Persist an uncertain order intent through network failure and reload. No tokens
// or fill prices are stored. A confirmed acceptance completes that intent.
export function orderIntentKey(storage: Pick<Storage, "getItem" | "setItem">, scope: string, payload: string, generate = () => crypto.randomUUID()) {
  const name = `order-intent:${scope}:${payload}`;
  const existing = storage.getItem(name);
  if (existing) return existing;
  const key = generate(); storage.setItem(name, key); return key;
}
export function completeOrderIntent(storage: Pick<Storage, "removeItem">, scope: string, payload: string) {
  storage.removeItem(`order-intent:${scope}:${payload}`);
}
