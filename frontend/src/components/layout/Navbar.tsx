"use client";

import React, { useState, useEffect, useRef } from "react";
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
  LogOut,
  Sun,
  Moon,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { formatPaise, getIndianMarketStatus } from "@/lib/format";
import { useMarketStore, useSymbolQuote } from "@/stores/market-store";
import { getAuthoritativeFeedStatus } from "@/lib/feedStatus";
import { useUIStore } from "@/stores/ui-store";
import { useTheme } from "@/providers/theme-provider";
import { useRiskOverview } from "@/hooks/useRiskOverview";
import { API_URL } from "@/lib/api";
import ResetSimulationModal from "@/components/modals/ResetSimulationModal";

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
  const { theme, toggleTheme, setTheme } = useTheme();

  const [clientMarketStatus, setClientMarketStatus] = useState(getIndianMarketStatus());
  const feedStatus = useMarketStore((s) => s.feedStatus);
  const serverMarketStatus = useMarketStore((s) => s.marketStatus);
  const connectionState = useMarketStore((s) => s.connectionState);

  const authoritativeStatus = getAuthoritativeFeedStatus(
    feedStatus,
    serverMarketStatus,
    connectionState,
    clientMarketStatus.istTime
  );

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState("Dhiraj");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { overview, isBreached } = useRiskOverview();

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      const storedName = localStorage.getItem("user_name");
      if (storedName) setUserName(storedName);
    });
    const timer = setInterval(() => {
      setClientMarketStatus(getIndianMarketStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showProfileMenu]);

  // Universal Logout Handler across all sections
  const handleLogout = async () => {
    setShowProfileMenu(false);
    if (onSignOut) {
      onSignOut();
      return;
    }
    const refreshToken = localStorage.getItem("stock-simulator-refresh-token");
    if (refreshToken) {
      try {
        const apiUrl = API_URL;
        await fetch(`${apiUrl}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Continue clearing credentials even if backend is offline
      }
    }
    localStorage.removeItem("auth_token");
    localStorage.removeItem("stock-simulator-access-token");
    localStorage.removeItem("stock-simulator-refresh-token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
    window.location.href = "/login";
  };

  // Indices — targeted symbol selectors prevent full navbar rerenders on unrelated ticks
  const niftyQuote = useSymbolQuote("NIFTY");
  const niftyPrice = niftyQuote ? niftyQuote.price_paise : 2339450;
  const niftyChange = niftyQuote?.change_percent ?? 0.35;

  const sensexQuote = useSymbolQuote("SENSEX");
  const sensexPrice = sensexQuote ? sensexQuote.price_paise : 7473654;
  const sensexChange = sensexQuote?.change_percent ?? 0.18;

  const isProfit = unrealizedPnlPaise >= 0;

  return (
    <>
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

          {/* Authoritative Market & Feed Session Status Pill */}
          <div
            className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${authoritativeStatus.pillClasses}`}
            title={authoritativeStatus.tooltip}
          >
            <span
              className={`w-2 h-2 rounded-full ${authoritativeStatus.dotClasses}`}
            />
            <span className="font-semibold">{authoritativeStatus.fullLabel}</span>
            <span className="text-slate-500 dark:text-slate-400 text-[10px] flex items-center gap-1 border-l border-slate-300 dark:border-slate-700/60 pl-2">
              <Clock className="w-3 h-3" />
              {clientMarketStatus.istTime}
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
        </div>

        {/* Account Info & User Profile */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
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
              {unrealizedPnlPaise === 0 ? (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mr-0.5" />
              ) : isProfit ? (
                <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <strong
                className={`text-xs font-bold font-tabular ${
                  unrealizedPnlPaise === 0
                    ? "text-slate-600 dark:text-slate-300"
                    : isProfit
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatPaise(unrealizedPnlPaise)}
              </strong>
            </div>
          </div>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              title="Trader Profile & Account Settings"
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                showProfileMenu
                  ? "bg-cyan-500/15 border-cyan-500 text-cyan-600 dark:text-cyan-400 ring-2 ring-cyan-500/20"
                  : "bg-slate-100 dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.1] text-slate-700 dark:text-slate-200 hover:border-cyan-500/60"
              }`}
            >
              <UserIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2.5 w-72 sm:w-80 bg-white/95 dark:bg-[#0b101d]/95 border border-slate-200/90 dark:border-white/[0.12] rounded-2xl shadow-2xl shadow-slate-900/15 dark:shadow-black/70 p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-200 backdrop-blur-2xl">
                {/* User Identity Header */}
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-cyan-600/20 ring-2 ring-white dark:ring-slate-800">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0b101d]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                        {userName}
                      </span>
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30">
                        PRO
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                      <span>Demat: SS-89104</span>
                      <span>·</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Active</span>
                    </div>
                  </div>
                </div>

                {/* Quick Margin Glance */}
                <div className="my-2.5 p-2.5 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                      <WalletIcon className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                      Available Margin
                    </div>
                    <div className="text-sm font-black font-tabular text-slate-900 dark:text-slate-100 mt-0.5">
                      {formatPaise(availableBalancePaise)}
                    </div>
                  </div>
                  <Link
                    href="/portfolio"
                    onClick={() => setShowProfileMenu(false)}
                    className="px-2.5 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-[11px] font-semibold transition-colors cursor-pointer border border-cyan-200/60 dark:border-cyan-500/30"
                  >
                    Holdings →
                  </Link>
                </div>

                {/* Actions Menu */}
                <div className="space-y-1">
                  {/* Theme Switcher in Dropdown */}
                  <div className="px-2 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Theme</span>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.05] p-0.5 rounded-lg border border-slate-200/80 dark:border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => setTheme("light")}
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                          theme === "light"
                            ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                            : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        <Sun className="w-3 h-3 text-amber-500" />
                        <span>Light</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("dark")}
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                          theme === "dark"
                            ? "bg-cyan-500/20 text-cyan-300 shadow-xs border border-cyan-500/30"
                            : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
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
                    className="flex items-center justify-between px-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] rounded-xl transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <BarChart2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Console & Statements</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">P&L</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      if (onResetSimulation) {
                        onResetSimulation();
                      } else {
                        setIsResetModalOpen(true);
                      }
                    }}
                    disabled={resetting}
                    className="w-full flex items-center justify-between px-2 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50/80 dark:hover:bg-amber-950/30 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                      <span>Reset Simulation</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                      ₹10L
                    </span>
                  </button>
                </div>

                {/* Prominent Universal Logout Button for all sections */}
                <div className="pt-2 mt-2 border-t border-slate-200/80 dark:border-white/[0.08]">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 font-semibold text-xs border border-rose-200/80 dark:border-rose-800/50 transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer shadow-xs"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Sign Out of Terminal</span>
                  </button>
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

    {/* Institutional Simulation Reset Confirmation Modal */}
    <ResetSimulationModal
      isOpen={isResetModalOpen}
      onClose={() => setIsResetModalOpen(false)}
    />
  </>
  );
}
