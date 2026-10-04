"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw, Search, Wallet } from "lucide-react";
import { publicFetch, apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useAccountWallet } from "@/hooks/useAccountWallet";
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
  isDerivativePosition,
  sortedFutures,
  parseFuturesCatalog,
  type FuturesFilters,
  type FuturesMarketStatus,
} from "@/lib/fnoExplore";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
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
            {finite(quote?.volume)}
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
  const symbols = active ? visible.map((i) => i.symbol) : [];
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
  const blocked = positions?.every((p) =>
    Number.isFinite(p.margin_blocked_paise),
  )
    ? positions.reduce((total, p) => total + p.margin_blocked_paise!, 0)
    : undefined;
  const update = (patch: Partial<FuturesFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(0);
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["fno-equities"] });
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
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <FnoStockOverview
          active={active}
          futures={contracts}
          now={now}
          sessionLive={confirmed}
          onTrade={(underlying) => {
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
        <section
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
                Futures catalog unavailable. Check backend and instrument master
                health.
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
      </div>
      <aside className="min-w-0 space-y-4">
        <section aria-label="F&O margin summary" className={`${panel} p-5`}>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Wallet
              aria-hidden
              className="h-5 w-5 text-cyan-700 dark:text-cyan-400"
            />
            F&O Available Margin
          </h2>
          <p className={`mt-4 text-sm ${muted}`}>Available paper balance</p>
          <p className="mt-1 break-words text-3xl font-bold tabular-nums">
            {wallet.data
              ? formatPaise(wallet.data.available_balance_paise)
              : "Unavailable"}
          </p>
          <p className={`mt-2 text-xs ${muted}`}>
            {token
              ? "Shared across delivery, intraday and derivatives."
              : "Sign in to view your paper account."}
          </p>
          <dl className="mt-5 space-y-4 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
            {[
              [
                "Active F&O contracts",
                positions ? `${positions.length} open` : "Unavailable",
              ],
              [
                "Unrealized F&O P&L",
                pnl === undefined ? "Unavailable" : formatPaise(pnl),
              ],
              [
                "Blocked F&O margin",
                blocked === undefined ? "Unavailable" : formatPaise(blocked),
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-2">
                <dt className={muted}>{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {portfolio.isError && (
            <p
              role="alert"
              className="mt-4 text-sm text-amber-800 dark:text-amber-300"
            >
              Portfolio unavailable. Exposure cannot be confirmed.
            </p>
          )}
          <p className={`mt-4 text-xs ${muted}`}>
            Valuation: {account?.valuation_status || "Unavailable"}
          </p>
          <Link
            href="/dashboard"
            className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Explore live equities
          </Link>
          <button className={`${button} mt-3 w-full`} onClick={onViewPositions}>
            View derivative positions
          </button>
          <Link
            href="/orders"
            className="mt-3 flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-cyan-800 dark:text-cyan-300"
          >
            Review paper orders
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </section>
        <div className={`${panel} p-5`}>
          <h3 className="font-semibold">Before a paper order</h3>
          <p className={`mt-2 text-sm leading-6 ${muted}`}>
            One lot uses the contract quantity shown on its card. The order
            ticket checks the latest quote, required margin and available funds
            before submission.
          </p>
          <p className={`mt-2 text-xs leading-5 ${muted}`}>
            An accepted order can remain pending. Confirm its status in Orders.
          </p>
        </div>
      </aside>
      {ticket && (
        <FnoOrderModal
          key={token}
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
