// Keep an exit intent through network errors and reloads. A new intent is allowed
// only after a terminal response, never simply because a request timed out.
export function exitRetryKey(storage: Pick<Storage, "getItem" | "setItem">, position: string, generate: () => string = () => crypto.randomUUID()): string {
  const name = `exit-retry:${position}`;
  const existing = storage.getItem(name);
  if (existing) return existing;
  const key = generate();
  storage.setItem(name, key);
  return key;
}

export function completeExitRetry(storage: Pick<Storage, "removeItem">, position: string, status?: string): void {
  if (status && ["EXECUTED", "CANCELLED", "REJECTED"].includes(status)) storage.removeItem(`exit-retry:${position}`);
}
