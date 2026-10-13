"use client";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useDisplayPolling } from "@/hooks/useDisplayPolling";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { publicFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useAccountPortfolio } from "@/hooks/useAccountPortfolio";
import { isDerivativePosition } from "@/lib/fnoExplore";
import { formatPaise } from "@/lib/format";
import {
  derivativePnl,
  displayQuote,
  futuresTradeBlock,
  sortedFutures,
  parseFuturesCatalog,
} from "@/lib/fnoExplore";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import { useUIStore } from "@/stores/ui-store";
import TopIndexFutures from "@/components/trading/TopIndexFutures";
import { strategyJournalKey } from "@/lib/strategyExecution";
import FnoStockOverview from "@/components/trading/FnoStockOverview";
import dynamic from "next/dynamic";
const FnoOrderModal = dynamic(() => import("@/components/trading/FnoOrderModal"), { ssr: false });
import type { Instrument, Quote } from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-[#ffffff] shadow-sm dark:border-slate-800 dark:bg-[#0f172a]";
const bounded = <T,>(path: string, signal: AbortSignal) =>
  publicFetch<T>(path, AbortSignal.any([signal, AbortSignal.timeout(8000)]));

export default function FnoExplorePage({
  active = true,
  onViewPositions,
}: {
  active?: boolean;
  onViewPositions?: () => void;
}) {
  const setSearchPaletteOpen = useUIStore((s) => s.setSearchPaletteOpen);
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

  const market = useMarketStatus("NFO", active, true);
  const status =
    !market.isError && now - market.dataUpdatedAt < 30000
      ? market.data
      : undefined;

  const contracts = sortedFutures(
    catalog.isError ? [] : catalog.data || [],
    now,
  );

  const symbols = active && ticket ? [ticket.instrument.symbol] : [];
  useTargetedSubscription(symbols);
  const stream = useMultiSymbolQuotes(symbols);
  const displayInterval = useDisplayPolling(symbols);
  const quotes = useQuery({
    queryKey: ["fno-futures-quotes", symbols],
    queryFn: ({ signal }) =>
      bounded<Record<string, Quote>>(
        `/market/quotes/batch?symbols=${encodeURIComponent(symbols.join(","))}`,
        signal,
      ),
    enabled: active && symbols.length > 0,
    refetchInterval: active ? displayInterval : false,
    retry: false,
  });

  const token = useAuthToken();
  const wallet = useAccountWallet();
  const portfolio = useAccountPortfolio(active);
  const account = token && !portfolio.isError ? portfolio.data : undefined;
  const positions = account?.positions
    .filter(isDerivativePosition)
    .filter((p) => p.quantity !== 0);
  const pnl = account ? derivativePnl(account.positions) : undefined;

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
            setSearchPaletteOpen(true, underlying);
          }}
        />
        <TopIndexFutures
          contracts={contracts}
          active={active}
          now={now}
          status={status}
          catalogPending={catalog.isPending}
          catalogError={catalog.isError}
          onRetry={() => catalog.refetch()}
          onOrder={startOrder}
        />
      </div>
      <aside className="min-w-0 space-y-5 lg:col-span-4 xl:col-span-3">
        {/* F&O Available Margin Card */}
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

          {/* Quick Stats Box */}
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
            {!token ? (
              <>
                <Link
                  href="/login?redirect=/options"
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Log In to Trade F&O</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <button
                  onClick={onViewPositions}
                  aria-label="View derivative positions"
                  className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  View Derivative Holdings
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </section>

        {/* Understand derivative risk Card */}
        <div className="p-4 rounded-2xl bg-cyan-500/5 dark:bg-cyan-500/10 border border-cyan-500/20 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-cyan-800 dark:text-cyan-300">
            <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Understand derivative risk</span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Futures and written options use margin; losses can exceed the initial
            margin. Long options can lose the premium paid. Simulator margin
            is an estimate, checked again before execution.
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
