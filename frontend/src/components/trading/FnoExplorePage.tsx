"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { publicFetch, apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { formatPaise } from "@/lib/format";
import {
  isDerivativePosition,
  sortedFutures,
  parseFuturesCatalog,
  type FuturesMarketStatus,
} from "@/lib/fnoExplore";
import TopIndexFutures from "@/components/trading/TopIndexFutures";
import FnoStockOverview from "@/components/trading/FnoStockOverview";
import FnoOrderModal from "@/components/trading/FnoOrderModal";
import type { Instrument, Portfolio } from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 shadow-xs";
const bounded = <T,>(path: string, signal: AbortSignal) =>
  publicFetch<T>(path, AbortSignal.any([signal, AbortSignal.timeout(8000)]));

export default function FnoExplorePage({
  active = true,
  onSelectOptionChain,
}: {
  active?: boolean;
  onViewPositions?: () => void;
  onSelectOptionChain?: (symbol: string) => void;
}) {
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
  const positions = (account?.positions ?? []).filter(
    (p) => isDerivativePosition(p) && p.quantity !== 0,
  );

  const availableBalancePaise =
    wallet.data?.available_balance_paise ?? 100000000;
  const unrealizedPnlPaise = account?.unrealized_pnl_paise ?? 0;
  const isProfit = unrealizedPnlPaise >= 0;

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
      {/* ===================================================================== */}
      {/* LEFT COLUMN: F&O EXPLORE CONTENT (8 or 9 Cols)                       */}
      {/* ===================================================================== */}
      <div className="min-w-0 space-y-6 lg:col-span-8 xl:col-span-9">
        {/* 1. TOP 3 FEATURED CARDS & 2. F&O STOCKS TABLE (EXACTLY 6 ROWS) */}
        <FnoStockOverview
          active={active}
          futures={contracts}
          now={now}
          sessionLive={confirmed}
          onChain={onSelectOptionChain}
        />

        {/* 3. TOP TRADED INDEX FUTURES (4 CARDS WITH BUY / SELL) */}
        <TopIndexFutures
          contracts={contracts}
          active={active}
          now={now}
          status={status}
          onOrder={startOrder}
        />
      </div>

      {/* ===================================================================== */}
      {/* RIGHT COLUMN: F&O MARGIN UTILIZATION & REAL-TIME GREEKS (4 or 3 Cols) */}
      {/* ===================================================================== */}
      <aside className="min-w-0 space-y-5 lg:col-span-4 xl:col-span-3 lg:sticky lg:top-24">
        {/* F&O Available Margin Card */}
        <div className={`${panel} p-5 space-y-4`}>
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
              {formatPaise(availableBalancePaise)}
            </div>
            <p className="text-[11px] text-slate-400">
              Margin ready for multi-leg option writing and futures positions.
            </p>
          </div>

          {/* Quick Stats Box */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Active F&O Contracts:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {positions.length} Open
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Unrealized F&O P&L:</span>
              <span
                className={`font-bold font-tabular ${
                  isProfit
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatPaise(unrealizedPnlPaise)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Span + Exposure:</span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                ₹0.00
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <Link
              href="/stocks"
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Explore Live Equities</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/portfolio"
              className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors text-center"
            >
              <span>View Derivative Holdings</span>
            </Link>
          </div>
        </div>

        {/* Real-Time Greek Analytics Card */}
        <div className="p-4 rounded-2xl bg-cyan-500/5 dark:bg-cyan-500/10 border border-cyan-500/20 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-cyan-800 dark:text-cyan-300">
            <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Real-Time Greek Analytics</span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Delta, Theta, Gamma, and Vega calculations update dynamically using Black-Scholes formulas alongside live Put-Call Ratios and Max Pain strike analysis.
          </p>
        </div>
      </aside>

      {/* Direct Order Ticket Modal */}
      {ticket && (
        <FnoOrderModal
          isOpen={!!ticket}
          onClose={() => setTicket(undefined)}
          instrument={ticket.instrument}
          initialSide={ticket.side}
          availableBalancePaise={availableBalancePaise}
        />
      )}
    </div>
  );
}
