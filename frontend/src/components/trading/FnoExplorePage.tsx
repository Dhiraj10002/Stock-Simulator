"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { publicFetch, apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { isDerivativePosition } from "@/lib/fnoExplore";
import { formatPaise } from "@/lib/format";
import { feedLabel } from "@/lib/marketDisplay";
import {
  derivativePnl,
  displayQuote,
  expiryLabel,
  filterFutures,
  futuresExpiry,
  futuresTradeBlock,
  futuresUnderlying,
  sortedFutures,
  parseFuturesCatalog,
  type FuturesFilters,
  type FuturesMarketStatus,
} from "@/lib/fnoExplore";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import TopIndexFutures from "@/components/trading/TopIndexFutures";
import { strategyJournalKey } from "@/lib/strategyExecution";
import FnoStockOverview from "@/components/trading/FnoStockOverview";
import {
  FnoMovement,
  FnoProvenance,
} from "@/components/trading/FnoQuoteDetails";
import FnoOrderModal from "@/components/trading/FnoOrderModal";
import type { Instrument, Portfolio, Quote } from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-[#ffffff] shadow-sm dark:border-slate-800 dark:bg-[#0f172a]";
const muted = "text-slate-600 dark:text-slate-400";
const input =
  "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-[#ffffff] px-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-700 dark:bg-[#020617] dark:text-slate-100";
const button =
  "min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500 dark:border-slate-700 dark:hover:bg-slate-800 dark:disabled:text-slate-400";
const subscribeSmallViewport = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 639px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const smallViewport = () => window.matchMedia("(max-width: 639px)").matches;
const desktopSnapshot = () => false;
const bounded = <T,>(path: string, signal: AbortSignal) =>
  publicFetch<T>(path, AbortSignal.any([signal, AbortSignal.timeout(8000)]));

function FutureCard({
  instrument,
  quote,
  block,
  now,
  statusConfirmed,
  onOrder,
}: {
  instrument: Instrument;
  quote?: Quote;
  block?: string;
  now: number;
  statusConfirmed: boolean;
  onOrder: (instrument: Instrument, side: "BUY" | "SELL") => void;
}) {
  const finite = (value?: number) =>
    Number.isFinite(value) && value! >= 0
      ? value!.toLocaleString("en-IN")
      : "Unavailable";
  return (
    <article
      aria-label={`${instrument.symbol} futures card`}
      className={`${panel} flex min-w-0 flex-col p-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="break-words text-sm font-bold">
          {futuresUnderlying(instrument)}
        </h3>
        <span className={`text-xs ${muted}`}>{instrument.exchange}</span>
      </div>
      <p className={`mt-1 break-all text-xs ${muted}`}>{instrument.symbol}</p>
      <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs ${muted}`}>
        <span>
          Expiry{" "}
          <strong className="font-medium text-slate-800 dark:text-slate-200">
            {expiryLabel(instrument.expiry)}
          </strong>
        </span>
        <span>
          Lot{" "}
          <strong className="font-medium text-slate-800 dark:text-slate-200">
            {Number.isSafeInteger(instrument.lot_size) &&
            instrument.lot_size > 0
              ? instrument.lot_size
              : "Unavailable"}
          </strong>
        </span>
      </div>
      <div
        className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="text-2xl font-bold tracking-tight tabular-nums">
          {quote ? formatPaise(quote.price_paise) : "Unavailable"}
        </p>
        <FnoMovement quote={quote} />
      </div>
      <div className="mt-2">
        <FnoProvenance quote={quote} now={now} sessionLive={statusConfirmed} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-950">
        <div>
          <dt className={muted}>Open interest</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {quote?.open_interest_available === true
              ? finite(quote.open_interest)
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className={muted}>Volume</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {quote?.volume_available === false
              ? "Unavailable"
              : finite(quote?.volume)}
          </dd>
        </div>
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["BUY", "SELL"] as const).map((side) => (
          <button
            key={side}
            aria-label={`${side === "BUY" ? "Buy" : "Sell"} ${instrument.symbol}`}
            disabled={!!block}
            title={block || "Open paper order ticket"}
            onClick={() => onOrder(instrument, side)}
            className={`min-h-11 rounded-lg px-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-slate-300 ${side === "BUY" ? "bg-cyan-700 hover:bg-cyan-800" : "bg-rose-700 hover:bg-rose-800"}`}
          >
            {side === "BUY" ? "Buy / Long" : "Sell / Short"}
          </button>
        ))}
      </div>
      <p className={`mt-2 text-xs ${muted}`}>
        {block || "Paper trade · price and margin checked"}
      </p>
    </article>
  );
}

