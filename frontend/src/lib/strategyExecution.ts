import type { Order } from "@/types";

export type StrategyLegRequest = { symbol: string; side: "BUY" | "SELL"; lotSize: number };
export type TrackedLeg = { symbol: string; side: "BUY" | "SELL"; quantity: number; uuid?: string; status: Order["status"] | "NOT_SUBMITTED" | "SUBMITTING" | "UNKNOWN"; error?: string };
export type StrategyTransport = { create: (leg: TrackedLeg) => Promise<Order>; read: (uuid: string) => Promise<Order> };
export const pendingStatus = (status: TrackedLeg["status"]) => ["PENDING", "OPEN", "TRIGGER_PENDING"].includes(status);
export const validLot = (lot: number) => Number.isSafeInteger(lot) && lot > 0;

// HTTP acceptance is not a fill. Never retry an uncertain POST or dispatch the next leg before a confirmed fill.
export async function executeStrategy(legs: StrategyLegRequest[], lots: number, transport: StrategyTransport, update: (rows: TrackedLeg[]) => void, options: { attempts?: number; wait?: () => Promise<void> } = {}) {
  if (!validLot(lots) || !legs.length || legs.some(leg => !leg.symbol || !validLot(leg.lotSize) || !Number.isSafeInteger(leg.lotSize * lots))) throw new Error("Canonical lot sizes and a positive whole number of lots are required.");
  const rows: TrackedLeg[] = legs.map(leg => ({ symbol: leg.symbol, side: leg.side, quantity: leg.lotSize * lots, status: "NOT_SUBMITTED" }));
  const emit = () => update(rows.map(row => ({ ...row })));
  emit();
  for (const row of rows) {
    row.status = "SUBMITTING"; emit();
    try {
      const placed = await transport.create(row);
      if (!placed.uuid) throw new Error("Order acceptance could not be identified; review Orders before retrying.");
      row.uuid = placed.uuid; row.status = placed.status; emit();
      for (let attempt = 0; pendingStatus(row.status) && attempt < (options.attempts ?? 20); attempt++) {
        await (options.wait?.() ?? new Promise(resolve => setTimeout(resolve, 1000)));
        const order = await transport.read(row.uuid);
        if (order.uuid !== row.uuid || order.symbol !== row.symbol) throw new Error("Order identity mismatch.");
        row.status = order.status; emit();
      }
    } catch (error) {
      if (!row.uuid) row.status = "UNKNOWN";
      row.error = error instanceof Error ? error.message : "Order status unavailable"; emit();
      break;
    }
    if (row.status !== "EXECUTED") break;
  }
  return rows;
}

// Used only to scope local recovery records. Server authentication remains authoritative.
export function strategyJournalKey(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.user_id === "string" && payload.user_id ? `paper-strategy:${payload.user_id}` : null;
  } catch { return null; }
}
