"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  User as UserIcon,
  LogOut,
  FileText,
  AlertTriangle,
  Zap,
  Layers,
  BarChart2,
  Search,
  LayoutDashboard,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { formatPaise, formatPercent, getIndianMarketStatus } from "@/lib/format";
import type { User, Wallet, Portfolio } from "@/types";
import { useUIStore } from "@/stores/ui-store";

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
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const setSearchPaletteOpen = useUIStore((s) => s.setSearchPaletteOpen);

  // Re-calculate market hours every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getIndianMarketStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pnlPaise = portfolio?.unrealized_pnl_paise ?? 0;
  const isProfit = pnlPaise >= 0;
  const investedPaise = portfolio?.invested_value_paise ?? 0;
  const pnlPercent = investedPaise > 0 ? (pnlPaise / investedPaise) * 100 : 0;

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
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-3 lg:px-5 py-2 flex items-center justify-between gap-3 sticky top-0 z-30 select-none">
      {/* 1. Brand & Market Session Strip */}
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center font-black text-slate-950 text-xs shadow-md shadow-cyan-500/10 group-hover:scale-105 transition-transform">
            SS
          </div>
          <div>
            <div className="font-bold text-xs tracking-tight text-white flex items-center gap-1.5 leading-tight">
              STOCK <span className="text-cyan-400 font-extrabold">SIMULATOR</span>
            </div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-medium leading-none">
              Paper Desk
            </div>
          </div>
        </Link>

        {/* Quick Nav to Dashboard */}
        <Link
          href="/"
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-cyan-400 transition-colors"
          title="Terminal Overview Dashboard"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>

        {/* Global Search Button */}
        <button
          onClick={() => setSearchPaletteOpen(true)}
          className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          title="Search all instruments (Ctrl+K)"
        >
          <Search className="w-3 h-3 text-cyan-400" />
          <span>Search</span>
          <kbd className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
            Ctrl+K
          </kbd>
        </button>

        {/* Minimalist Market Status */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
            marketStatus.isOpen
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
              : "bg-slate-900/90 border-slate-800 text-slate-400"
          }`}
          title={`Market Hours: 09:15 - 15:30 IST. Current: ${marketStatus.istTime}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              marketStatus.isOpen ? "bg-emerald-400 animate-pulse" : "bg-amber-400/80"
            }`}
          />
          <span className="font-semibold text-slate-200">
            {marketStatus.isOpen ? "LIVE" : "CLOSED"}
          </span>
          <span className="text-[9px] text-slate-400 flex items-center gap-0.5 border-l border-slate-800 pl-1.5">
            <Clock className="w-2.5 h-2.5" />
            {marketStatus.istTime}
          </span>
        </div>

        {/* Margin Status Indicator (Compact) */}
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
          className={`hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
            isMarginCritical || isMarginCall
              ? "bg-rose-950/60 border-rose-500/50 text-rose-300 animate-pulse"
              : isMarginWarning
              ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
              : "bg-slate-900/80 border-slate-800 text-slate-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isMarginCritical || isMarginCall
                ? "bg-rose-400"
                : isMarginWarning
                ? "bg-amber-400"
                : "bg-emerald-400"
            }`}
          />
          <span>
            {isMarginCritical ? "DEFICIT" : isMarginCall ? "MARGIN CALL" : isMarginWarning ? `Margin ${marginUtilization}%` : "Margin OK"}
          </span>
        </div>

        {/* Off-hours practice mode toggle indicator */}
        {onTogglePracticeMode && (
          <button
            onClick={onTogglePracticeMode}
            className={`hidden 2xl:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
              offHoursPracticeMode
                ? "bg-indigo-950/40 border-indigo-500/30 text-indigo-300"
                : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
            title="Toggle Off-Hours Market Simulation Practice Mode"
          >
            <span>Practice: {offHoursPracticeMode ? "ON" : "OFF"}</span>
          </button>
        )}
      </div>

      {/* 2. Central Financial Metrics (Institutional Cockpit) */}
      <div className="hidden md:flex items-center gap-5 text-xs">
        {/* Available Cash Balance */}
        <div className="flex flex-col text-left">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Available Cash
          </span>
          <strong className="text-xs font-bold text-slate-100 font-mono">
            {formatPaise(wallet?.available_balance_paise)}
          </strong>
        </div>

        <div className="h-6 w-px bg-slate-800/80" />

        {/* Portfolio Valuation */}
        <div className="flex flex-col text-left">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Portfolio Value
          </span>
          <strong className="text-xs font-bold text-slate-100 font-mono">
            {formatPaise(portfolio?.current_value_paise)}
          </strong>
        </div>

        <div className="h-6 w-px bg-slate-800/80" />

        {/* Unrealized P&L */}
        <div className="flex flex-col text-left">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Unrealized P&L
          </span>
          <div className="flex items-center gap-1 font-mono">
            {isProfit ? (
              <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <TrendingDown className="w-3 h-3 text-rose-400 shrink-0" />
            )}
            <strong
              className={`text-xs font-bold ${
                isProfit ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatPaise(pnlPaise)}
            </strong>
            <span
              className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                isProfit
                  ? "bg-emerald-950/50 text-emerald-400 border border-emerald-800/30"
                  : "bg-rose-950/50 text-rose-400 border border-rose-800/30"
              }`}
            >
              {formatPercent(pnlPercent)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Action Toolbar & Profile Menu */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Unified Tools Group (Segmented Bar) */}
        <div className="flex items-center bg-slate-900/90 border border-slate-800/80 rounded-lg p-0.5 gap-0.5">
          {/* Option Chain Button */}
          {onOpenOptionChain && (
            <button
              onClick={onOpenOptionChain}
              title="Open F&O Option Chain with Greeks (Hotkey: 0)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-cyan-300 hover:bg-slate-800/90 transition-all"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline text-[11px]">Options</span>
            </button>
          )}

          {/* Trader Analytics Button */}
          {onOpenPerformance && (
            <button
              onClick={onOpenPerformance}
              title="Open Performance Analytics & P&L Calendar (Hotkey: P)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-purple-300 hover:bg-slate-800/90 transition-all"
            >
              <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline text-[11px]">Analytics</span>
            </button>
          )}

          {/* Ledger Button */}
          <button
            onClick={onOpenLedger}
            title="Double-Entry Ledger & Contract Notes (Hotkey: L)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-emerald-300 hover:bg-slate-800/90 transition-all"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline text-[11px]">Ledger</span>
          </button>
        </div>

        {/* User Profile & Account Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-lg border border-slate-800/80 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 transition-all"
            title="Account & Quick Settings"
          >
            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 text-xs font-bold">
              {user?.name ? user.name.charAt(0).toUpperCase() : "T"}
            </div>
            <span className="hidden lg:inline text-xs font-medium text-slate-200 max-w-[100px] truncate">
              {user?.name || "Trader"}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                isUserMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 animate-fade-in space-y-1">
              {/* Account Info Header */}
              <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 font-bold text-sm">
                    {user?.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">
                      {user?.name || "Paper Trader"}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {user?.email || "trader@simulator.local"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/30">
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                  <span>Verified Paper Execution Account</span>
                </div>
              </div>

              {/* Quick Action: Square Off MIS */}
              {onSquareOffMIS && (
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSquareOffMIS();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-amber-300 hover:bg-amber-950/40 border border-transparent hover:border-amber-500/20 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <div className="text-left">
                    <div className="font-semibold">Square-Off All MIS</div>
                    <div className="text-[9px] text-slate-400">Close open intraday positions</div>
                  </div>
                </button>
              )}

              {/* Quick Action: Reset Simulation */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setShowResetConfirm(true);
                }}
                disabled={resetting}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:text-amber-300 hover:bg-slate-800/80 transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-amber-400 ${resetting ? "animate-spin" : ""}`}
                />
                <div className="text-left">
                  <div className="font-semibold">Reset Simulation</div>
                  <div className="text-[9px] text-slate-400">Restore ₹10,00,000 cash balance</div>
                </div>
              </button>

              <div className="h-px bg-slate-800/80 my-1" />

              {/* Sign Out */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onSignOut();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-950/30 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="font-semibold">Sign Out</span>
              </button>
            </div>
          )}
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
