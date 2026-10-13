"use client";
import BrandLogo from "@/components/brand/BrandLogo";
import { logoutSession, sessionFetch } from "@/lib/api";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { useAccountPortfolio } from "@/hooks/useAccountPortfolio";
import { useAuthToken } from "@/hooks/useAuthToken";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  AlertTriangle,
  Newspaper,
} from "lucide-react";
import { formatPaise, getIndianMarketStatus } from "@/lib/format";
import { useMarketStore } from "@/stores/market-store";
import { useMajorIndicesQuotes } from "@/hooks/useMajorIndices";
import { dayMovement } from "@/lib/marketDisplay";
import { getAuthoritativeFeedStatus } from "@/lib/feedStatus";
import { useUIStore } from "@/stores/ui-store";
import { useTheme } from "@/providers/theme-provider";
import { useRiskOverview } from "@/hooks/useRiskOverview";
import ResetSimulationModal from "@/components/modals/ResetSimulationModal";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./Navbar.module.css";

interface NavbarProps {
  cashBalancePaise?: number;
  availableBalancePaise?: number;
  unrealizedPnlPaise?: number;
  unrealizedPnlStale?: boolean;
  onResetSimulation?: () => void;
  onSignOut?: () => void;
  resetting?: boolean;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stocks", label: "Stocks", icon: TrendingUp },
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/options", label: "Futures & Options", icon: Layers },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/mentor", label: "AI Mentor", icon: BrainCircuit },
];

