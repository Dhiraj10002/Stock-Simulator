"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  Search,
  Clock,
  User as UserIcon,
  RotateCcw,
  BarChart2,
  PieChart,
  ClipboardList,
  Bookmark,
  LayoutDashboard,
  BrainCircuit,
  Layers,
  Keyboard,
  LogOut,
  Sun,
  Moon,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { formatPaise, getIndianMarketStatus } from "@/lib/format";
import { useMarketStore } from "@/stores/market-store";
import { useUIStore } from "@/stores/ui-store";
import { useTheme } from "@/providers/theme-provider";
import { useRiskOverview } from "@/hooks/useRiskOverview";

interface NavbarProps {
  cashBalancePaise?: number;
  availableBalancePaise?: number;
  unrealizedPnlPaise?: number;
  onResetSimulation?: () => void;
  onSignOut?: () => void;
  resetting?: boolean;
}

const NAV_LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stocks", label: "Stocks", icon: TrendingUp, highlight: true },
  { href: "/options", label: "F&O Hub", icon: Layers },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/mentor", label: "AI Mentor", icon: BrainCircuit },
];

export default function Navbar({
  availableBalancePaise = 100000000,
  unrealizedPnlPaise = 0,
  onResetSimulation,
  onSignOut,
  resetting = false,
}: NavbarProps) {
  const pathname = usePathname();
  const setSearchPaletteOpen = useUIStore((s) => s.setSearchPaletteOpen);
  const setShortcutsGuideOpen = useUIStore((s) => s.setShortcutsGuideOpen);
  const quotes = useMarketStore((s) => s.quotes);
  const { theme, toggleTheme, setTheme } = useTheme();

  const [marketStatus, setMarketStatus] = useState(getIndianMarketStatus());
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { overview, isBreached } = useRiskOverview();

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setMarketStatus(getIndianMarketStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Indices
  const niftyQuote = quotes["NIFTY"];
  const niftyPrice = niftyQuote ? niftyQuote.price_paise : 2339450;
  const niftyChange = niftyQuote?.change_percent ?? 0.35;

  const sensexQuote = quotes["SENSEX"];
  const sensexPrice = sensexQuote ? sensexQuote.price_paise : 7473654;
  const sensexChange = sensexQuote?.change_percent ?? 0.18;

  const isProfit = unrealizedPnlPaise >= 0;

  return (
    <header className="border-b border-slate-200 dark:border-white/[0.08] bg-white/90 dark:bg-[#06080e]/85 backdrop-blur-xl sticky top-0 z-40 transition-colors duration-150 relative">
      {/* Specular gradient flare line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/35 dark:via-cyan-500/30 to-transparent absolute -bottom-[1px] left-0 pointer-events-none" />

      {/* Top Utility Bar */}
      <div className="px-4 lg:px-6 py-2 flex items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/[0.06]">
        {/* Left: Brand + Market Status + Indices Ticker */}
        <div className="flex items-center gap-4 lg:gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-black text-sm text-slate-950 shadow-md group-hover:scale-105 transition-transform">
              SS
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                STOCK <span className="text-cyan-600 dark:text-cyan-400 font-mono">SIMULATOR</span>
              </span>
              <span className="text-[10px] tracking-wider text-slate-600 dark:text-slate-400 uppercase font-semibold block -mt-0.5">
                Institutional Paper Desk
              </span>
            </div>
          </Link>

          {/* Market Session Status Pill */}
          <div
            className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              marketStatus.isOpen
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 dark:shadow-[0_0_12px_-2px_rgba(16,185,129,0.2)]"
                : "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 dark:shadow-[0_0_12px_-2px_rgba(245,158,11,0.2)]"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                marketStatus.isOpen
                  ? "bg-emerald-500 dark:bg-emerald-400 animate-pulse"
                  : "bg-amber-500 dark:bg-amber-400"
              }`}
            />
            <span className="font-semibold">{marketStatus.statusText}</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800/60">
              Angel One • Live
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-[10px] flex items-center gap-1 border-l border-slate-300 dark:border-slate-700/60 pl-2">
              <Clock className="w-3 h-3" />
              {marketStatus.istTime}
            </span>
          </div>

          {/* Indices Ticker */}
          <div className="hidden xl:flex items-center gap-4 text-xs border-l border-slate-200 dark:border-white/[0.08] pl-4">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg dark:bg-white/[0.03] dark:border dark:border-white/[0.05]">
              <span className="font-semibold text-slate-600 dark:text-slate-400">NIFTY 50</span>
              <span className="font-bold text-slate-900 dark:text-slate-200 font-tabular">
                {formatPaise(niftyPrice)}
              </span>
              <span
                className={`flex items-center text-[11px] font-semibold ${
                  niftyChange >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {niftyChange >= 0 ? "+" : ""}
                {niftyChange.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg dark:bg-white/[0.03] dark:border dark:border-white/[0.05]">
              <span className="font-semibold text-slate-600 dark:text-slate-400">SENSEX</span>
              <span className="font-bold text-slate-900 dark:text-slate-200 font-tabular">
                {formatPaise(sensexPrice)}
              </span>
              <span
                className={`flex items-center text-[11px] font-semibold ${
                  sensexChange >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {sensexChange >= 0 ? "+" : ""}
                {sensexChange.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Global Search & Shortcuts */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors w-36 sm:w-48 lg:w-60 shadow-xs"
          >
            <Search className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span className="truncate">Search stocks, F&O...</span>
            <kbd className="ml-auto hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-white/[0.06] border border-slate-300 dark:border-white/[0.1] rounded shadow-xs">
              Ctrl+K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setShortcutsGuideOpen(true)}
            title="Keyboard Shortcuts Guide (?)"
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-slate-600 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400 transition-colors cursor-pointer"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          {/* Theme Toggle Button */}
          {mounted && (
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
              aria-label={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5 text-amber-400 transition-transform rotate-0 hover:rotate-45" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-cyan-600 transition-transform -rotate-12 hover:rotate-0" />
              )}
            </button>
          )}
        </div>

        {/* Account Info & User Profile */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
          {/* Institutional RMS Risk Pill */}
          {overview && (
            <Link
              href="/portfolio"
              title={`RMS Margin Utilization: ${overview.margin_utilization_pct.toFixed(1)}% (${overview.status})`}
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${
                overview.status === "CRITICAL"
                  ? "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold"
                  : overview.status === "MARGIN_CALL"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 font-bold"
                  : overview.status === "WARNING"
                  ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-600 dark:text-yellow-400 font-bold"
                  : "bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:border-cyan-500/50"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  overview.status === "HEALTHY"
                    ? "bg-emerald-500"
                    : overview.status === "WARNING"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-rose-500 animate-ping"
                }`}
              />
              <span className="font-mono text-[11px]">
                RMS: <span className="font-bold">{overview.margin_utilization_pct.toFixed(0)}%</span>
              </span>
            </Link>
          )}

          {/* Available Cash */}
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center justify-end gap-1">
              <WalletIcon className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              Available Margin
            </span>
            <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-tabular">
              {formatPaise(availableBalancePaise)}
            </strong>
          </div>

          {/* Unrealized P&L */}
          <div className="hidden md:flex flex-col text-right border-l border-slate-200 dark:border-white/[0.08] pl-3">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Unrealized P&L
            </span>
            <div className="flex items-center justify-end gap-1">
              {isProfit ? (
                <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <strong
                className={`text-xs font-bold font-tabular ${
                  isProfit
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatPaise(unrealizedPnlPaise)}
              </strong>
            </div>
          </div>

          {/* Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 dark:hover:border-cyan-500/60 transition-colors cursor-pointer shadow-xs"
            >
              <UserIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl py-2 z-50 animate-fade-in text-slate-800 dark:text-slate-200 backdrop-blur-xl">
                <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-white/[0.06]">
                  <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                    Dhiraj (Trader)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    Demat: SS-89104
                  </div>
                </div>

                <div className="p-1.5 space-y-1">
                  {/* Theme Switcher in Dropdown */}
                  <div className="px-3 py-1.5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-medium">Theme</span>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] p-0.5 rounded-lg border border-slate-200 dark:border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => setTheme("light")}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                          theme === "light"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <Sun className="w-3 h-3 text-amber-500" />
                        <span>Light</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("dark")}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                          theme === "dark"
                            ? "bg-cyan-500/20 text-cyan-300 shadow-xs border border-cyan-500/30"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Moon className="w-3 h-3 text-cyan-400" />
                        <span>Dark</span>
                      </button>
                    </div>
                  </div>

                  <Link
                    href="/analytics"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] rounded-xl transition-colors"
                  >
                    <BarChart2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    Console & Statements
                  </Link>

                  {onResetSimulation && (
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onResetSimulation();
                      }}
                      disabled={resetting}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl text-left transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                      Reset Account (₹10L)
                    </button>
                  )}

                  {onSignOut && (
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onSignOut();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-left border-t border-slate-200 dark:border-white/[0.06] mt-1 pt-2 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      Sign Out
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-time RMS Risk Warning Banner (Triggered when WARNING, MARGIN_CALL, or CRITICAL) */}
      {isBreached && overview && (
        <div
          className={`px-4 lg:px-6 py-2 text-xs font-semibold flex items-center justify-between gap-3 border-b transition-colors shadow-inner ${
            overview.status === "CRITICAL"
              ? "bg-rose-600/15 border-rose-500/40 text-rose-800 dark:text-rose-200"
              : overview.status === "MARGIN_CALL"
              ? "bg-amber-600/15 border-amber-500/40 text-amber-800 dark:text-amber-200"
              : "bg-yellow-600/15 border-yellow-500/40 text-yellow-800 dark:text-yellow-200"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-current animate-bounce" />
            <span className="font-extrabold uppercase tracking-wide px-2 py-0.5 rounded text-[10px] bg-black/10 dark:bg-white/10 font-mono">
              {overview.status.replace("_", " ")} ({overview.margin_utilization_pct.toFixed(1)}% Utilized)
            </span>
            <span className="truncate">{overview.message}</span>
            {overview.intraday_positions_count > 0 && (
              <span className="hidden md:inline-block font-mono font-bold text-[11px] opacity-90 pl-1 border-l border-current/30">
                {overview.intraday_positions_count} Intraday MIS at liquidation risk
              </span>
            )}
          </div>
          <Link
            href="/portfolio"
            className="shrink-0 px-3 py-1 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-xs font-bold transition-colors"
          >
            Review Risk Desk &rarr;
          </Link>
        </div>
      )}

      {/* Primary Route Navigation Tabs (Row 2): Modern MotionSites Floating Pill Tabs */}
      <nav className="px-4 lg:px-6 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {NAV_LINKS.map((link) => {
          const Icon = link.icon;
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                isActive
                  ? "bg-cyan-500/10 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 dark:border-cyan-400/40 shadow-[0_0_16px_-3px_rgba(6,182,212,0.3)] font-bold"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-white/[0.05]"
              } ${link.highlight && !isActive ? "text-slate-800 dark:text-slate-200" : ""}`}
            >
              <Icon
                className={`w-3.5 h-3.5 ${
                  isActive
                    ? "text-cyan-600 dark:text-cyan-400"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              />
              <span>{link.label}</span>
              {link.highlight && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
