"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw, Search, TrendingUp } from "lucide-react";
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
import { FnoMovement, FnoProvenance } from "./FnoQuoteDetails";
import type { Candle, Instrument, Quote } from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-[#ffffff] shadow-sm dark:border-slate-800 dark:bg-[#0f172a]";
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
        className={`flex h-14 w-24 shrink-0 items-center justify-center text-center text-xs ${muted}`}
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
      className="h-14 w-24 shrink-0"
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
  sessionLive,
  onTrade,
}: {
  active: boolean;
  futures: Instrument[];
  now: number;
  sessionLive: boolean;
  onTrade: (underlying: string) => void;
}) {
  const [direction, setDirection] = useState<"gainers" | "losers">("gainers");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
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
      // At most three Redis-backed batches in flight; no per-symbol broker rescue.
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
  const ranked = rankedEquities(stocks, display, direction, search);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(ranked.length / 6) - 1),
  );
  const visible = ranked.slice(currentPage * 6, currentPage * 6 + 6);
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
  const coverage = stocks.filter((i) => display[i.symbol]).length;
  const refresh = () => {
    void catalog.refetch();
    if (symbols.length) void quotes.refetch();
  };
  return (
    <div className="space-y-5">
      <section
        aria-label="Featured F&O stocks"
        className="grid gap-4 md:grid-cols-3"
      >
        {featured.map((instrument) => {
          const underlying = equityUnderlying(instrument),
            future = currentFuture(underlying),
            quote = display[instrument.symbol];
          return (
            <article
              key={instrument.symbol}
              aria-label={`${underlying} stock card`}
              className={`${panel} min-w-0 p-4`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-bold">
                    {underlying}
                  </h3>
                  <p className={`mt-1 text-xs ${muted}`}>
                    Futures lot: {future?.lot_size || "Unavailable"}
                  </p>
                  <p
                    className={`mt-1 truncate text-xs ${muted}`}
                    title={instrument.name}
                  >
                    {instrument.name || instrument.display_symbol}
                  </p>
                </div>
                <CandlePreview
                  symbol={instrument.symbol}
                  active={active}
                  now={now}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {quote ? formatPaise(quote.price_paise) : "Unavailable"}
                  </p>
                  <FnoMovement quote={quote} />
                </div>
                <button
                  aria-label={`Trade futures for ${underlying}`}
                  disabled={!future}
                  title={
                    future
                      ? "View current canonical futures"
                      : "No current futures with a valid lot size"
                  }
                  onClick={() => onTrade(underlying)}
                  className="flex min-h-10 items-center gap-1 rounded-lg border border-cyan-300 bg-cyan-50 px-3 text-xs font-semibold text-cyan-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-200 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
                >
                  <TrendingUp aria-hidden className="h-4 w-4" />
                  Trade
                </button>
              </div>
              <div className="mt-2">
                <FnoProvenance
                  quote={quote}
                  now={now}
                  sessionLive={sessionLive}
                />
              </div>
            </article>
          );
        })}
      </section>
      <section
        aria-label="F&O stocks"
        className={`${panel} overflow-hidden p-4 sm:p-5`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <TrendingUp
                aria-hidden
                className="h-5 w-5 text-cyan-700 dark:text-cyan-400"
              />
              F&O Stocks
            </h2>
            <p className={`mt-1 text-xs ${muted}`}>
              Eligible underlying equities · provider day movement
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className={`mr-1 ${muted}`}>1 Day</span>
            {(["gainers", "losers"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={direction === value}
                onClick={() => {
                  setDirection(value);
                  setPage(0);
                }}
                className={`min-h-10 rounded-lg px-3 font-semibold ${direction === value ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                {value === "gainers" ? "Gainers" : "Losers"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 px-3 dark:border-slate-700">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              aria-label="Search F&O movers"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search eligible stocks"
              className="min-w-0 w-full bg-transparent py-2 text-xs outline-none"
            />
          </label>
          <button
            disabled={catalog.isFetching || quotes.isFetching}
            onClick={refresh}
            className={`flex min-h-10 items-center gap-1 text-xs font-semibold ${muted}`}
          >
            <RefreshCw aria-hidden className="h-4 w-4" />
            Refresh stocks
          </button>
        </div>
        <p className={`mt-3 text-xs ${muted}`}>
          {coverage} of {stocks.length} eligible equities have provider quotes.
          Rankings use available day movement
          {!sessionLive ? " · last available session" : ""}.
        </p>
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
          <p role="status" className={`py-6 text-sm ${muted}`}>
            Loading provider stock quotes…
          </p>
        ) : (
          <>
            {quotes.isError && (
              <p
                role="alert"
                className="mt-3 text-xs text-amber-800 dark:text-amber-300"
              >
                Stock quote refresh failed. Retained prices are last available.
              </p>
            )}
            {!visible.length ? (
              <p role="status" className={`py-8 text-center text-sm ${muted}`}>
                No {direction} with available provider day movement
                {search.trim() ? " match this search" : ""}.
              </p>
            ) : (
              <div
                role="region"
                aria-label="Stock movers table"
                tabIndex={0}
                className="mt-3 w-full overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-cyan-600"
              >
                <table className="w-full min-w-[590px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-3">Stocks</th>
                      <th className="px-3 py-3 text-right">Price (LTP)</th>
                      <th className="px-3 py-3 text-right">1D change</th>
                      <th className="px-3 py-3 text-right">Volume</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visible.map((stock) => {
                      const underlying = equityUnderlying(stock),
                        quote = display[stock.symbol]!,
                        future = currentFuture(underlying);
                      return (
                        <tr
                          key={stock.symbol}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-3 py-3">
                            <Link
                              href={`/stocks/${encodeURIComponent(underlying)}`}
                              className="flex items-center gap-3"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-xs font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
                                {underlying.slice(0, 2)}
                              </span>
                              <span>
                                <span className="block font-semibold">
                                  {stock.name || underlying}
                                </span>
                                <span className={`text-xs ${muted}`}>
                                  {underlying} · {stock.exchange}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-bold tabular-nums">
                              {formatPaise(quote.price_paise)}
                            </p>
                            <FnoProvenance
                              quote={quote}
                              now={now}
                              sessionLive={sessionLive}
                            />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <FnoMovement quote={quote} />
                          </td>
                          <td
                            className={`px-3 py-3 text-right text-xs tabular-nums ${muted}`}
                          >
                            {Number.isFinite(quote.volume) && quote.volume! >= 0
                              ? quote.volume!.toLocaleString("en-IN")
                              : "Unavailable"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              aria-label={`Trade futures for ${underlying}`}
                              disabled={!future}
                              onClick={() => onTrade(underlying)}
                              className="min-h-10 whitespace-nowrap text-xs font-semibold text-cyan-800 disabled:text-slate-500 dark:text-cyan-300"
                            >
                              Trade futures{" "}
                              <ArrowUpRight
                                aria-hidden
                                className="inline h-3.5 w-3.5"
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {ranked.length > 6 && (
              <nav
                aria-label="Stock movers pagination"
                className={`mt-4 flex flex-wrap items-center justify-between gap-2 text-xs ${muted}`}
              >
                <span>
                  {ranked.length} {direction} with available movement
                </span>
                <div className="flex items-center gap-3">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                    className="min-h-10 disabled:text-slate-400"
                  >
                    Previous movers
                  </button>
                  <span>
                    {currentPage + 1} / {Math.ceil(ranked.length / 6)}
                  </span>
                  <button
                    disabled={(currentPage + 1) * 6 >= ranked.length}
                    onClick={() => setPage(currentPage + 1)}
                    className="min-h-10 disabled:text-slate-400"
                  >
                    Next movers
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
