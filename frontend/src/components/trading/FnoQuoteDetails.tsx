import type { Quote } from "@/types";
import { dayMovement } from "@/lib/marketDisplay";
import { quoteLabel } from "@/lib/marketData";

export function FnoMovement({ quote }: { quote?: Quote }) {
  const movement = quote && dayMovement(quote);
  return (
    <p
      className={`text-xs font-semibold tabular-nums ${movement && movement.percent > 0 ? "text-emerald-700 dark:text-emerald-400" : movement && movement.percent < 0 ? "text-rose-700 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"}`}
    >
      {movement
        ? `${movement.change > 0 ? "+" : ""}${movement.change.toFixed(2)} (${movement.percent > 0 ? "+" : ""}${movement.percent.toFixed(2)}%)`
        : "Day change unavailable"}
    </p>
  );
}

export function FnoProvenance({
  quote,
  now,
  sessionLive,
}: {
  quote?: Quote;
  now: number;
  sessionLive: boolean;
}) {
  const live = sessionLive && quoteLabel(quote, now) === "LIVE";
  const age = quote
    ? Math.max(0, Math.floor((now - Date.parse(quote.updated_at)) / 1000))
    : undefined;
  return (
    <div className="text-xs leading-5">
      <p
        className={`font-medium ${live ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}`}
      >
        {live
          ? "Angel One · Live"
          : !quote
            ? "Quote unavailable"
            : quote.source !== "angelone_live"
              ? "Simulated data"
              : "Angel One · Last available"}
      </p>
      {quote && (
        <p
          className="text-slate-600 dark:text-slate-400"
          title={`${quote.source} · ${quote.updated_at}`}
        >
          As of{" "}
          {new Date(quote.updated_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          IST{live && age !== undefined ? ` · ${age}s ago` : ""}
        </p>
      )}
    </div>
  );
}
