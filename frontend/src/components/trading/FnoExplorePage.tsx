"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Layers,
  Search,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { publicFetch, apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { formatPaise } from "@/lib/format";
import { dayMovement } from "@/lib/marketDisplay";
import { quoteLabel } from "@/lib/marketData";
import {
  derivativePnl,
  displayQuote,
  isDerivativePosition,
  rankStocks,
  sortedFutures,
  underlyingSymbol,
} from "@/lib/fnoExplore";
import {
  useMarketStore,
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import FnoOrderModal from "@/components/trading/FnoOrderModal";
import type { Candle, Instrument, Portfolio, Quote } from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-900/70";
const muted = "text-slate-500 dark:text-slate-400";

async function fetchFutures(underlying?: string, type?: "FUTSTK" | "FUTIDX") {
  const params = new URLSearchParams({
    active: "true",
    limit: "500",
    instrument_type: type || "FUTSTK",
  });
  if (underlying) params.set("underlying", underlying);
  return sortedFutures(
    await publicFetch<Instrument[]>(`/instruments?${params}`),
  );
}

function useDisplayQuotes(symbols: string[], key: string) {
  const stream = useMultiSymbolQuotes(symbols);
  const request = useQuery({
    queryKey: ["fno-explore-quotes", key, symbols],
    enabled: symbols.length > 0,
    queryFn: async () => {
      const quotes: Record<string, Quote> = {};
      for (let offset = 0; offset < symbols.length; offset += 100) {
        Object.assign(
          quotes,
          await publicFetch<Record<string, Quote>>(
            `/market/quotes/batch?symbols=${encodeURIComponent(symbols.slice(offset, offset + 100).join(","))}`,
          ),
        );
      }
      return quotes;
    },
    refetchInterval: 10000,
    retry: false,
  });
  const quotes: Record<string, Quote | undefined> = {};
  for (const symbol of symbols)
    quotes[symbol] = displayQuote(
      request.data?.[symbol],
      stream[symbol],
      request.isError,
    );
  return { ...request, quotes };
}

function QuoteState({ quote }: { quote?: Quote }) {
  const state = quoteLabel(quote);
  const color =
    state === "LIVE"
      ? "text-emerald-600 dark:text-emerald-400"
      : state === "UNAVAILABLE"
        ? muted
        : "text-amber-700 dark:text-amber-400";
  return (
    <span
      title={
        quote
          ? `${quote.source} · ${quote.updated_at}`
          : "Waiting for a provider quote"
      }
      className={`text-[10px] font-bold ${color}`}
    >
      {state === "LAST AVAILABLE"
        ? "Last available"
        : state === "UNAVAILABLE"
          ? "Unavailable"
          : state === "SIMULATED"
            ? "Simulated"
            : "Angel One · Live"}
      {quote && (
        <span className="ml-1 font-normal">
          ·{" "}
          {new Date(quote.updated_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          IST
        </span>
      )}
    </span>
  );
}

function Movement({ quote }: { quote?: Quote }) {
  const movement = quote && dayMovement(quote);
  if (!movement)
    return <span className={`text-xs ${muted}`}>Day change unavailable</span>;
  return (
    <span
      className={`text-xs font-bold ${movement.percent > 0 ? "text-emerald-600 dark:text-emerald-400" : movement.percent < 0 ? "text-rose-600 dark:text-rose-400" : muted}`}
    >
      {movement.change > 0 ? "+" : ""}
      {movement.change.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}{" "}
      ({movement.percent > 0 ? "+" : ""}
      {movement.percent.toFixed(2)}%)
    </span>
  );
}

// Small candle previews use the native daily archive, never generated trends.
function CandlePreview({ symbol }: { symbol: string }) {
  const history = useQuery({
    queryKey: ["fno-card-history", symbol],
    queryFn: () =>
      publicFetch<Candle[]>(
        `/market/quotes/${encodeURIComponent(symbol)}/history?interval=ONE_DAY&limit=5`,
      ),
    staleTime: 60000,
    retry: false,
  });
  const bars = history.isError
    ? []
    : (history.data || [])
        .filter(
          (bar) =>
            [
              bar.timestamp,
              bar.open_paise,
              bar.high_paise,
              bar.low_paise,
              bar.close_paise,
            ].every(Number.isFinite) &&
            bar.low_paise > 0 &&
            bar.high_paise >= Math.max(bar.open_paise, bar.close_paise) &&
            bar.low_paise <= Math.min(bar.open_paise, bar.close_paise),
        )
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-5);
  if (!bars.length)
    return (
      <span className={`text-[10px] ${muted}`}>
        {history.isLoading ? "Loading chart…" : "Chart unavailable"}
      </span>
    );
  const low = Math.min(...bars.map((bar) => bar.low_paise));
  const high = Math.max(...bars.map((bar) => bar.high_paise));
  const y = (price: number) =>
    44 - ((price - low) / Math.max(high - low, 1)) * 36;
  return (
    <svg
      role="img"
      aria-label={`${symbol} daily candle preview`}
      viewBox="0 0 110 52"
      className="h-14 w-28 shrink-0"
    >
      <title>Last {bars.length} available daily candles</title>
      {bars.map((bar, index) => (
        <g
          key={`${bar.timestamp}:${index}`}
          className={
            bar.close_paise >= bar.open_paise
              ? "text-emerald-500"
              : "text-rose-500"
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

function StockCard({
  instrument,
  quote,
  onChain,
  onTrade,
}: {
  instrument: Instrument;
  quote?: Quote;
  onChain: (symbol: string) => void;
  onTrade: (symbol: string) => void;
}) {
  const symbol = underlyingSymbol(instrument);
  const futures = useQuery({
    queryKey: ["fno-explore-futures", symbol, "FUTSTK"],
    queryFn: () => fetchFutures(symbol),
    staleTime: 60000,
    retry: false,
  });
  const lot = futures.isError ? undefined : futures.data?.[0]?.lot_size;
  return (
    <article aria-label={`${symbol} stock card`} className={`${panel} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-extrabold">{symbol}</h3>
            <span className={`text-[10px] font-mono ${muted}`}>
              Futures lot: {lot && lot > 0 ? lot : "Unavailable"}
            </span>
          </div>
          <p className={`mt-1 truncate text-xs ${muted}`}>
            {instrument.name || instrument.display_symbol}
          </p>
        </div>
        <CandlePreview symbol={instrument.symbol} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div>
          <p className="text-lg font-black tabular-nums">
            {quote ? formatPaise(quote.price_paise) : "Unavailable"}
          </p>
          <Movement quote={quote} />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onChain(symbol)}
            className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
          >
            <Layers className="h-3.5 w-3.5" />
            Chain
          </button>
          <button
            onClick={() => onTrade(symbol)}
            className="flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-bold text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Trade
          </button>
        </div>
      </div>
      <div className="mt-2">
        <QuoteState quote={quote} />
      </div>
    </article>
  );
}

function FutureCard({
  instrument,
  quote,
  canTrade,
  onOrder,
}: {
  instrument: Instrument;
  quote?: Quote;
  canTrade: boolean;
  onOrder: (instrument: Instrument, side: "BUY" | "SELL") => void;
}) {
  return (
    <article
      aria-label={`${instrument.symbol} futures card`}
      className={`${panel} p-4`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
          {instrument.instrument_type === "FUTIDX" ? "INDEX FUT" : "STOCK FUT"}
        </span>
        <span className={`text-[10px] ${muted}`}>{instrument.exchange}</span>
      </div>
      <h3 className="text-xs font-extrabold">
        {instrument.display_symbol || instrument.symbol}
      </h3>
      <p className={`mt-1 text-[10px] font-mono ${muted}`}>
        Expiry: {instrument.expiry} · Lot: {instrument.lot_size}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div>
          <p className="text-base font-black tabular-nums">
            {quote ? formatPaise(quote.price_paise) : "Unavailable"}
          </p>
          <Movement quote={quote} />
        </div>
        <div className="flex gap-1.5">
          {(["BUY", "SELL"] as const).map((side) => (
            <button
              key={side}
              aria-label={`${side === "BUY" ? "Buy" : "Sell"} ${instrument.symbol}`}
              disabled={!canTrade}
              title={
                canTrade
                  ? "Open paper order ticket"
                  : "Open exchange session and a fresh provider quote are required"
              }
              onClick={() => onOrder(instrument, side)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${side === "BUY" ? "bg-cyan-600 hover:bg-cyan-500" : "bg-rose-600 hover:bg-rose-500"}`}
            >
              {side === "BUY" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <QuoteState quote={quote} />
      </div>
      <p className={`mt-2 text-[10px] ${muted}`}>
        OI:{" "}
        {quote?.open_interest_available && Number.isFinite(quote.open_interest)
          ? quote.open_interest!.toLocaleString("en-IN")
          : "Unavailable"}
      </p>
    </article>
  );
}

export default function FnoExplorePage({
  onSelectOptionChain,
  onViewPositions,
}: {
  onSelectOptionChain?: (symbol: string) => void;
  onViewPositions?: () => void;
} = {}) {
  const [underlying, setUnderlying] = useState("NIFTY");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "gainers" | "losers">(
    "all",
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const stocks = useQuery({
    queryKey: ["derivative-stocks"],
    queryFn: () => publicFetch<Instrument[]>("/instruments/derivative-stocks"),
    staleTime: 60000,
    retry: false,
  });
  const eligible = useQuery({
    queryKey: ["derivative-underlyings"],
    queryFn: () => publicFetch<string[]>("/instruments/derivative-underlyings"),
    staleTime: 60000,
    retry: false,
  });
  const indices = useQuery({
    queryKey: ["fno-explore-index-futures"],
    queryFn: () => fetchFutures(undefined, "FUTIDX"),
    staleTime: 60000,
    retry: false,
  });
  const futures = useQuery({
    queryKey: ["fno-explore-futures", underlying, "FUTSTK"],
    queryFn: () => fetchFutures(underlying),
    staleTime: 60000,
    retry: false,
  });
  const stockList = stocks.isError ? [] : stocks.data || [];
  const stockQuotes = useDisplayQuotes(
    stockList.map((stock) => stock.symbol),
    "stocks",
  );
  const featured = [...stockList]
    .sort((a, b) => {
      const preferred = ["RELIANCE", "HDFCBANK", "TCS"];
      const rank = (stock: Instrument) =>
        preferred.includes(underlyingSymbol(stock))
          ? preferred.indexOf(underlyingSymbol(stock))
          : 3;
      return rank(a) - rank(b);
    })
    .slice(0, 3);
  const filtered = rankStocks(stockList, stockQuotes.quotes, direction, search);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * 8, currentPage * 8 + 8);
  const indexCards = indices.isError ? [] : (indices.data || []).slice(0, 8);
  const stockFutures = futures.isError ? [] : futures.data || [];
  const indexSelection = (indices.isError ? [] : indices.data || []).filter(
    (contract) => contract.underlying === underlying,
  );
  const currentFutures = indexSelection.length ? indexSelection : stockFutures;
  const contractQuotes = useDisplayQuotes(
    [
      ...new Set(
        [...indexCards, ...currentFutures].map((contract) => contract.symbol),
      ),
    ],
    "futures",
  );
  useTargetedSubscription(
    [...featured, ...visible, ...indexCards, ...currentFutures].map(
      (instrument) => instrument.symbol,
    ),
  );
  const marketStatus = useMarketStore((state) => state.marketStatus);
  const feedState = useMarketStore((state) => state.feedStatus.feedState);
  const token = useAuthToken();
  const wallet = useAccountWallet();
  const portfolio = useQuery({
    queryKey: ["portfolio", token],
    queryFn: () => apiFetch<Portfolio>("/portfolio"),
    enabled: !!token,
    refetchInterval: 10000,
    retry: false,
  });
  const account = token && !portfolio.isError ? portfolio.data : undefined;
  const positions = account?.positions
    .filter(isDerivativePosition)
    .filter((position) => position.quantity !== 0);
  const pnl = account ? derivativePnl(account.positions) : undefined;
  const blocked = positions?.every((position) =>
    Number.isFinite(position.margin_blocked_paise),
  )
    ? positions.reduce(
        (total, position) => total + position.margin_blocked_paise!,
        0,
      )
    : undefined;
  const onChain = (symbol: string) => onSelectOptionChain?.(symbol);
  const onTrade = (symbol: string) => {
    setUnderlying(symbol);
    document
      .getElementById("current-futures")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const onOrder = (instrument: Instrument, orderSide: "BUY" | "SELL") => {
    setSelected({ ...instrument, segment: "FUTURES" });
    setSide(orderSide);
  };
  const canTrade = (quote?: Quote) =>
    !!token &&
    marketStatus === "OPEN" &&
    feedState === "LIVE" &&
    quoteLabel(quote) === "LIVE";
  const known = [
    ...new Set([
      ...(eligible.isError ? [] : eligible.data || []),
      ...stockList.map(underlyingSymbol),
    ]),
  ];

  return (
    <div className="text-slate-900 dark:text-slate-100">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section
            aria-label="Featured F&O stocks"
            className="grid gap-4 md:grid-cols-3"
          >
            {featured.map((stock) => (
              <StockCard
                key={stock.symbol}
                instrument={stock}
                quote={stockQuotes.quotes[stock.symbol]}
                onChain={onChain}
                onTrade={onTrade}
              />
            ))}
            {stocks.isLoading && (
              <p className={muted}>Loading eligible stocks…</p>
            )}
          </section>
          <section aria-label="F&O stocks" className={`${panel} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 text-base font-extrabold">
                  <TrendingUp className="h-4 w-4 text-cyan-600" />
                  F&O Stocks
                </h2>
                <p className={`mt-1 text-xs ${muted}`}>
                  Underlying equities eligible for futures & options trading
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className={`mr-2 ${muted}`}>1 Day</span>
                {(["all", "gainers", "losers"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={direction === value}
                    onClick={() => {
                      setDirection(value);
                      setPage(0);
                    }}
                    className={`rounded-lg px-3 py-1.5 font-bold ${direction === value ? "bg-cyan-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  >
                    {value === "all"
                      ? "All stocks"
                      : value === "gainers"
                        ? "Gainers"
                        : "Losers"}
                  </button>
                ))}
              </div>
            </div>
            <label className="my-3 flex items-center gap-2 rounded-lg border border-slate-200 px-3 dark:border-slate-700">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                aria-label="Search F&O stocks"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Search eligible stocks"
                className="w-full bg-transparent py-2 text-xs outline-none"
              />
            </label>
            {stocks.isError && (
              <p
                role="alert"
                className="py-4 text-sm text-amber-700 dark:text-amber-400"
              >
                Eligible stock universe unavailable.{" "}
                <button className="underline" onClick={() => stocks.refetch()}>
                  Retry stocks
                </button>
              </p>
            )}
            {stockQuotes.isError && (
              <p
                role="alert"
                className="mb-3 text-xs text-amber-700 dark:text-amber-400"
              >
                Quote refresh failed. Displayed prices are last available.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 dark:bg-slate-950/40">
                  <tr>
                    <th className="p-3">Stocks</th>
                    <th className="p-3 text-right">Price (LTP)</th>
                    <th className="p-3 text-right">1D change</th>
                    <th className="p-3 text-right">Volume</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visible.map((stock) => {
                    const quote = stockQuotes.quotes[stock.symbol];
                    const symbol = underlyingSymbol(stock);
                    return (
                      <tr
                        key={stock.symbol}
                        className="hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 font-bold text-cyan-600 dark:bg-cyan-950">
                              {symbol.slice(0, 2)}
                            </span>
                            <div>
                              <p className="font-bold">
                                {stock.name || symbol}
                              </p>
                              <p
                                className={`mt-0.5 text-[10px] font-mono ${muted}`}
                              >
                                {symbol} · {stock.exchange}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <p className="font-extrabold tabular-nums">
                            {quote
                              ? formatPaise(quote.price_paise)
                              : "Unavailable"}
                          </p>
                          <QuoteState quote={quote} />
                        </td>
                        <td className="p-3 text-right">
                          <Movement quote={quote} />
                        </td>
                        <td className={`p-3 text-right font-mono ${muted}`}>
                          {quote &&
                          Number.isFinite(quote.volume) &&
                          quote.volume! >= 0
                            ? quote.volume!.toLocaleString("en-IN")
                            : "Unavailable"}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            aria-label={`Trade futures for ${symbol}`}
                            onClick={() => onTrade(symbol)}
                            className="font-bold text-cyan-700 dark:text-cyan-400"
                          >
                            Trade futures →
                          </button>
                          <button
                            aria-label={`Option chain for ${symbol}`}
                            onClick={() => onChain(symbol)}
                            className="mt-1 block w-full text-[10px] text-indigo-600 dark:text-indigo-400"
                          >
                            Option chain
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!stocks.isLoading && !stocks.isError && !visible.length && (
              <p className={`py-6 text-center text-xs ${muted}`}>
                {direction === "all"
                  ? "No eligible stocks match this search."
                  : `No ${direction} with available day movement.`}
              </p>
            )}
            <div
              className={`mt-3 flex items-center justify-between text-[10px] ${muted}`}
            >
              <span>
                {filtered.length} eligible results · provider day movement
              </span>
              <div className="flex items-center gap-3">
                <button
                  disabled={currentPage === 0}
                  className="disabled:opacity-30"
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous stocks
                </button>
                <span>
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  disabled={currentPage + 1 >= pageCount}
                  className="disabled:opacity-30"
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next stocks
                </button>
              </div>
            </div>
          </section>
          <section aria-label="Index futures">
            <div className="mb-4 flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-600" />
              <div>
                <h2 className="text-sm font-extrabold">Active index futures</h2>
                <p className={`mt-1 text-xs ${muted}`}>
                  Current expiries and lot sizes from the instrument master
                </p>
              </div>
            </div>
            {indices.isError && (
              <p
                role="alert"
                className="text-sm text-amber-700 dark:text-amber-400"
              >
                Index contracts unavailable.{" "}
                <button className="underline" onClick={() => indices.refetch()}>
                  Retry index contracts
                </button>
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {indexCards.map((contract) => (
                <FutureCard
                  key={`${contract.exchange}:${contract.token}`}
                  instrument={contract}
                  quote={contractQuotes.quotes[contract.symbol]}
                  canTrade={canTrade(contractQuotes.quotes[contract.symbol])}
                  onOrder={onOrder}
                />
              ))}
            </div>
            {!indices.isLoading && !indices.isError && !indexCards.length && (
              <p className={`text-xs ${muted}`}>
                No active index futures in the master.
              </p>
            )}
          </section>
          <section
            id="current-futures"
            aria-label="Selected underlying futures"
            className={`${panel} scroll-mt-4 p-5`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold">
                  {underlying} · Current futures
                </h2>
                <p className={`mt-1 text-xs ${muted}`}>
                  Paper orders require an open exchange session and fresh Angel
                  One quotes.
                </p>
              </div>
              <button
                onClick={() => onChain(underlying)}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400"
              >
                Open option chain →
              </button>
            </div>
            <label className={`mb-4 flex items-center gap-2 text-xs ${muted}`}>
              Underlying
              <select
                aria-label="Select futures underlying"
                value={underlying}
                onChange={(event) => setUnderlying(event.target.value)}
                className="max-w-full rounded-lg border border-slate-200 bg-white p-2 font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {!known.includes(underlying) && (
                  <option value={underlying}>{underlying}</option>
                )}
                {known.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {futures.isError && !indexSelection.length && (
              <p
                role="alert"
                className="mb-3 text-amber-700 dark:text-amber-400"
              >
                Contract discovery failed.{" "}
                <button className="underline" onClick={() => futures.refetch()}>
                  Retry futures
                </button>
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {currentFutures.map((contract) => (
                <FutureCard
                  key={`${contract.exchange}:${contract.token}`}
                  instrument={contract}
                  quote={contractQuotes.quotes[contract.symbol]}
                  canTrade={canTrade(contractQuotes.quotes[contract.symbol])}
                  onOrder={onOrder}
                />
              ))}
            </div>
            {futures.isLoading ? (
              <p className={`text-xs ${muted}`}>Loading canonical contracts…</p>
            ) : (
              !currentFutures.length && (
                <p className={`text-xs ${muted}`}>
                  No active futures available for this underlying.
                </p>
              )
            )}
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-4">
          <section aria-label="F&O margin summary" className={`${panel} p-5`}>
            <h2
              className={`flex items-center gap-2 border-b border-slate-100 pb-4 text-xs font-bold uppercase dark:border-slate-800 ${muted}`}
            >
              <Wallet className="h-4 w-4 text-cyan-600" />
              F&O Available Margin
            </h2>
            <p className="mt-4 text-2xl font-black tabular-nums">
              {wallet.data
                ? formatPaise(wallet.data.available_balance_paise)
                : "Unavailable"}
            </p>
            <p className={`mt-1 text-xs ${muted}`}>
              {token
                ? "Available paper account balance"
                : "Sign in to view your paper account"}
            </p>
            <dl className="mt-5 space-y-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/50">
              <div className="flex justify-between gap-2">
                <dt className={muted}>Active F&O contracts</dt>
                <dd className="font-bold">
                  {positions ? `${positions.length} open` : "Unavailable"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className={muted}>Unrealized F&O P&L</dt>
                <dd
                  className={
                    pnl === undefined
                      ? muted
                      : pnl >= 0
                        ? "font-bold text-emerald-600 dark:text-emerald-400"
                        : "font-bold text-rose-600 dark:text-rose-400"
                  }
                >
                  {pnl === undefined ? "Unavailable" : formatPaise(pnl)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className={muted}>Blocked F&O margin</dt>
                <dd className="font-bold">
                  {blocked === undefined ? "Unavailable" : formatPaise(blocked)}
                </dd>
              </div>
            </dl>
            {portfolio.isError && (
              <p
                role="alert"
                className="mt-3 text-xs text-amber-700 dark:text-amber-400"
              >
                Portfolio unavailable. Exposure cannot be confirmed.
              </p>
            )}
            <p className={`mt-3 text-[10px] ${muted}`}>
              Valuation: {account?.valuation_status || "Unavailable"}
            </p>
            <Link
              href="/stocks"
              className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 text-xs font-bold text-white hover:bg-cyan-500"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Explore Live Equities
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={onViewPositions}
              className="mt-3 w-full py-1 text-xs font-bold text-slate-600 dark:text-slate-300"
            >
              View Derivative Holdings
            </button>
            <p className={`mt-4 text-[10px] leading-relaxed ${muted}`}>
              Order tickets use the server’s paper margin preview. This balance
              is shared across products; margin is estimated by the simulator.
            </p>
          </section>
          <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-950/30">
            <h2 className="flex items-center gap-2 text-xs font-bold text-cyan-800 dark:text-cyan-300">
              <Sparkles className="h-4 w-4" />
              Option Analytics
            </h2>
            <p className={`mt-2 text-xs leading-relaxed ${muted}`}>
              Inspect calls, puts, provider open interest and day movement in
              the option chain. Greeks are model estimates using assumed
              volatility.
            </p>
            <button
              onClick={() => onChain(underlying)}
              className="mt-3 text-xs font-bold text-cyan-700 dark:text-cyan-400"
            >
              Explore {underlying} chain →
            </button>
          </section>
        </aside>
      </div>
      <FnoOrderModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        instrument={selected}
        initialSide={side}
      />
    </div>
  );
}
