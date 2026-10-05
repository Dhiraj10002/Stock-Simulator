"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Layers, Sparkles, TrendingUp } from "lucide-react";
import { publicFetch } from "@/lib/api";
import { formatPaise } from "@/lib/format";
import { displayQuote, futuresUnderlying } from "@/lib/fnoExplore";
import {
  eligibleEquities,
  equityUnderlying,
  featuredEquities,
  nativePreviewCandles,
  rankedEquities,
} from "@/lib/fnoStockOverview";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import { FnoMovement } from "./FnoQuoteDetails";
import type { Candle, Instrument, Quote } from "@/types";

import { tradingPanel, discoveryCard } from "@/components/shared/tradingStyles";
const panel = tradingPanel;
const muted = "text-slate-600 dark:text-slate-400";
const bounded = <T,>(path: string, signal: AbortSignal) =>
  publicFetch<T>(path, AbortSignal.any([signal, AbortSignal.timeout(8000)]));

function CandlePreview({
  symbol,
  active,
  now,
}: {
  symbol: string;
  active: boolean;
  now: number;
}) {
  const history = useQuery({
    queryKey: ["fno-equities", "daily-history", symbol],
    queryFn: async ({ signal }) => {
      const data = await bounded<
        (Candle & { source?: string; feed_mode?: string })[]
      >(
        `/market/quotes/${encodeURIComponent(symbol)}/history?interval=ONE_DAY&limit=5`,
        signal,
      );
      if (!Array.isArray(data))
        throw new Error("Native archive response invalid.");
      return data;
    },
    enabled: active,
    refetchInterval: active ? 60000 : false,
    retry: false,
  });
  const bars = nativePreviewCandles(
    history.isError ? [] : history.data || [],
    now,
  );
  if (!bars.length)
    return (
      <p
        className={`flex h-10 w-14 shrink-0 items-center justify-center text-center text-xs ${muted}`}
      >
        {history.isPending ? "Loading chart…" : "Chart unavailable"}
      </p>
    );
  const low = Math.min(...bars.map((b) => b.low_paise)),
    high = Math.max(...bars.map((b) => b.high_paise));
  const y = (price: number) =>
    45 - ((price - low) / Math.max(high - low, 1)) * 36;
  return (
    <svg
      role="img"
      aria-label={`${symbol} provider daily candles`}
      viewBox="0 0 110 52"
      className="h-10 w-14 shrink-0"
    >
      <title>
        Last {bars.length} available provider daily candles, ending{" "}
        {new Date(bars[bars.length - 1].timestamp * 1000).toLocaleString(
          "en-IN",
          { timeZone: "Asia/Kolkata" },
        )}{" "}
        IST
      </title>
      {bars.map((bar, index) => (
        <g
          key={bar.timestamp}
          className={
            bar.close_paise >= bar.open_paise
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }
        >
          <line
            x1={12 + index * 21}
            x2={12 + index * 21}
            y1={y(bar.high_paise)}
            y2={y(bar.low_paise)}
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x={8 + index * 21}
            y={Math.min(y(bar.open_paise), y(bar.close_paise))}
            width="8"
            height={Math.max(
              Math.abs(y(bar.open_paise) - y(bar.close_paise)),
              1.5,
            )}
            fill="currentColor"
            rx="1"
          />
        </g>
      ))}
    </svg>
  );
}

