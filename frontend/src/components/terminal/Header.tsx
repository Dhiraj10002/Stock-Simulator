"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  RefreshCw,
  Clock,
  User as UserIcon,
  LogOut,
  FileText,
  AlertTriangle,
  Zap,
  Layers,
  BarChart2,
} from "lucide-react";
import { formatPaise, formatPercent, getIndianMarketStatus } from "@/lib/format";
import type { User, Wallet, Portfolio } from "@/types";

type HeaderProps = {
  user: User | null;
  wallet: Wallet | null;
  portfolio: Portfolio | null;
  onSignOut: () => void;
  onOpenLedger: () => void;
  onOpenOptionChain?: () => void;
  onOpenPerformance?: () => void;
  onResetSimulation: () => void;
  onSquareOffMIS?: () => void;
  resetting: boolean;
  offHoursPracticeMode?: boolean;
  onTogglePracticeMode?: () => void;
};

export default function Header({
  user,
  wallet,
  portfolio,
  onSignOut,
  onOpenLedger,
  onOpenOptionChain,
  onOpenPerformance,
  onResetSimulation,
  onSquareOffMIS,
  resetting,
  offHoursPracticeMode = false,
  onTogglePracticeMode,
}: HeaderProps) {
  const [marketStatus, setMarketStatus] = useState(getIndianMarketStatus());
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Re-calculate market hours every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getIndianMarketStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const pnlPaise = portfolio?.unrealized_pnl_paise ?? 0;
  const isProfit = pnlPaise >= 0;
  const investedPaise = portfolio?.invested_value_paise ?? 0;
  const pnlPercent =
    investedPaise > 0 ? (pnlPaise / investedPaise) * 100 : 0;

  const blockedPaise = wallet?.blocked_paise ?? 0;
  const cashPaise = wallet?.cash_balance_paise ?? 0;
  const equityPaise = cashPaise + pnlPaise;
  const marginUtilization =
    blockedPaise > 0
      ? equityPaise <= 0
        ? 999
        : Math.round((blockedPaise * 100) / equityPaise)
      : 0;

  const isMarginCritical = marginUtilization >= 120 || (blockedPaise > 0 && equityPaise <= 0);
  const isMarginCall = marginUtilization >= 100;
  const isMarginWarning = marginUtilization >= 80;

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Brand & Market Session Pill */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center font-black text-slate-950 text-sm shadow-lg shadow-cyan-500/20">
            SS
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5 leading-none">
              STOCK <span className="text-cyan-400 font-extrabold">SIMULATOR</span>
            </h1>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
              Paper Execution Engine
            </span>
          </div>
        </div>

        {/* Live Market Status Pill */}
        <div
          className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
            marketStatus.isOpen
              ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-300"
              : "bg-amber-950/60 border-amber-500/30 text-amber-300"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              marketStatus.isOpen
                ? "bg-emerald-400 animate-pulse"
                : "bg-amber-400"
            }`}
          />
          <span className="font-semibold">{marketStatus.statusText}</span>
          <span className="text-slate-400 text-[10px] flex items-center gap-1 border-l border-slate-700/60 pl-2">
            <Clock className="w-3 h-3" />
            {marketStatus.istTime}
          </span>
        </div>

        {/* Margin Health Status Pill */}
        <div
          title={
            isMarginCritical
              ? "CRITICAL DEFICIT: Margin utilization exceeds 120%."
              : isMarginCall
              ? "MARGIN CALL: Blocked margin exceeds available equity."
              : isMarginWarning
              ? "MARGIN WARNING: Over 80% of account equity is utilized."
              : "Margin Status: Healthy"
          }
          className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            isMarginCritical || isMarginCall
              ? "bg-rose-950/80 border-rose-500/60 text-rose-300 animate-pulse shadow-sm shadow-rose-500/20"
              : isMarginWarning
              ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
              : "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isMarginCritical || isMarginCall
                ? "bg-rose-400 animate-ping"
                : isMarginWarning
                ? "bg-amber-400"
                : "bg-emerald-400"
            }`}
          />
          <span>
            {isMarginCritical ? "CRITICAL" : isMarginCall ? "MARGIN CALL" : isMarginWarning ? `Margin ${marginUtilization}%` : "Margin OK"}
          </span>
        </div>
      </div>

      {/* Virtual Capital Metrics */}
      <div className="hidden md:flex items-center gap-6 text-xs">
        {/* Available Cash */}
        <div className="flex flex-col">
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            <WalletIcon className="w-3 h-3 text-cyan-400" />
            Available Balance
          </span>
          <strong className="text-sm font-semibold text-slate-100">
            {formatPaise(wallet?.available_balance_paise)}
          </strong>
        </div>

        {/* Portfolio Valuation */}
        <div className="flex flex-col">
          <span className="text-[11px] text-slate-400 font-medium">
            Portfolio Value
          </span>
          <strong className="text-sm font-semibold text-slate-100">
            {formatPaise(portfolio?.current_value_paise)}
          </strong>
        </div>

        {/* Unrealized P&L */}
        <div className="flex flex-col">
          <span className="text-[11px] text-slate-400 font-medium">
            Unrealized P&L
          </span>
          <div className="flex items-center gap-1">
            {isProfit ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <strong
              className={`text-sm font-bold ${
                isProfit ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatPaise(pnlPaise)}
            </strong>
            <span
              className={`text-[10px] px-1 py-0.5 rounded font-semibold ${
                isProfit
                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                  : "bg-rose-950/60 text-rose-400 border border-rose-800/40"
              }`}
            >
              {formatPercent(pnlPercent)}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons & Profile */}
      <div className="flex items-center gap-2">
        {/* Square Off MIS Button */}
        {onSquareOffMIS && (
          <button
            onClick={onSquareOffMIS}
            title="Auto Square-Off all open Intraday (MIS) positions and cancel pending orders"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 text-xs font-medium transition-all"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">Square Off MIS</span>
          </button>
        )}

        {/* Option Chain Button */}
        {onOpenOptionChain && (
          <button
            onClick={onOpenOptionChain}
            title="Open F&O Option Chain with Black-Scholes Greeks"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 text-xs font-medium transition-all"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Option Chain</span>
          </button>
        )}

        {/* Trader Analytics & Journal Button */}
        {onOpenPerformance && (
          <button
            onClick={onOpenPerformance}
            title="Open Trader Performance Analytics, Zerodha-Style P&L Calendar & Trade Journal"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 text-xs font-medium transition-all"
          >
            <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Analytics</span>
          </button>
        )}

        {/* Ledger Statement Button */}
        <button
          onClick={onOpenLedger}
          title="View Double-Entry Ledger Statement"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-all"
        >
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Ledger</span>
        </button>

        {/* Simulation Reset Button */}
        <button
          onClick={() => setShowResetConfirm(true)}
          disabled={resetting}
          title="Reset Simulation Capital to ₹10,00,000"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 hover:border-amber-500/40 hover:bg-amber-950/30 text-slate-300 hover:text-amber-300 text-xs font-medium transition-all"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${resetting ? "animate-spin text-amber-400" : ""}`}
          />
          <span className="hidden sm:inline">Reset</span>
        </button>

        {/* User Badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <UserIcon className="w-3.5 h-3.5" />
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-medium text-slate-200 leading-tight">
              {user?.name || "Trader"}
            </span>
            <span className="text-[10px] text-slate-500 leading-tight">
              {user?.email}
            </span>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Simulation Reset */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Reset Simulation?</h3>
                <p className="text-xs text-slate-400">
                  This will liquidate all holdings and restore ₹10,00,000 cash.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              All active orders will be cancelled, open delivery & margin positions will be closed, and your cash balance will be reset to ₹10,00,000. An immutable audit snapshot will be archived.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetSimulation();
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors shadow-lg shadow-amber-500/20"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
