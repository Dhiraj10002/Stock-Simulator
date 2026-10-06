"use client";
import { useSessionDisplayPolling } from "@/hooks/useDisplayPolling";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Zap } from "lucide-react";
import { publicFetch } from "@/lib/api";
import {
  displayQuote,
  expiryLabel,
  futuresTradeBlock,
  futuresUnderlying,
  futuresExpiry,
  type FuturesMarketStatus,
} from "@/lib/fnoExplore";
import { useAuthToken } from "@/hooks/useAuthToken";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import { topIndexFutures } from "@/lib/fnoStockOverview";
import { formatPaise } from "@/lib/format";
import { FnoMovement, FnoProvenance } from "./FnoQuoteDetails";
import type { Instrument, Quote } from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 shadow-xs";

export default function TopIndexFutures({
  contracts,
  active,
  now,
  status,
  onOrder,
}: {
  contracts: Instrument[];
  active: boolean;
  now: number;
  status?: FuturesMarketStatus;
  onOrder: (instrument: Instrument, side: "BUY" | "SELL") => void;
}) {
  const indices = useMemo(
    () => contracts.filter((i) => i.instrument_type === "FUTIDX"),
    [contracts],
  );
  const symbols = useMemo(() => indices.map((i) => i.symbol), [indices]);
  const token = useAuthToken();
  const stream = useMultiSymbolQuotes(active ? symbols : []);
  const aggregateInterval = useSessionDisplayPolling(20000);
  const query = useQuery({
    queryKey: ["top-index-futures-quotes", symbols],
    queryFn: async ({ signal }) => {
      const controller = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const result: Record<string, Quote> = {};
      const chunks = Array.from(
        { length: Math.ceil(symbols.length / 100) },
        (_, i) => symbols.slice(i * 100, (i + 1) * 100),
      );
      for (let offset = 0; offset < chunks.length; offset += 3) {
        const batches = await Promise.all(
          chunks
            .slice(offset, offset + 3)
            .map((chunk) =>
              publicFetch<Record<string, Quote>>(
                `/market/quotes/batch?symbols=${encodeURIComponent(chunk.join(","))}`,
                controller,
              ),
            ),
        );
        for (const batch of batches) Object.assign(result, batch);
      }
      return result;
    },
    enabled: active && symbols.length > 0,
    refetchInterval: active ? aggregateInterval : false,
    retry: false,
  });
  const quotes: Record<string, Quote | undefined> = {};
  for (const symbol of symbols) {
    const quote = displayQuote(
      query.data?.[symbol],
      stream[symbol],
      query.isError,
    );
    quotes[symbol] = quote?.source === "angelone_live" ? quote : undefined;
  }
  const ranked = topIndexFutures(indices, quotes).slice(0, 4);
  // Genuine master rows may be shown without a volume rank. Never invent tokens,
  // lot sizes, expiries or prices to fill a four-card layout.
  const displayed = ranked.length ? ranked : indices.slice(0, 4);
  useTargetedSubscription(active ? displayed.map((i) => i.symbol) : []);
  const sessionLive =
    !!status &&
    status.status === "OPEN" &&
    status.is_open &&
    status.feed_provider === "angel_one" &&
    status.feed_state === "LIVE" &&
    !status.is_synthetic;
  return (
    <section aria-label="Top traded index futures" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            Top traded index futures
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {ranked.length
              ? "Ranked by latest supplied session volume"
              : "Volume ranking unavailable · current master contracts"}
          </p>
        </div>
        <span className="text-xs text-slate-500 font-mono">Paper trading</span>
      </div>
      {query.isError && (
        <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">
          Index quote refresh failed. Retained prices are last available.
        </p>
      )}
      {!displayed.length && (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
          No current index futures available. Refresh the instrument master.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {displayed.map((inst) => {
          const quote = quotes[inst.symbol];
          const block = futuresTradeBlock(inst, quote, token, status, now);
          const month = new Date(futuresExpiry(inst.expiry)).toLocaleDateString(
            "en-IN",
            { month: "short", timeZone: "Asia/Kolkata" },
          );
          return (
            <article
              key={`${inst.exchange}:${inst.token}`}
              aria-label={`${inst.symbol} top traded card`}
              className={`${panel} min-w-0 p-3.5 hover:border-cyan-500/50 transition-all space-y-2 flex flex-col justify-between group`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-400">
                    INDEX FUT · {inst.exchange}
                  </span>
                  <h3 className="font-bold text-xs mt-1">
                    {futuresUnderlying(inst)}{" "}
                    {month !== "Invalid Date" ? month.toUpperCase() : ""} FUT
                  </h3>
                  <p
                    className="text-[10px] break-all text-slate-600 dark:text-slate-400"
                    title={inst.symbol}
                  >
                    {inst.symbol}
                  </p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400">
                    {expiryLabel(inst.expiry)} · Lot: {inst.lot_size}
                  </p>
                </div>
                <Zap className="w-4 h-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                <p className="text-sm font-black tabular-nums">
                  {quote ? formatPaise(quote.price_paise) : "Unavailable"}
                </p>
                <FnoMovement quote={quote} compact />
                <FnoProvenance
                  quote={quote}
                  now={now}
                  sessionLive={sessionLive}
                  compact
                />
              </div>
              <p className="text-[10px] text-slate-600 dark:text-slate-400">
                Volume:{" "}
                {quote?.volume_available !== false &&
                Number.isSafeInteger(quote?.volume)
                  ? quote!.volume!.toLocaleString("en-IN")
                  : "Unavailable"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["BUY", "SELL"] as const).map((side) => (
                  <button
                    key={side}
                    disabled={!!block}
                    aria-label={`${side === "BUY" ? "Trade" : "Sell"} ${inst.symbol}`}
                    onClick={() => onOrder(inst, side)}
                    title={block || "Open paper order ticket"}
                    className={`min-h-9 rounded-lg text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed ${side === "BUY" ? "bg-cyan-600 hover:bg-cyan-500" : "bg-rose-600 hover:bg-rose-500"}`}
                  >
                    {side === "BUY" ? "Buy" : "Sell"}
                  </button>
                ))}
              </div>
              {block && (
                <p className="text-[10px] text-slate-600 dark:text-slate-400">
                  {block}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