export default function FnoStockOverview({
  active,
  futures,
  now,
  onTrade,
}: {
  active: boolean;
  futures: Instrument[];
  now: number;
  sessionLive?: boolean;
  onTrade: (underlying: string) => void;
}) {
  const [direction, setDirection] = useState<"gainers" | "losers">("gainers");
  const catalog = useQuery({
    queryKey: ["fno-equities", "catalog"],
    queryFn: async ({ signal }) =>
      eligibleEquities(
        await bounded<unknown>("/instruments/derivative-stocks", signal),
      ),
    enabled: active,
    refetchInterval: active ? 60000 : false,
    retry: false,
  });
  const stocks = catalog.isError ? [] : catalog.data || [];
  const symbols = stocks.map((i) => i.symbol);
  const stream = useMultiSymbolQuotes(active ? symbols : []);
  const quotes = useQuery({
    queryKey: ["fno-equities", "quotes", symbols],
    queryFn: async ({ signal }) => {
      const chunks = Array.from(
        { length: Math.ceil(symbols.length / 100) },
        (_, i) => symbols.slice(i * 100, (i + 1) * 100),
      );
      const controller = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const result: Record<string, Quote> = {};
      for (let offset = 0; offset < chunks.length; offset += 3) {
        const data = await Promise.all(
          chunks
            .slice(offset, offset + 3)
            .map((chunk) =>
              publicFetch<Record<string, Quote>>(
                `/market/quotes/batch?symbols=${encodeURIComponent(chunk.join(","))}`,
                controller,
              ),
            ),
        );
        for (const batch of data) Object.assign(result, batch);
      }
      return result;
    },
    enabled: active && symbols.length > 0,
    refetchInterval: active ? 20000 : false,
    retry: false,
  });

  const display: Record<string, Quote | undefined> = {};
  for (const symbol of symbols) {
    const quote = displayQuote(
      quotes.data?.[symbol],
      stream[symbol],
      quotes.isError,
    );
    display[symbol] = quote?.source === "angelone_live" ? quote : undefined;
  }
  const featured = featuredEquities(stocks, display);
  const ranked = rankedEquities(stocks, display, direction, "");
  const visible = ranked.slice(0, 6);

  useTargetedSubscription(
    active ? [...featured, ...visible].map((i) => i.symbol) : [],
  );

  const currentFuture = (underlying: string) =>
    futures.find(
      (i) =>
        i.instrument_type === "FUTSTK" &&
        futuresUnderlying(i) === underlying &&
        Number.isSafeInteger(i.lot_size) &&
        i.lot_size > 0,
    );

  return (
    <div className="space-y-6">
      {/* Popular Stocks Header (Matches Screenshot 2 & 3) */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            Popular stocks
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Highest institutional weightage and investor interest
          </p>
        </div>
        <Link
          href="/stocks"
          className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
        >
          <span>See more</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 1. TOP 3 POPULAR STOCK CARDS (RELIANCE, HDFCBANK, TCS) */}
      <section aria-label="Featured F&O stocks" className="grid min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {featured.map((instrument) => {
          const underlying = equityUnderlying(instrument);
          const future = currentFuture(underlying);
          const quote = display[instrument.symbol];
          const lot = future?.lot_size || (underlying === "RELIANCE" ? 500 : underlying === "HDFCBANK" ? 550 : 225);
          return (
            <article
              key={instrument.symbol}
              aria-label={`${underlying} stock card`}
              className={discoveryCard}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/stocks/${encodeURIComponent(underlying)}`}
                      className="truncate text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                    >
                      {underlying}
                    </Link>
                    <span className="text-[10px] font-mono text-slate-400">
                      Futures lot: {lot}
                    </span>
                  </div>
                  <p
                    title={instrument.name}
                    className="mt-0.5 truncate text-[10px] text-slate-400 font-mono"
                  >
                    {instrument.name || underlying}
                  </p>
                </div>
                <CandlePreview
                  symbol={instrument.symbol}
                  active={active}
                  now={now}
                />
              </div>

              <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
                <div>
                  <div className="text-base font-black font-tabular text-slate-900 dark:text-slate-100">
                    {quote ? formatPaise(quote.price_paise) : "Unavailable"}
                  </div>
                  <div className="mt-0.5">
                    <FnoMovement quote={quote} compact />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/stocks/${encodeURIComponent(underlying)}`}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Chain</span>
                  </Link>
                  <button
                    aria-label={`Trade futures for ${underlying}`}
                    onClick={() => onTrade(underlying)}
                    className="px-2.5 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/60 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Trade</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* 2. F&O STOCKS TABLE (EXACTLY 6 ROWS, NO SEARCH, NO PAGINATION) */}
      <section
        aria-label="F&O stocks"
        className={`${panel} overflow-hidden p-5 space-y-4`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                F&O stocks
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Underlying stocks eligible for futures & options trading
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
              <span>1 Day</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </span>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
              {(["gainers", "losers"] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={direction === value}
                  onClick={() => setDirection(value)}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer capitalize font-bold ${
                    direction === value
                      ? value === "gainers"
                        ? "bg-emerald-500 text-white shadow-xs"
                        : "bg-rose-500 text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {value === "gainers" ? "Gainers" : "Losers"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {catalog.isError ? (
          <p
            role="alert"
            className="py-6 text-sm text-amber-800 dark:text-amber-300"
          >
            Eligible stock catalog unavailable.{" "}
            <button onClick={() => catalog.refetch()} className="underline">
              Retry stock catalog
            </button>
          </p>
        ) : catalog.isPending || (symbols.length > 0 && quotes.isPending) ? (
          <p role="status" className="py-6 text-sm text-slate-500">
            Loading provider stock quotes…
          </p>
        ) : !visible.length ? (
          <p role="status" className="py-8 text-center text-sm text-slate-500">
            No {direction} with available provider day movement.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="py-2.5 px-3">Stocks</th>
                  <th className="py-2.5 px-3 text-right">Price (LTP)</th>
                  <th className="py-2.5 px-3 text-right">1D Change</th>
                  <th className="py-2.5 px-3 text-right">Volume</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {visible.map((stock) => {
                  const underlying = equityUnderlying(stock);
                  const quote = display[stock.symbol]!;
                  const isGain = (quote?.change_percent ?? 0) >= 0;
                  const badge = underlying.slice(0, 2).toUpperCase();

                  return (
                    <tr
                      key={stock.symbol}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3 px-3">
                        <Link
                          href={`/stocks/${encodeURIComponent(underlying)}`}
                          className="flex items-center gap-2.5"
                        >
                          <span className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 font-bold text-xs flex items-center justify-center shrink-0">
                            {badge}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                              {stock.name || underlying}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {underlying} • {stock.exchange}
                            </div>
                          </div>
                        </Link>
                      </td>

                      <td className="py-3 px-3 text-right font-black font-tabular text-xs text-slate-900 dark:text-slate-100">
                        {quote ? formatPaise(quote.price_paise) : "Unavailable"}
                      </td>

                      <td className="py-3 px-3 text-right font-bold font-tabular text-xs">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                            isGain
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                              : "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isGain ? "+" : ""}
                          {quote?.change_paise !== undefined ? (quote.change_paise / 100).toFixed(2) : "0.00"} ({isGain ? "+" : ""}
                          {quote?.change_percent !== undefined ? quote.change_percent.toFixed(2) : "0.00"}%)
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {quote.volume_available !== false &&
                        Number.isFinite(quote.volume) &&
                        quote.volume! >= 0
                          ? quote.volume!.toLocaleString("en-IN")
                          : "—"}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => {
                            window.location.href = `/stocks/${encodeURIComponent(underlying)}`;
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-cyan-950/60 text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 font-semibold text-[11px] transition-colors inline-block cursor-pointer"
                        >
                          Trade Stock →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
