"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useAuthToken } from "@/hooks/useAuthToken";
import { strategyJournalKey, type TrackedLeg } from "@/lib/strategyExecution";

const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("auth-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("auth-changed", callback);
  };
};
const empty = () => "[]";

// Preserve visibility of old option strategy submissions after removing the chain UI.
// Never replay a journal: Orders and Portfolio are the authoritative records.
export default function PaperOrderRecovery() {
  const token = useAuthToken();
  const key = token ? strategyJournalKey(token) : null;
  const snapshot = useCallback(() => {
    try {
      return key ? sessionStorage.getItem(key) || "[]" : "[]";
    } catch {
      return "[]";
    }
  }, [key]);
  const text = useSyncExternalStore(subscribe, snapshot, empty);
  let rows: TrackedLeg[] = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed))
      rows = parsed.filter(
        (row) =>
          row &&
          typeof row.symbol === "string" &&
          ["BUY", "SELL"].includes(row.side) &&
          Number.isSafeInteger(row.quantity) &&
          row.quantity > 0 &&
          [
            "EXECUTED",
            "PENDING",
            "OPEN",
            "REJECTED",
            "CANCELLED",
            "EXPIRED",
            "TRIGGER_PENDING",
            "NOT_SUBMITTED",
            "SUBMITTING",
            "UNKNOWN",
          ].includes(row.status),
      );
  } catch {
    /* Corrupt local data must not break the account view. */
  }
  if (!token || !rows.length) return null;
  return (
    <section
      aria-label="Strategy order recovery"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <h2 className="text-lg font-semibold">Previous strategy submissions</h2>
      <p className="mt-2 text-sm">
        These saved statuses may be outdated. Review Orders and your positions
        before placing another order. Uncertain submissions are never retried
        automatically.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((row, index) => (
          <li key={`${row.symbol}:${index}`} className="break-words">
            {row.side} {row.quantity} {row.symbol} ·{" "}
            <strong>{row.status}</strong>
            {row.uuid && <span> · {row.uuid}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/orders" className="underline">
          Review Orders
        </Link>
        <Link href="/portfolio" className="underline">
          Review / close positions
        </Link>
      </div>
    </section>
  );
}
