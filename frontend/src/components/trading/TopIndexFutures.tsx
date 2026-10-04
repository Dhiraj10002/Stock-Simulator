"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { publicFetch } from "@/lib/api";
import { formatPaise } from "@/lib/format";
import {
  displayQuote,
  expiryLabel,
  futuresTradeBlock,
  futuresUnderlying,
  type FuturesMarketStatus,
} from "@/lib/fnoExplore";
import { useAuthToken } from "@/hooks/useAuthToken";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import { topIndexFutures } from "@/lib/fnoStockOverview";
import { FnoMovement, FnoProvenance } from "./FnoQuoteDetails";
import type { Instrument, Quote } from "@/types";

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
  const indices = contracts.filter((i) => i.instrument_type === "FUTIDX");
  const symbols = indices.map((i) => i.symbol);
  const token = useAuthToken();
  const stream = useMultiSymbolQuotes(active ? symbols : []);
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
    refetchInterval: active ? 20000 : false,
    retry: false,
  });
  const quotes: Record<string, Quote | undefined> = {};
  for (const symbol of symbols) {
    const q = displayQuote(query.data?.[symbol], stream[symbol], query.isError);
    quotes[symbol] = q?.source === "angelone_live" ? q : undefined;
  }
  const ranked = topIndexFutures(indices, quotes);
  const top = ranked.slice(0, 4);
  useTargetedSubscription(active ? top.map((i) => i.symbol) : []);
  const live =
    !!status &&
    status.status === "OPEN" &&
    status.is_open &&
    status.feed_provider === "angel_one" &&
    status.feed_state === "LIVE" &&
    !status.is_synthetic;
  return (
    <section aria-label="Top traded index futures">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Top traded index futures</h2>
        <span className="text-xs text-slate-600 dark:text-slate-400">
          By provider volume
        </span>
      </div>
      <p className="mb-3 text-[11px] text-slate-600 dark:text-slate-400">
        {ranked.length} of {indices.length} current index contracts have a
        positive provider volume{!live ? " · last available session" : ""}.
        Ranked within this available coverage.
        {top[0] &&
          ` Snapshot session: ${new Date(quotes[top[0].symbol]!.updated_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })} IST.`}
      </p>
      {top.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {top.map((instrument) => {
            const quote = quotes[instrument.symbol]!,
              block = futuresTradeBlock(instrument, quote, token, status, now);
            return (
              <article
                aria-label={`${instrument.symbol} top traded card`}
                key={`${instrument.exchange}:${instrument.token}`}
                className="flex min-h-[160px] min-w-0 flex-col justify-between rounded-2xl border border-slate-200 bg-[#ffffff] p-3.5 shadow-sm transition-colors hover:border-cyan-300 dark:border-slate-800 dark:bg-[#0f172a] dark:hover:border-cyan-800"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-[10px] font-extrabold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
                    {futuresUnderlying(instrument).slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <h3
                      className="truncate text-xs font-bold"
                      title={instrument.symbol}
                    >
                      {futuresUnderlying(instrument)}
                    </h3>
                    <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-400">
                      {expiryLabel(instrument.expiry)} · {instrument.exchange}
                    </p>
                  </div>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <p className="text-sm font-bold tabular-nums">
                      {formatPaise(quote.price_paise)}
                    </p>
                    <FnoMovement quote={quote} compact />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-400">
                    Vol {quote.volume!.toLocaleString("en-IN")} · Lot{" "}
                    {instrument.lot_size}
                  </p>
                </div>
                <div className="mt-2 flex items-end justify-between gap-1">
                  <FnoProvenance
                    quote={quote}
                    now={now}
                    sessionLive={live}
                    compact
                  />
                  <button
                    aria-label={`Trade ${instrument.symbol}`}
                    title={block || "Open paper order ticket"}
                    disabled={!!block}
                    onClick={() => onOrder(instrument, "BUY")}
                    className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-cyan-50 px-2 text-[11px] font-semibold text-cyan-800 disabled:opacity-40 dark:bg-cyan-950 dark:text-cyan-200"
                  >
                    Trade
                    <ArrowUpRight aria-hidden className="h-3 w-3" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p
          role="status"
          className="rounded-2xl border border-slate-200 bg-[#ffffff] p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-[#0f172a] dark:text-slate-400"
        >
          {query.isPending && symbols.length
            ? "Loading provider volumes…"
            : "Index futures volume is unavailable. Current contracts remain available in Browse futures."}
        </p>
      )}
      {query.isError && (
        <p
          role="alert"
          className="mt-2 text-xs text-amber-800 dark:text-amber-300"
        >
          Volume refresh failed. Retained snapshots keep their original
          timestamps.
        </p>
      )}
    </section>
  );
}