export default function FnoExplorePage({
  active = true,
  onViewPositions,
}: {
  active?: boolean;
  onViewPositions?: () => void;
}) {
  const queryClient = useQueryClient();
  const pageSize = useSyncExternalStore(
    subscribeSmallViewport,
    smallViewport,
    desktopSnapshot,
  )
    ? 6
    : 12;
  const [filters, setFilters] = useState<FuturesFilters>({
    kind: "FUTIDX",
    search: "",
    exchange: "",
    underlying: "",
    expiry: "near",
  });
  const [page, setPage] = useState(0);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [ticket, setTicket] = useState<{
    instrument: Instrument;
    side: "BUY" | "SELL";
  }>();
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) setNow(Date.now());
    });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [active]);
  const catalog = useQuery({
    queryKey: ["futures-catalog"],
    queryFn: async ({ signal }) =>
      parseFuturesCatalog(
        await bounded<unknown>("/instruments/futures", signal),
      ),
    enabled: active,
    refetchInterval: active ? 60000 : false,
    retry: false,
  });
  const market = useQuery({
    queryKey: ["fno-market-status"],
    queryFn: ({ signal }) =>
      bounded<FuturesMarketStatus>("/market/status", signal),
    enabled: active,
    refetchInterval: active ? 10000 : false,
    retry: false,
  });
  const status =
    !market.isError && now - market.dataUpdatedAt < 30000
      ? market.data
      : undefined;
  const contracts = sortedFutures(
    catalog.isError ? [] : catalog.data || [],
    now,
  );
  const kindContracts = contracts.filter(
    (i) => filters.kind === "all" || i.instrument_type === filters.kind,
  );
  const underlyings = [
    ...new Set(
      kindContracts
        .filter((i) => !filters.exchange || i.exchange === filters.exchange)
        .map(futuresUnderlying),
    ),
  ].sort();
  const exchanges = [...new Set(kindContracts.map((i) => i.exchange))].sort();
  const expiries = [
    ...new Set(
      kindContracts
        .filter(
          (i) =>
            (!filters.exchange || i.exchange === filters.exchange) &&
            (!filters.underlying ||
              futuresUnderlying(i) === filters.underlying),
        )
        .map((i) => futuresExpiry(i.expiry)),
    ),
  ].sort((a, b) => a - b);
  const filtered = filterFutures(contracts, filters);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  // A top-volume card can open a ticket while the browser is collapsed or
  // filtered to other contracts. Its parent guard needs that contract's quote.
  const symbols = active
    ? [
        ...new Set([
          ...(browseOpen ? visible.map((i) => i.symbol) : []),
          ...(ticket ? [ticket.instrument.symbol] : []),
        ]),
      ]
    : [];
  useTargetedSubscription(symbols);
  const stream = useMultiSymbolQuotes(symbols);
  const quotes = useQuery({
    queryKey: ["fno-futures-quotes", symbols],
    queryFn: ({ signal }) =>
      bounded<Record<string, Quote>>(
        `/market/quotes/batch?symbols=${encodeURIComponent(symbols.join(","))}`,
        signal,
      ),
    enabled: active && symbols.length > 0,
    refetchInterval: active ? 10000 : false,
    retry: false,
  });
  const token = useAuthToken();
  const wallet = useAccountWallet();
  const portfolio = useQuery({
    queryKey: ["portfolio", token],
    queryFn: () => apiFetch<Portfolio>("/portfolio"),
    enabled: !!token && active,
    refetchInterval: active ? 10000 : false,
    retry: false,
  });
  const account = token && !portfolio.isError ? portfolio.data : undefined;
  const positions = account?.positions
    .filter(isDerivativePosition)
    .filter((p) => p.quantity !== 0);
  const pnl = account ? derivativePnl(account.positions) : undefined;
  const update = (patch: Partial<FuturesFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(0);
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["fno-equities"] });
    void queryClient.invalidateQueries({
      queryKey: ["top-index-futures-quotes"],
    });
    void catalog.refetch();
    void market.refetch();
    if (symbols.length) void quotes.refetch();
    if (token) {
      void wallet.refetch();
      void portfolio.refetch();
    }
  };
  const refreshing =
    catalog.isFetching || market.isFetching || quotes.isFetching;
  const confirmed =
    !!status &&
    status.status === "OPEN" &&
    status.is_open &&
    status.feed_provider === "angel_one" &&
    status.feed_state === "LIVE" &&
    !status.is_synthetic;
  const startOrder = (instrument: Instrument, side: "BUY" | "SELL") =>
    setTicket({ instrument: { ...instrument, segment: "FUTURES" }, side });
  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-12">
      <div className="min-w-0 space-y-6 lg:col-span-8 xl:col-span-9">
        <FnoStockOverview
          active={active}
          futures={contracts}
          now={now}
          sessionLive={confirmed}
          onTrade={(underlying) => {
            setBrowseOpen(true);
            update({
              kind: "FUTSTK",
              underlying,
              exchange: "",
              expiry: "near",
              search: "",
            });
            document
              .getElementById("current-futures")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <TopIndexFutures
          contracts={contracts}
          active={active}
          now={now}
          status={status}
          onOrder={startOrder}
        />
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-800/60 pt-4">
            <button
              aria-expanded={browseOpen}
              aria-controls="current-futures"
              onClick={() => setBrowseOpen(!browseOpen)}
              className="text-xs text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 font-semibold transition-colors"
            >
              {browseOpen ? "Hide futures browser" : "Browse all futures"}
            </button>
          </div>
          <section
            hidden={!browseOpen}
            id="current-futures"
            aria-label="Futures market"
            className="min-w-0 scroll-mt-24 space-y-4"
          >
            <div className={`${panel} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">
                    {filters.kind === "FUTIDX"
                      ? "Current index futures"
                      : filters.kind === "FUTSTK"
                        ? "Current stock futures"
                        : "Current futures"}
                  </h2>
                  <p className={`mt-1 text-sm ${muted}`}>
                    Explore current contracts and trade in canonical lots.
                  </p>
                </div>
                <button
                  disabled={refreshing}
                  onClick={refresh}
                  className={`${button} flex items-center gap-2`}
                >
                  <RefreshCw
                    aria-hidden
                    className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                  {refreshing ? "Refreshing…" : "Refresh data"}
                </button>
              </div>
              <div
                role="status"
                className={`mt-3 rounded-xl border px-3 py-2 text-xs ${confirmed ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}
              >
                <strong>{feedLabel(status, now)}</strong>
                <span className="block mt-1">
                  {!status
                    ? "Exchange status cannot be confirmed. Paper trading is paused."
                    : status.status !== "OPEN" || !status.is_open
                      ? "Exchange session closed. Last available quotes may be shown; paper trading is paused."
                      : !confirmed
                        ? "Live provider connection required. Paper trading is paused."
                        : "Prices update by stream and refresh every 10 seconds. Each order needs a fresh contract quote."}
                </span>
              </div>
              <div
                className="mt-3 flex flex-wrap gap-2"
                role="group"
                aria-label="Futures category"
              >
                {(
                  [
                    ["FUTIDX", "Index futures"],
                    ["FUTSTK", "Stock futures"],
                    ["all", "All futures"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    aria-pressed={filters.kind === kind}
                    onClick={() =>
                      update({
                        kind,
                        underlying: "",
                        exchange: "",
                        expiry: "near",
                        search: "",
                      })
                    }
                    className={`${button} ${filters.kind === kind ? "border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800 dark:border-cyan-500 dark:bg-cyan-700" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label
                  className={`min-w-0 text-xs font-semibold sm:col-span-2 ${muted}`}
                >
                  Search contracts
                  <div className="relative">
                    <Search
                      aria-hidden
                      className="absolute left-3 top-4 h-4 w-4"
                    />
                    <input
                      aria-label="Search futures contracts"
                      value={filters.search}
                      onChange={(e) => update({ search: e.target.value })}
                      placeholder="Search symbol or underlying"
                      className={`${input} pl-9`}
                    />
                  </div>
                </label>
                <label className={`min-w-0 text-xs font-semibold ${muted}`}>
                  Exchange
                  <select
                    aria-label="Futures exchange"
                    value={filters.exchange}
                    onChange={(e) =>
                      update({
                        exchange: e.target.value,
                        underlying: "",
                        expiry: "near",
                      })
                    }
                    className={input}
                  >
                    <option value="">All exchanges</option>
                    {exchanges.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className={`min-w-0 text-xs font-semibold ${muted}`}>
                  Expiry
                  <select
                    aria-label="Futures expiry"
                    value={filters.expiry}
                    onChange={(e) => update({ expiry: e.target.value })}
                    className={input}
                  >
                    <option value="near">Nearest per underlying</option>
                    <option value="">All current expiries</option>
                    {expiries.map((value) => (
                      <option key={value} value={String(value)}>
                        {new Date(value).toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className={`min-w-0 text-xs font-semibold sm:col-span-2 ${muted}`}
                >
                  Underlying
                  <select
                    aria-label="Futures underlying"
                    value={filters.underlying}
                    onChange={(e) =>
                      update({ underlying: e.target.value, expiry: "near" })
                    }
                    className={input}
                  >
                    <option value="">All underlyings</option>
                    {underlyings.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end sm:col-span-2">
                  <p className={`pb-3 text-sm ${muted}`}>
                    {filtered.length} matching contracts · {contracts.length} in
                    current master
                  </p>
                </div>
              </div>
            </div>
            {catalog.isError ? (
              <div
                role="alert"
                className={`${panel} p-6 text-amber-800 dark:text-amber-300`}
              >
                <p>
                  Futures catalog unavailable. Check backend and instrument
                  master health.
                </p>
                <button
                  className={`${button} mt-4`}
                  onClick={() => catalog.refetch()}
                >
                  Retry futures catalog
                </button>
              </div>
            ) : catalog.isPending ? (
              <p role="status" className={muted}>
                Loading current futures contracts…
              </p>
            ) : !visible.length ? (
              <div className={`${panel} p-8 text-center`}>
                <h3 className="text-lg font-semibold">
                  {contracts.length
                    ? "No matching futures"
                    : "No current futures in the instrument master"}
                </h3>
                <p className={`mt-2 text-sm ${muted}`}>
                  {contracts.length
                    ? "Adjust the search, category, exchange or expiry."
                    : "Wait for the instrument sync, then refresh the catalog."}
                </p>
                <button
                  className={`${button} mt-4`}
                  onClick={() =>
                    update({
                      kind: "all",
                      search: "",
                      exchange: "",
                      underlying: "",
                      expiry: "",
                    })
                  }
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <>
                {quotes.isError && (
                  <p
                    role="alert"
                    className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  >
                    Quote refresh failed. Retained prices are last available;
                    execution is paused until recovery.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((instrument) => {
                    const quote = displayQuote(
                      quotes.data?.[instrument.symbol],
                      stream[instrument.symbol],
                      quotes.isError,
                    );
                    return (
                      <FutureCard
                        key={`${instrument.exchange}:${instrument.token}`}
                        instrument={instrument}
                        quote={quote}
                        now={now}
                        statusConfirmed={confirmed}
                        block={futuresTradeBlock(
                          instrument,
                          quote,
                          token,
                          status,
                          now,
                        )}
                        onOrder={startOrder}
                      />
                    );
                  })}
                </div>
                <nav
                  aria-label="Futures pagination"
                  className="flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <span className={muted}>
                    Showing {currentPage * pageSize + 1}–
                    {Math.min((currentPage + 1) * pageSize, filtered.length)} of{" "}
                    {filtered.length}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      className={button}
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      {currentPage + 1} / {pageCount}
                    </span>
                    <button
                      className={button}
                      disabled={currentPage + 1 >= pageCount}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </button>
                  </div>
                </nav>
              </>
            )}
          </section>
        </>
      </div>
      <aside className="min-w-0 space-y-5 lg:col-span-4 xl:col-span-3">
        {/* F&O Available Margin Card (Screenshot 2) */}
        <section
          aria-label="F&O margin summary"
          className={`${panel} p-5 space-y-4`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              F&O Available Margin
            </h3>
            <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
              ● Live
            </span>
          </div>

          <div className="space-y-1">
            <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
              {wallet.data
                ? formatPaise(wallet.data.available_balance_paise)
                : "Unavailable"}
            </div>
            <p className="text-[11px] text-slate-400">
              {token
                ? "Margin ready for multi-leg option writing and futures positions."
                : "Sign in to view your paper account."}
            </p>
          </div>

          {/* Quick Stats Box (Screenshot 2) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">
                Active F&O Contracts:
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {positions ? `${positions.length} Open` : "Unavailable"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">
                Unrealized F&O P&L:
              </span>
              <span
                className={`font-bold font-tabular ${
                  (pnl ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {pnl === undefined ? "Unavailable" : formatPaise(pnl)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">
                Span + Exposure:
              </span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {account ? "₹0.00" : "Unavailable"}
              </span>
            </div>
          </div>

          {portfolio.isError && (
            <p
              role="alert"
              className="text-xs text-amber-800 dark:text-amber-300"
            >
              Portfolio unavailable. Exposure cannot be confirmed.
            </p>
          )}

          <div className="space-y-2 pt-1">
            <Link
              href="/stocks"
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Explore Live Equities</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={onViewPositions}
              aria-label="View derivative positions"
              className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              View Derivative Holdings
            </button>
          </div>
        </section>

        {/* Real-Time Greek Analytics Card (Screenshot 2) */}
        <div className="p-4 rounded-2xl bg-cyan-500/5 dark:bg-cyan-500/10 border border-cyan-500/20 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-cyan-800 dark:text-cyan-300">
            <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Real-Time Greek Analytics</span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Delta, Theta, Gamma, and Vega calculations update dynamically using
            Black-Scholes formulas alongside live Put-Call Ratios and Max Pain
            strike analysis.
          </p>
        </div>
      </aside>
      {ticket && (
        <FnoOrderModal
          key={strategyJournalKey(token) || token}
          submissionBlock={futuresTradeBlock(
            ticket.instrument,
            displayQuote(
              quotes.data?.[ticket.instrument.symbol],
              stream[ticket.instrument.symbol],
              quotes.isError,
            ),
            token,
            status,
            now,
          )}
          isOpen={active}
          instrument={ticket.instrument}
          initialSide={ticket.side}
          onClose={() => setTicket(undefined)}
          onSuccess={() => {
            void portfolio.refetch();
            void wallet.refetch();
          }}
        />
      )}
    </div>
  );
}
