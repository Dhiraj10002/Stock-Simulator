"use client";

import React from "react";
import Link from "next/link";
import {
  Wallet as WalletIcon,
  TrendingUp,
  TrendingDown,
  PieChart,
  RotateCcw,
  Plus,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import type { Wallet, Portfolio } from "@/types";

interface PortfolioSummarySnapshotProps {
  wallet?: Wallet | null;
  portfolio?: Portfolio | null;
  onReset?: () => void;
  onAddFunds?: () => void;
  isResetting?: boolean;
  className?: string;
}

export default function PortfolioSummarySnapshot({
  wallet,
  portfolio,
  onReset,
  onAddFunds,
  isResetting = false,
  className = "",
}: PortfolioSummarySnapshotProps) {
  // Authoritative calculations matching Phase 10 double-entry portfolio accounting:
  // Total Value = Cash Balance + Current Valuation = Cash + Invested + Unrealized P&L
  const cashBalance = wallet?.cash_balance_paise ?? 100000000;
  const availableMargin = wallet?.available_balance_paise ?? 100000000;
  const blockedPaise = wallet?.blocked_paise ?? 0;

  const investedPaise = portfolio?.invested_value_paise ?? 0;
  const currentValuationPaise = portfolio?.current_value_paise ?? 0;
  const unrealizedPnlPaise = portfolio?.unrealized_pnl_paise ?? 0;
  const realizedPnlPaise = portfolio?.realized_pnl_paise ?? 0;
  const totalNetPnlPaise = unrealizedPnlPaise + realizedPnlPaise;

  const totalPortfolioValuePaise = cashBalance + currentValuationPaise;

  const returnPercent =
    investedPaise > 0 ? (unrealizedPnlPaise / investedPaise) * 100 : 0;
  const isProfit = unrealizedPnlPaise >= 0;
  const isTotalProfit = totalNetPnlPaise >= 0;

  const positionsCount = portfolio?.positions?.length ?? 0;
  const valuationStatus = portfolio?.valuation_status ?? "REALTIME";

  const statusBadge = {
    REALTIME: {
      label: "Live Valuation",
      bg: "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
      icon: <ShieldCheck className="w-3 h-3" />,
    },
    STALE: {
      label: "Delayed Valuation",
      bg: "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
      icon: <Clock className="w-3 h-3" />,
    },
    DEGRADED: {
      label: "Degraded Feed",
      bg: "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800",
      icon: <AlertTriangle className="w-3 h-3" />,
    },
  }[valuationStatus];

  return (
    <div
      className={`rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-5 ${className}`}
    >
      {/* Top Banner: Total Portfolio Value & Valuation Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              Total Portfolio Value
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${statusBadge.bg}`}
            >
              {statusBadge.icon}
              <span>{statusBadge.label}</span>
            </span>
          </div>

          <div className="text-3xl font-black font-tabular tracking-tight text-slate-900 dark:text-white mt-1">
            {formatPaise(totalPortfolioValuePaise)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cash ({formatPaise(cashBalance)}) + Invested ({formatPaise(currentValuationPaise)})
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {onAddFunds && (
            <button
              onClick={onAddFunds}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/60 text-xs font-bold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Deposit</span>
            </button>
          )}

          {onReset && (
            <button
              onClick={onReset}
              disabled={isResetting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Reset virtual balance to ₹10 Lakhs"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-amber-500 ${isResetting ? "animate-spin" : ""}`} />
              <span>Reset</span>
            </button>
          )}

          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold shadow-xs transition-colors"
          >
            <span>View Ledger</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* 4-Column Accounting Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Cash Margin */}
        <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 space-y-1">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
            <WalletIcon className="w-3 h-3 text-cyan-600" />
            <span>Available Margin</span>
          </div>
          <div className="text-lg font-black font-tabular text-slate-900 dark:text-slate-100">
            {formatPaise(availableMargin)}
          </div>
          <div className="text-[10px] text-slate-500 font-tabular">
            Blocked: {formatPaise(blockedPaise)}
          </div>
        </div>

        {/* Invested Capital */}
        <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 space-y-1">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Invested Capital
          </div>
          <div className="text-lg font-black font-tabular text-slate-900 dark:text-slate-100">
            {formatPaise(investedPaise)}
          </div>
          <div className="text-[10px] text-slate-500">
            Current: {formatPaise(currentValuationPaise)}
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 space-y-1">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center justify-between">
            <span>Unrealized P&L</span>
            {isProfit ? (
              <TrendingUp className="w-3 h-3 text-emerald-500" />
            ) : (
              <TrendingDown className="w-3 h-3 text-rose-500" />
            )}
          </div>
          <div
            className={`text-lg font-black font-tabular ${
              isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatPaise(unrealizedPnlPaise)}
          </div>
          <div className="text-[10px] font-bold font-tabular">
            <span
              className={
                isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }
            >
              {formatPercent(returnPercent)}
            </span>{" "}
            <span className="text-slate-400 font-normal">on open holdings</span>
          </div>
        </div>

        {/* Total Net P&L (Realized + Unrealized) */}
        <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 space-y-1">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center justify-between">
            <span>Total Realized P&L</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              {positionsCount} Pos
            </span>
          </div>
          <div
            className={`text-lg font-black font-tabular ${
              isTotalProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatPaise(realizedPnlPaise)}
          </div>
          <div className="text-[10px] text-slate-500 font-tabular">
            Net P&L:{" "}
            <span
              className={`font-bold ${
                isTotalProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatPaise(totalNetPnlPaise)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
