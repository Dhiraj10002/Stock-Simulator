"use client";
import { useDisplayPolling } from "@/hooks/useDisplayPolling";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Lock,
  Newspaper,
  RefreshCw,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import dynamic from "next/dynamic";
const TradingViewChart = dynamic(() => import("@/components/trading/TradingViewChart"), { ssr: false });
import MarketDepthPanel from "./MarketDepthPanel";
import {
  FnoMovement,
  FnoProvenance,
} from "@/components/trading/FnoQuoteDetails";
import { useSymbolQuote, useTargetedSubscription } from "@/stores/market-store";
import { publicFetch, apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useToast } from "@/components/ui/ToastProvider";
import { formatPaise } from "@/lib/format";
import { aggregateCandles, historyRequest, quoteLabel } from "@/lib/marketData";
import { displayQuote, type FuturesMarketStatus } from "@/lib/fnoExplore";
import { nativeCandles } from "@/lib/fnoStockOverview";
import { useOrderPreview } from "@/hooks/useOrderPreview";
import { strategyJournalKey } from "@/lib/strategyExecution";
import type {
  Article,
  Candle,
  Instrument,
  Order,
  Quote,
  WatchlistDbItem,
} from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-[#ffffff] p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#0f172a]";
const muted = "text-slate-600 dark:text-slate-400";
const input =
  "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-[#ffffff] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-700 dark:bg-[#020617]";
const bounded = <T,>(path: string, signal: AbortSignal) =>
  publicFetch<T>(path, AbortSignal.any([signal, AbortSignal.timeout(8000)]));
type Fundamentals = {
  symbol: string;
  source: string;
  status: string;
  message?: string;
  retrieved_at?: string;
  metrics: { label: string; value: string }[];
};
const price = (value?: number) =>
  Number.isSafeInteger(value) && value! > 0
    ? formatPaise(value)
    : "Unavailable";

function PriceRange({
  label,
  low,
  high,
  last,
}: {
  label: string;
  low?: number;
  high?: number;
  last?: number;
}) {
  const available =
    Number.isSafeInteger(low) &&
    Number.isSafeInteger(high) &&
    low! > 0 &&
    high! >= low!;
  const position =
    available && Number.isFinite(last) && last! >= low! && last! <= high!
      ? ((last! - low!) / Math.max(high! - low!, 1)) * 100
      : undefined;
  return (
    <div className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
      <h3 className={`text-xs font-medium ${muted}`}>{label}</h3>
      <div className="mt-3 flex justify-between gap-2 text-sm font-semibold tabular-nums">
        <span>{price(low)}</span>
        <span>{price(high)}</span>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
        {available && (
          <div className="h-full rounded-full bg-gradient-to-r from-rose-300 via-amber-200 to-emerald-300" />
        )}
        {position !== undefined && (
          <span
            aria-label="Last price in range"
            className="absolute -top-1 h-3.5 w-1 rounded bg-slate-900 dark:bg-white"
            style={{ left: `${position}%` }}
          />
        )}
      </div>
      <div className={`mt-2 flex justify-between text-[11px] ${muted}`}>
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

export default function StockDetailsPage({
  initialSymbol = "ITC",
}: {
  initialSymbol?: string;
}) {
  const search = useSearchParams();
  const symbol = (search.get("symbol") || initialSymbol).trim().toUpperCase();
  const token = useAuthToken();
  // Reset on a route/account change, while keeping uncertain-result locks
  // through access-token refreshes for the same account.
  const account = strategyJournalKey(token) || token;
  return (
    <StockDesk key={`${symbol}:${account}`} symbol={symbol} token={token} />
  );
}
function StockDesk({ symbol, token }: { symbol: string; token: string }) {
  const client = useQueryClient();
  const wallet = useAccountWallet();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    queueMicrotask(tick);
    return () => clearInterval(timer);
  }, []);
  const [timeframe, setTimeframe] = useState("1m");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<"DELIVERY" | "INTRADAY">("DELIVERY");
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [quantity, setQuantity] = useState(1);
  const [limit, setLimit] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [watchFeedback, setWatchFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const postStarted = useRef(false);
  const { addToast } = useToast();
  const instrument = useQuery({
    queryKey: ["instrument", symbol],
    queryFn: ({ signal }) =>
      bounded<Instrument>(`/instruments/${encodeURIComponent(symbol)}`, signal),
    retry: false,
    refetchInterval: 60000,
  });
  const inst = instrument.isError ? undefined : instrument.data;
  const canonical =
    inst?.exchange === "NSE" && inst.instrument_type === "EQUITY"
      ? inst.symbol
      : undefined;
  useTargetedSubscription(canonical || []);
  const wsQuote = useSymbolQuote(canonical || "");
  const displayInterval = useDisplayPolling(canonical);
  const quoteQuery = useQuery({
    queryKey: ["stock-display-quote", canonical],
    queryFn: ({ signal }) =>
      bounded<Quote>(
        `/market/quotes/${encodeURIComponent(canonical!)}?purpose=display`,
        signal,
      ),
    enabled: !!canonical,
    refetchInterval: displayInterval,
    retry: false,
  });
  const market = useQuery({
    queryKey: ["stock-market-status"],
    queryFn: ({ signal }) =>
      bounded<FuturesMarketStatus>("/market/status", signal),
    refetchInterval: 10000,
    retry: false,
  });
  const status =
    !market.isError && now - market.dataUpdatedAt < 30000
      ? market.data
      : undefined;
  const sessionLive =
    !!status &&
    status.status === "OPEN" &&
    status.is_open &&
    status.feed_provider === "angel_one" &&
    status.feed_state === "LIVE" &&
    !status.is_synthetic;
  const chosen = displayQuote(
    quoteQuery.data,
    wsQuote || undefined,
    quoteQuery.isError,
  );
  const quote =
    chosen?.source === "angelone_live" && canonical ? chosen : undefined;
  const chartQuote = quote
    ? { ...quote, is_quote_stale: !sessionLive || quote.is_quote_stale }
    : null;
  const request = historyRequest(timeframe);
  const history = useQuery({
    queryKey: ["stock-history", canonical, request.interval],
    queryFn: ({ signal }) =>
      bounded<(Candle & { source?: string; feed_mode?: string })[]>(
        `/market/quotes/${encodeURIComponent(canonical!)}/history?interval=${request.interval}&limit=${request.limit}`,
        signal,
      ),
    enabled: !!canonical,
    refetchInterval: 30000,
    retry: false,
  });
  const fundamentals = useQuery({
    queryKey: ["stock-fundamentals", canonical],
    queryFn: ({ signal }) =>
      bounded<Fundamentals>(
        `/market/quotes/${encodeURIComponent(canonical!)}/fundamentals`,
        signal,
      ),
    enabled: !!canonical,
    staleTime: 300000,
    retry: false,
  });
  const news = useQuery({
    queryKey: ["stock-news", symbol],
    queryFn: ({ signal }) =>
      bounded<Article[]>(
        `/news?symbol=${encodeURIComponent(symbol)}&limit=5`,
        signal,
      ),
    refetchInterval: 60000,
    retry: false,
  });
  const watchlist = useQuery({
    queryKey: ["watchlist", token],
    queryFn: ({ signal }) =>
      apiFetch<WatchlistDbItem[]>("/watchlist", { signal }),
    enabled: !!token,
    retry: false,
  });
  const getWatchlistSymbol = (item?: WatchlistDbItem): string => {
    if (!item) return "";
    const sym = item.symbol || (item as unknown as { Symbol?: string })?.Symbol || "";
    return typeof sym === "string" ? sym : "";
  };

  const currentTarget = (canonical || symbol || "").replace(/-EQ$/, "");
  const watched = Boolean(
    watchlist.data?.some((item) => {
      const sym = getWatchlistSymbol(item);
      return sym ? sym.replace(/-EQ$/, "") === currentTarget : false;
    }),
  );
  const [watchBusy, setWatchBusy] = useState(false);
  const toggleWatch = async () => {
    if (!token || !canonical || watchBusy || watchlist.isError) return;
    setWatchBusy(true);
    try {
      const current = watchlist.data?.find((item) => {
        const sym = getWatchlistSymbol(item);
        return sym ? sym.replace(/-EQ$/, "") === currentTarget : false;
      });
      const isAdding = !current;
      const symToRemove = current ? getWatchlistSymbol(current) : "";
      await apiFetch(
        current && symToRemove
          ? `/watchlist/${encodeURIComponent(symToRemove)}`
          : "/watchlist",
        {
          method: current ? "DELETE" : "POST",
          ...(current ? {} : { body: JSON.stringify({ symbol: canonical }) }),
        },
      );
      await watchlist.refetch();
      setWatchFeedback(undefined);
      addToast(
        isAdding ? "Added to Watchlist" : "Removed from Watchlist",
        `${currentTarget} has been ${isAdding ? "added to" : "removed from"} your watchlist.`,
        "success",
      );
    } catch {
      setWatchFeedback("Watchlist update failed. Try again.");
      addToast("Watchlist Error", "Watchlist update failed. Try again.", "error");
    } finally {
      setWatchBusy(false);
    }
  };
  const order = {
    symbol: canonical || symbol,
    side,
    type,
    product,
    quantity,
    price_paise: type === "LIMIT" ? Math.round(Number(limit) * 100) : 0,
  };
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0;
  const validPrice =
    type === "MARKET" ||
    (Number.isFinite(Number(limit)) &&
      Number(limit) > 0 &&
      Number.isSafeInteger(order.price_paise));
  const preview = useOrderPreview(
    order,
    !!canonical && sessionLive && validQuantity && validPrice && !submitted,
  );
  const canOrder =
    !!token &&
    sessionLive &&
    quoteLabel(quote, now) === "LIVE" &&
    preview.data?.sufficient_funds === true &&
    validQuantity &&
    validPrice &&
    !submitting &&
    !submitted &&
    inst?.active === true &&
    inst.is_tradable === true;
  const placeOrder = async () => {
    if (!canOrder || !confirmation || postStarted.current) return;
    postStarted.current = true;
    setSubmitting(true);
    setSubmitted(true);
    try {
      const placed = await apiFetch<Order>("/orders", {
        method: "POST",
        body: JSON.stringify(order),
        signal: AbortSignal.timeout(15000),
      });
      if (!placed?.uuid) throw new Error("Order result unknown.");
      if (placed.status === "EXECUTED") {
        setFeedback(undefined);
        setSubmitted(false);
        postStarted.current = false;
        addToast(
          "Order Executed",
          `${order.side} ${order.quantity} shares of ${symbol.replace(/-EQ$/, "")} executed successfully.`,
          "success",
        );
      } else {
        setFeedback(
          `Order ${placed.uuid}: ${placed.status}. Execution is not confirmed. Review Orders.`,
        );
        addToast(
          `Order ${placed.status}`,
          `Order for ${order.quantity} shares: ${placed.status}. Review Orders.`,
          "info",
        );
      }
      for (const queryKey of [
        ["portfolio"],
        ["wallet"],
        ["orders"],
        ["trades"],
      ])
        void client.invalidateQueries({ queryKey });
    } catch {
      setFeedback(
        "Order result is uncertain. Review Orders before placing another order.",
      );
      addToast(
        "Order Notice",
        "Order result is uncertain. Review Orders before placing another order.",
        "error",
      );
    } finally {
      setSubmitting(false);
      setConfirmation(false);
    }
  };
  const fund =
    fundamentals.data?.symbol === (canonical || symbol).replace(/-EQ$/, "") &&
    fundamentals.data.status === "AVAILABLE" &&
    !fundamentals.isError
      ? fundamentals.data
      : undefined;
  const beginSide = (value: "BUY" | "SELL") => {
    if (submitted) return;
    setSide(value);
    setConfirmation(false);
    document
      .getElementById("stock-order")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar availableBalancePaise={wallet.data?.available_balance_paise} />
      <main className="mx-auto w-full max-w-7xl min-w-0 space-y-5 p-4 sm:p-6 lg:p-8">
        <nav
          aria-label="Stock breadcrumb"
          className={`flex flex-wrap items-center gap-2 text-xs ${muted}`}
        >
          <Link
            href="/stocks"
            className="flex items-center gap-1 hover:text-cyan-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Stocks
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>{symbol.replace(/-EQ$/, "")}</span>
          <span className="ml-auto">Paper trading desk</span>
        </nav>
        <header
          aria-label="Stock identity"
          className={`${panel} flex flex-wrap items-center justify-between gap-5`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-base font-extrabold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
              {symbol.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <h1 className="break-words text-xl font-bold sm:text-2xl">
                {inst?.name || symbol.replace(/-EQ$/, "")}
              </h1>
              <p
                className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${muted}`}
              >
                <span>{symbol.replace(/-EQ$/, "")}</span>
                <span className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">
                  {canonical ? "NSE · Equity" : "Instrument unavailable"}
                </span>
                <span className="rounded bg-cyan-50 px-2 py-1 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                  Delivery / Intraday
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <p className="text-2xl font-bold tabular-nums sm:text-3xl">
                {quote ? price(quote.price_paise) : "Unavailable"}
              </p>
              <FnoMovement quote={quote} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                aria-label={
                  watched ? "Remove from watchlist" : "Add to watchlist"
                }
                disabled={
                  !token ||
                  !canonical ||
                  watchBusy ||
                  watchlist.isPending ||
                  watchlist.isError
                }
                onClick={toggleWatch}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-semibold disabled:opacity-50 dark:border-slate-700"
              >
                {watched ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
                Watchlist
              </button>
              {(["BUY", "SELL"] as const).map((value) => (
                <button
                  key={value}
                  disabled={submitted}
                  onClick={() => beginSide(value)}
                  className={`min-h-11 rounded-xl px-5 text-xs font-bold text-white disabled:opacity-50 ${value === "BUY" ? "bg-cyan-700 hover:bg-cyan-800" : "bg-rose-700 hover:bg-rose-800"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FnoProvenance quote={quote} now={now} sessionLive={sessionLive} />
          <button
            onClick={() => {
              void quoteQuery.refetch();
              void history.refetch();
              void market.refetch();
            }}
            disabled={!canonical || quoteQuery.isFetching}
            className={`flex min-h-10 items-center gap-2 text-xs font-semibold ${muted}`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh market data
          </button>
        </div>
        {watchFeedback && (
          <p
            role="status"
            className="text-sm text-amber-800 dark:text-amber-300"
          >
            {watchFeedback}
          </p>
        )}
        {quoteQuery.isError && (
          <p
            role="alert"
            className="text-xs text-amber-800 dark:text-amber-300"
          >
            Quote refresh failed. Retained data keeps its original timestamp.
          </p>
        )}
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-12">
          <section className="min-w-0 space-y-5 lg:col-span-8">
            <section
              aria-label="Price chart"
              className={`${panel} overflow-hidden !p-0`}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <h2 className="text-base font-bold">Price chart</h2>
                <span className={`text-xs ${muted}`}>
                  Angel One · native candles
                </span>
              </div>
              {history.isError && (
                <p
                  role="alert"
                  className="px-4 text-xs text-amber-800 dark:text-amber-300"
                >
                  Chart archive request failed.{" "}
                  <button
                    onClick={() => history.refetch()}
                    className="underline"
                  >
                    Retry chart
                  </button>
                </p>
              )}
              <TradingViewChart
                key={canonical || symbol}
                symbol={canonical || symbol}
                historicalCandles={aggregateCandles(
                  nativeCandles(history.data || [], now),
                  timeframe,
                )}
                liveQuote={chartQuote}
                isLoading={history.isLoading}
                height={380}
                defaultTimeframe={timeframe}
                onTimeframeChange={setTimeframe}
                onRefresh={() => history.refetch()}
              />
            </section>
            <section aria-label="Price performance" className={panel}>
              <h2 className="text-base font-bold">Price performance</h2>
              <p className={`mt-1 text-xs ${muted}`}>
                Provider ranges from the displayed quote snapshot
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PriceRange
                  label="Day range"
                  low={quote?.low_paise}
                  high={quote?.high_paise}
                  last={quote?.price_paise}
                />
                <PriceRange
                  label="52-week range"
                  low={quote?.week_52_low_paise}
                  high={quote?.week_52_high_paise}
                  last={quote?.price_paise}
                />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                {[
                  ["Open", quote?.open_paise],
                  ["Previous close", quote?.previous_close_paise],
                  ["Lower circuit", quote?.lower_circuit_paise],
                  ["Upper circuit", quote?.upper_circuit_paise],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className={`text-xs ${muted}`}>{label}</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">
                      {price(value as number | undefined)}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt className={`text-xs ${muted}`}>Volume</dt>
                  <dd className="mt-1 text-sm font-semibold tabular-nums">
                    {quote?.volume_available !== false &&
                    Number.isSafeInteger(quote?.volume) &&
                    quote!.volume! >= 0
                      ? quote!.volume!.toLocaleString("en-IN")
                      : "Unavailable"}
                  </dd>
                </div>
              </dl>
            </section>
            <section aria-label="Company fundamentals" className={panel}>
              <h2 className="text-base font-bold">Fundamentals</h2>
              <p className={`mt-1 text-xs ${muted}`}>
                Company metrics · provider labels, units and reporting periods
              </p>
              {fund ? (
                <>
                  <p className={`mt-3 text-xs ${muted}`}>
                    {fund.source} · Retrieved{" "}
                    {new Date(fund.retrieved_at || "").toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST. Retrieval time is not a financial reporting date.
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {fund.metrics.map((item, i) => (
                      <div
                        key={i}
                        className="min-w-0 rounded-xl bg-slate-50 p-3 dark:bg-slate-950"
                      >
                        <dt className={`break-words text-xs ${muted}`}>
                          {item.label}
                        </dt>
                        <dd className="mt-2 break-words text-sm font-semibold">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p
                  role="status"
                  className={`mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 dark:bg-slate-950 ${muted}`}
                >
                  {fundamentals.isPending && canonical
                    ? "Loading company fundamentals…"
                    : fundamentals.data?.message ||
                      "Verified company metrics are currently unavailable."}
                </p>
              )}
            </section>
            <section className={panel}>
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Newspaper className="h-4 w-4 text-cyan-700" />
                Latest news
              </h2>
              <div className="mt-4 space-y-3">
                {news.isError ? (
                  <p className={`text-sm ${muted}`}>News unavailable.</p>
                ) : news.data?.length ? (
                  news.data.map((article) => (
                    <a
                      key={article.url}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border-b border-slate-100 pb-3 text-sm font-medium text-cyan-800 last:border-0 dark:border-slate-800 dark:text-cyan-300"
                    >
                      {article.title}
                      <span
                        className={`mt-1 block text-xs font-normal ${muted}`}
                      >
                        {article.source} ·{" "}
                        {new Date(article.published_at).toLocaleDateString(
                          "en-IN",
                        )}
                      </span>
                    </a>
                  ))
                ) : (
                  <p className={`text-sm ${muted}`}>
                    No sourced news available.
                  </p>
                )}
              </div>
            </section>
          </section>
          <aside className="min-w-0 space-y-5 lg:col-span-4">
            <MarketDepthPanel
              quote={quote}
              now={now}
              sessionLive={sessionLive}
            />
            <section
              id="stock-order"
              aria-label="Paper order ticket"
              className={panel}
            >
              <h2 className="text-base font-bold">Place paper order</h2>
              <p className={`mt-1 text-xs ${muted}`}>
                Delivery and intraday simulation
              </p>
              <fieldset
                disabled={submitted || submitting}
                className="mt-4 space-y-4 disabled:opacity-60"
              >
                <div className="grid grid-cols-2 gap-2">
                  {(["BUY", "SELL"] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={side === value}
                      onClick={() => {
                        setSide(value);
                        setConfirmation(false);
                      }}
                      className={`min-h-11 rounded-xl border text-xs font-bold ${side === value ? (value === "BUY" ? "border-cyan-700 bg-cyan-700 text-white" : "border-rose-700 bg-rose-700 text-white") : "border-slate-300 dark:border-slate-700"}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`text-xs ${muted}`}>
                    Product
                    <select
                      aria-label="Product"
                      value={product}
                      onChange={(e) => {
                        setProduct(e.target.value as typeof product);
                        setConfirmation(false);
                      }}
                      className={input}
                    >
                      <option value="DELIVERY">Delivery</option>
                      <option value="INTRADAY">Intraday</option>
                    </select>
                  </label>
                  <label className={`text-xs ${muted}`}>
                    Order type
                    <select
                      aria-label="Order type"
                      value={type}
                      onChange={(e) => {
                        setType(e.target.value as typeof type);
                        setConfirmation(false);
                      }}
                      className={input}
                    >
                      <option>MARKET</option>
                      <option>LIMIT</option>
                    </select>
                  </label>
                </div>
                <label className={`block text-xs ${muted}`}>
                  Quantity
                  <input
                    aria-label="Quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(Number(e.target.value));
                      setConfirmation(false);
                    }}
                    className={input}
                  />
                </label>
                {type === "LIMIT" && (
                  <label className={`block text-xs ${muted}`}>
                    Limit price ₹
                    <input
                      aria-label="Limit price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={limit}
                      onChange={(e) => {
                        setLimit(e.target.value);
                        setConfirmation(false);
                      }}
                      className={input}
                    />
                  </label>
                )}
                <label
                  className={`flex items-start gap-2 text-xs leading-5 ${muted}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={confirmation}
                    onChange={(e) => setConfirmation(e.target.checked)}
                  />
                  Confirm {side} {quantity} {symbol.replace(/-EQ$/, "")} as a{" "}
                  {product.toLowerCase()} paper order.
                </label>
              </fieldset>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950">
                <div className="flex justify-between gap-2">
                  <span className={muted}>Required funds</span>
                  <strong>
                    {formatPaise(preview.data?.required_funds_paise)}
                  </strong>
                </div>
                <div className="mt-2 flex justify-between gap-2">
                  <span className={muted}>Available balance</span>
                  <strong>
                    {formatPaise(wallet.data?.available_balance_paise)}
                  </strong>
                </div>
              </div>
              {!token ? (
                <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">
                  Sign in to place a paper order.
                </p>
              ) : !sessionLive ? (
                <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">
                  {status?.status === "CLOSED"
                    ? "Exchange session closed."
                    : "Live market status cannot be confirmed."}{" "}
                  Paper trading is paused.
                </p>
              ) : (
                quoteLabel(quote, now) !== "LIVE" && (
                  <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">
                    A fresh Angel One quote is required.
                  </p>
                )
              )}
              {preview.isError && (
                <p
                  role="alert"
                  className="mt-3 text-xs text-amber-800 dark:text-amber-300"
                >
                  {preview.error.message}
                </p>
              )}
              {!token ? (
                <>
                  <Link
                    href={`/login?redirect=/stocks/${canonical}`}
                    className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-sm font-bold text-white shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.01]"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Log In to Trade</span>
                  </Link>
                  <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    Sign in to place paper orders with ₹10,00,000 seed capital.
                  </p>
                </>
              ) : (
                <button
                  disabled={!canOrder || !confirmation}
                  onClick={placeOrder}
                  className={`mt-4 min-h-11 w-full rounded-xl text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${side === "BUY" ? "bg-cyan-700" : "bg-rose-700"}`}
                >
                  {submitting
                    ? "Submitting…"
                    : submitted
                      ? "Review order result"
                      : "Place paper order"}
                </button>
              )}
              {feedback && (
                <p
                  role="status"
                  className="mt-3 break-words text-xs leading-5 text-amber-800 dark:text-amber-300"
                >
                  {feedback}
                </p>
              )}
              <Link
                href="/orders"
                className="mt-3 flex min-h-10 items-center justify-center text-xs font-semibold text-cyan-800 underline dark:text-cyan-300"
              >
                Review Orders
              </Link>
              <p className={`mt-2 text-[11px] leading-5 ${muted}`}>
                Intraday margin is a simulator estimate. The server checks
                market status, price and funds before execution.
              </p>
            </section>
          </aside>
        </div>
      </main>

      {/* Mobile Sticky Quick Buy/Sell Action Bar */}
      <div className="md:hidden fixed bottom-14 left-0 right-0 z-30 px-3 py-2 bg-white/95 dark:bg-[#06080e]/95 border-t border-slate-200 dark:border-slate-800 backdrop-blur-xl flex items-center justify-between gap-3 shadow-2xl">
        <div className="min-w-0">
          <div className="text-xs font-black font-tabular text-slate-900 dark:text-slate-100">
            {quote?.price_paise !== undefined ? `₹${(quote.price_paise / 100).toFixed(2)}` : "—"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {symbol.replace(/-EQ$/, "")}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-1 max-w-[240px]">
          <button
            onClick={() => {
              setSide("BUY");
              document.getElementById("stock-order")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex-1 py-2 px-3 rounded-xl bg-cyan-600 active:bg-cyan-700 text-white font-black text-xs shadow-md shadow-cyan-600/20 text-center transition-transform active:scale-95 cursor-pointer"
          >
            BUY
          </button>
          <button
            onClick={() => {
              setSide("SELL");
              document.getElementById("stock-order")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex-1 py-2 px-3 rounded-xl bg-rose-600 active:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-600/20 text-center transition-transform active:scale-95 cursor-pointer"
          >
            SELL
          </button>
        </div>
      </div>
    </div>
  );
}