export default function Navbar({
  availableBalancePaise: propAvailableBalancePaise,
  unrealizedPnlPaise: propUnrealizedPnlPaise,
  unrealizedPnlStale: propUnrealizedPnlStale = false,
  onResetSimulation,
  onSignOut,
  resetting = false,
}: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const setSearchPaletteOpen = useUIStore((s) => s.setSearchPaletteOpen);
  const { theme, setTheme } = useTheme();

  const token = useAuthToken();
  const { data: verifiedWallet } = useAccountWallet();
  const { data: verifiedPortfolio } = useAccountPortfolio(!!token);
  const availableBalancePaise = verifiedWallet?.available_balance_paise ?? propAvailableBalancePaise;

  const valuationAvailable = verifiedPortfolio?.valuation_status !== "DEGRADED";
  const effectiveUnrealizedPnl =
    propUnrealizedPnlPaise !== undefined
      ? propUnrealizedPnlPaise
      : (valuationAvailable ? verifiedPortfolio?.unrealized_pnl_paise : undefined);

  const effectiveIsStale =
    propUnrealizedPnlStale || verifiedPortfolio?.valuation_status === "STALE";
  // Static pages can be served long after build time; hydrate with a stable clock placeholder.
  const [clientIstTime, setClientIstTime] = useState("");
  const feedStatus = useMarketStore((s) => s.feedStatus);
  const serverMarketStatus = useMarketStore((s) => s.marketStatus);
  const connectionState = useMarketStore((s) => s.connectionState);

  const segment = pathname?.startsWith("/options") ? "NFO" : "NSE";
  const authoritativeStatus = getAuthoritativeFeedStatus(
    feedStatus,
    serverMarketStatus,
    connectionState,
    clientIstTime,
    segment
  );

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [userName, setUserName] = useState("Trader");
  const [userEmail, setUserEmail] = useState("");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const { overview, isBreached } = useRiskOverview();
  const { addToast } = useToast();

  useEffect(() => {
    const syncUser = () => {
      const storedName = localStorage.getItem("user_name");
      if (storedName) setUserName(storedName);
      const storedEmail = localStorage.getItem("user_email");
      if (storedEmail) setUserEmail(storedEmail);
    };
    queueMicrotask(() => {
      syncUser();
      setClientIstTime(getIndianMarketStatus().istTime);
    });

    const timer = setInterval(() => {
      setClientIstTime(getIndianMarketStatus().istTime);
    }, 10000);

    window.addEventListener("auth-changed", syncUser);
    return () => {
      clearInterval(timer);
      window.removeEventListener("auth-changed", syncUser);
    };
  }, []);

  // Fetch /auth/me when authenticated to resolve user's real name and email
  useEffect(() => {
    if (token) {
      sessionFetch("/auth/me")
        .then((res: Response) => (res.ok ? (res.json() as Promise<{ data?: { name?: string; email?: string } }>) : null))
        .then((body: { data?: { name?: string; email?: string } } | null) => {
          if (body?.data?.name) {
            setUserName(body.data.name);
            localStorage.setItem("user_name", body.data.name);
          }
          if (body?.data?.email) {
            setUserEmail(body.data.email);
            localStorage.setItem("user_email", body.data.email);
          }
        })
        .catch(() => {});
    }
  }, [token]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowProfileMenu(false);
        profileButtonRef.current?.focus();
      }
    };
    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, { passive: true });
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showProfileMenu]);

  // Universal Logout Handler across all sections
  const handleLogout = async () => {
    setShowProfileMenu(false);
    addToast("Signed Out", "You have been logged out successfully.", "info");
    if (onSignOut) {
      onSignOut();
      return;
    }
    await logoutSession();
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
    router.push("/login");
  };

  // Indices — shared REST batch fallback + targeted live stream
  const { niftyQuote, sensexQuote } = useMajorIndicesQuotes();
  const niftyPrice = niftyQuote && niftyQuote.price_paise > 0 ? niftyQuote.price_paise : undefined;
  const niftyChange = dayMovement(niftyQuote)?.percent;

  const sensexPrice = sensexQuote && sensexQuote.price_paise > 0 ? sensexQuote.price_paise : undefined;
  const sensexChange = dayMovement(sensexQuote)?.percent;

  const isProfit = effectiveUnrealizedPnl !== undefined && effectiveUnrealizedPnl >= 0;

  return (
    <>
      <header className="border-b border-slate-200 dark:border-white/[0.08] bg-white/90 dark:bg-[#06080e]/85 backdrop-blur-xl sticky top-0 z-40 transition-colors duration-150 relative">

      {/* Specular gradient flare line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/35 dark:via-cyan-500/30 to-transparent absolute -bottom-[1px] left-0 pointer-events-none" />

        {/* Top Utility Bar */}
        <div className="px-3 sm:px-6 py-2 flex items-center justify-between gap-1.5 sm:gap-4 border-b border-slate-200/80 dark:border-white/[0.06] min-h-[50px]">
          {/* Left: Brand + Market Status + Indices Ticker */}
          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 shrink min-w-0">
            <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
              <BrandLogo tagline="Institutional Paper Desk" />
            </Link>

            {/* Authoritative Market & Feed Session Status Pill */}
            <div
              className={`hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shrink-0 ${authoritativeStatus.pillClasses}`}
              title={authoritativeStatus.tooltip}
            >
              <span
                className={`w-2 h-2 rounded-full ${authoritativeStatus.dotClasses}`}
              />
              <span className="font-semibold">{authoritativeStatus.fullLabel}</span>
              <span className="text-slate-500 dark:text-slate-400 text-[10px] flex items-center gap-1 border-l border-slate-300 dark:border-slate-700/60 pl-2 min-w-[70px] font-mono">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{clientIstTime || "— IST"}</span>
              </span>
            </div>

            {/* Indices Ticker */}
            <div className="hidden xl:flex items-center gap-3 text-xs border-l border-slate-200 dark:border-white/[0.08] pl-3 shrink-0">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg dark:bg-white/[0.03] dark:border dark:border-white/[0.05]">
                <span className="font-semibold text-slate-600 dark:text-slate-400">NIFTY 50</span>
                <span className="font-bold text-slate-900 dark:text-slate-200 font-tabular">
                  {formatPaise(niftyPrice)}
                </span>
                {niftyChange !== undefined ? (
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
                ) : (
                  <span className="text-[11px] text-slate-400 font-mono">—</span>
                )}
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg dark:bg-white/[0.03] dark:border dark:border-white/[0.05]">
                <span className="font-semibold text-slate-600 dark:text-slate-400">SENSEX</span>
                <span className="font-bold text-slate-900 dark:text-slate-200 font-tabular">
                  {formatPaise(sensexPrice)}
                </span>
                {sensexChange !== undefined ? (
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
                ) : (
                  <span className="text-[11px] text-slate-400 font-mono">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Search, Theme, Auth Actions / Profile */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5 text-xs shrink-0">
            {/* Global Search & Shortcuts */}
            <button
              onClick={() => setSearchPaletteOpen(true)}
              aria-label="Search stocks and contracts"
              className={`items-center gap-2 p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.07] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors w-8 h-8 sm:w-36 lg:w-48 justify-center sm:justify-start shadow-xs ${
                !token ? "hidden min-[420px]:flex" : "flex"
              }`}
            >
            <Search className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span className="truncate hidden sm:inline">Search...</span>
            <kbd className="ml-auto hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-white/[0.06] border border-slate-300 dark:border-white/[0.1] rounded shadow-xs">
              Ctrl+K
            </kbd>
          </button>

          {!token ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-8 h-8 rounded-full border border-slate-200 dark:border-white/[0.1] bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                aria-label="Toggle theme"
                suppressHydrationWarning
              >
                {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
              </button>
              <Link
                href="/login"
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-sm shadow-cyan-500/20 transition-all hover:scale-[1.02]"
              >
                Sign Up
              </Link>
            </div>
          ) : (
            <>
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
              <div role="group" aria-label="Portfolio unrealized P&L" className="hidden md:flex flex-col text-right border-l border-slate-200 dark:border-white/[0.08] pl-3">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  Unrealized P&L{effectiveIsStale ? " · Last available" : ""}
                </span>
                <div className="flex items-center justify-end gap-1">
                  {(effectiveUnrealizedPnl === undefined || effectiveUnrealizedPnl === 0) ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mr-0.5" />
                  ) : isProfit ? (
                    <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                  <strong
                    className={`text-xs font-bold font-tabular ${
                      (effectiveUnrealizedPnl === undefined || effectiveUnrealizedPnl === 0)
                        ? "text-slate-600 dark:text-slate-300"
                        : isProfit
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {effectiveUnrealizedPnl !== undefined && effectiveUnrealizedPnl !== null
                      ? `${isProfit && effectiveUnrealizedPnl > 0 ? "+" : ""}${formatPaise(effectiveUnrealizedPnl)}`
                      : "Unavailable"}
                  </strong>
                </div>
              </div>

              {/* Profile Dropdown */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  ref={profileButtonRef}
                  type="button"
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  title="Trader Profile & Account Settings"
                  aria-expanded={showProfileMenu}
                  aria-controls="trader-account-panel"
                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                    showProfileMenu
                      ? "bg-cyan-500/15 border-cyan-500 text-cyan-600 dark:text-cyan-400 ring-2 ring-cyan-500/20"
                      : "bg-slate-100 dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.1] text-slate-700 dark:text-slate-200 hover:border-cyan-500/60"
                  }`}
                >
                  <UserIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                </button>

                {showProfileMenu && (
                  <div
                    id="trader-account-panel"
                    role="region"
                    aria-label="Trader account"
                    className={`${styles.profilePanel} absolute right-0 mt-3 w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-4 z-50 text-slate-800 dark:text-slate-200`}
                  >
                    {/* User Identity Header */}
                    <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 text-white font-black text-base flex items-center justify-center shadow-md shadow-cyan-600/20 ring-2 ring-white dark:ring-slate-800">
                          {userName.charAt(0).toUpperCase()}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0b101d]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {userName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30">
                            PRO
                          </span>
                        </div>
                        {userEmail && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                            {userEmail}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>Demat: SS-89104</span>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Active</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Margin Glance */}
                    <div className="my-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                          <WalletIcon className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                          Available Margin
                        </div>
                        <div className="text-lg font-bold tracking-tight font-tabular text-slate-900 dark:text-slate-100 mt-1">
                          {formatPaise(availableBalancePaise)}
                        </div>
                      </div>
                      <Link
                        href="/portfolio"
                        onClick={() => setShowProfileMenu(false)}
                        className="shrink-0 px-2.5 py-2 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-[11px] font-semibold transition-colors cursor-pointer border border-cyan-200/80 dark:border-cyan-500/30"
                      >
                        Holdings →
                      </Link>
                    </div>

                    {/* Actions Menu */}
                    <div className="space-y-1">
                      {/* Theme Switcher in Dropdown */}
                      <div className="px-2 py-2 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">Theme</span>
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            aria-pressed={theme === "light"}
                            onClick={() => setTheme("light")}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                              theme === "light"
                                ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                          >
                            <Sun className="w-3 h-3 text-amber-500" />
                            <span>Light</span>
                          </button>
                          <button
                            type="button"
                            aria-pressed={theme === "dark"}
                            onClick={() => setTheme("dark")}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
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
                        className="flex items-center justify-between gap-2 px-2.5 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900/90 rounded-xl transition-colors"
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
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-3 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50/80 dark:hover:bg-amber-950/40 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <span className="flex items-center gap-2">
                          <RotateCcw className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                          <span>Reset Simulation</span>
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                          ₹10L
                        </span>
                      </button>
                    </div>

                    {/* Prominent Universal Logout Button for all sections */}
                    <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full min-h-11 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 font-semibold text-xs border border-rose-200 dark:border-rose-800/50 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
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

      {/* Primary Route Navigation Tabs (Row 2): High-Visibility Segment Control Deck */}
      <div className="bg-slate-100/90 dark:bg-[#070b14]/90 border-t border-b border-slate-200/90 dark:border-white/[0.08] backdrop-blur-md">
        <nav
          aria-label="Trading Desk Navigation"
          className="px-3 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth"
        >
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
                className={`group relative flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-[13px] whitespace-nowrap transition-all duration-200 shrink-0 ${
                  isActive
                    ? "bg-gradient-to-r from-cyan-500/15 via-sky-500/20 to-blue-500/15 dark:from-cyan-500/20 dark:via-sky-500/25 dark:to-blue-500/20 text-cyan-800 dark:text-cyan-200 border border-cyan-500/40 dark:border-cyan-400/50 shadow-xs shadow-cyan-500/15 font-bold"
                    : "bg-white dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border border-slate-200/90 dark:border-slate-800 hover:border-cyan-400/60 hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-cyan-50/40 dark:hover:bg-slate-800/90 shadow-xs font-semibold"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 shrink-0 ${
                    isActive
                      ? "text-cyan-600 dark:text-cyan-400"
                      : "text-slate-500 dark:text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400"
                  }`}
                />
                <span>{link.label}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 shadow-[0_0_6px_#06b6d4] animate-pulse shrink-0 ml-0.5" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>

    {/* Institutional Simulation Reset Confirmation Modal */}
    <ResetSimulationModal
      isOpen={isResetModalOpen}
      onClose={() => setIsResetModalOpen(false)}
    />
  </>
  );
}
