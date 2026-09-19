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
  SlidersHorizontal,
  Layers,
} from "lucide-react";
import { formatPaise, getIndianMarketStatus } from "@/lib/format";
import { useMarketStore } from "@/stores/market-store";
import { useUIStore } from "@/stores/ui-store";

interface NavbarProps {
  cashBalancePaise?: number;
  availableBalancePaise?: number;
  unrealizedPnlPaise?: number;
  onResetSimulation?: () => void;
  resetting?: boolean;
}

const NAV_LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trade", label: "Terminal", icon: SlidersHorizontal, highlight: true },
  { href: "/options", label: "F&O Chain", icon: Layers },
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
  resetting = false,
}: NavbarProps) {
  const pathname = usePathname();
  const setSearchPaletteOpen = useUIStore((s) => s.setSearchPaletteOpen);
  const quotes = useMarketStore((s) => s.quotes);

  const [marketStatus, setMarketStatus] = useState(getIndianMarketStatus());
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getIndianMarketStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Indices
  const niftyQuote = quotes["NIFTY"];
  const niftyPrice = niftyQuote ? niftyQuote.price_paise : 2532000;
  const niftyChange = niftyQuote?.change_percent ?? 0.35;

  const isProfit = unrealizedPnlPaise >= 0;

  return (
    <header className="border-b border-slate-800/90 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      {/* Top Utility Bar */}
      <div className="px-4 lg:px-6 py-2 flex items-center justify-between gap-4 border-b border-slate-900/80">
        {/* Brand & Market Session */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center font-black text-slate-950 text-sm shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              SS
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1 leading-none">
                STOCK <span className="text-cyan-400 font-extrabold">SIMULATOR</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                Institutional Paper Desk
              </span>
            </div>
          </Link>

          {/* Market Session Status Pill */}
          <div
            className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
              marketStatus.isOpen
                ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-300"
                : "bg-amber-950/60 border-amber-500/30 text-amber-300"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                marketStatus.isOpen ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="font-semibold">{marketStatus.statusText}</span>
            <span className="text-slate-400 text-[10px] flex items-center gap-1 border-l border-slate-700/60 pl-2">
              <Clock className="w-3 h-3" />
              {marketStatus.istTime}
            </span>
          </div>

          {/* Indices Ticker */}
          <div className="hidden xl:flex items-center gap-4 text-xs border-l border-slate-800 pl-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-400">NIFTY 50</span>
              <span className="font-bold text-slate-200 font-tabular">
                {formatPaise(niftyPrice)}
              </span>
              <span
                className={`flex items-center text-[11px] font-semibold ${
                  niftyChange >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {niftyChange >= 0 ? "+" : ""}
                {niftyChange.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-2 border-l border-slate-800/80 pl-3">
              <span className="font-semibold text-slate-400">SENSEX</span>
              <span className="font-bold text-slate-200 font-tabular">
                ₹82,450.00
              </span>
              <span className="text-emerald-400 text-[11px] font-semibold">
                +0.18%
              </span>
            </div>
          </div>
        </div>

        {/* Global Search Button */}
        <button
          onClick={() => setSearchPaletteOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-xs text-slate-400 hover:text-slate-200 transition-colors w-48 lg:w-64"
        >
          <Search className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">Search stocks, F&O...</span>
          <kbd className="ml-auto hidden sm:inline-block px-1.5 py-0.2 text-[10px] font-mono text-slate-400 bg-slate-800 border border-slate-700/60 rounded">
            Ctrl+K
          </kbd>
        </button>

        {/* Account Info & User Profile */}
        <div className="flex items-center gap-4 text-xs">
          {/* Available Cash */}
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-[10px] text-slate-400 font-medium flex items-center justify-end gap-1">
              <WalletIcon className="w-3 h-3 text-cyan-400" />
              Available Margin
            </span>
            <strong className="text-xs font-semibold text-slate-100 font-tabular">
              {formatPaise(availableBalancePaise)}
            </strong>
          </div>

          {/* Unrealized P&L */}
          <div className="hidden md:flex flex-col text-right border-l border-slate-800 pl-3">
            <span className="text-[10px] text-slate-400 font-medium">Unrealized P&L</span>
            <div className="flex items-center justify-end gap-1">
              {isProfit ? (
                <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="w-3 h-3 text-rose-400 shrink-0" />
              )}
              <strong
                className={`text-xs font-bold font-tabular ${
                  isProfit ? "text-emerald-400" : "text-rose-400"
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
              className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 hover:border-cyan-500/60 transition-colors"
            >
              <UserIcon className="w-4 h-4 text-cyan-400" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-2 z-50 animate-fade-in">
                <div className="px-3 py-2 border-b border-slate-800">
                  <div className="font-semibold text-xs text-slate-100">Dhiraj (Trader)</div>
                  <div className="text-[11px] text-slate-400 font-mono">Demat: SS-89104</div>
                </div>

                <div className="p-1 space-y-1">
                  <Link
                    href="/analytics"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded-lg"
                  >
                    <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                    Console & Statements
                  </Link>

                  {onResetSimulation && (
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onResetSimulation();
                      }}
                      disabled={resetting}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-950/40 rounded-lg text-left"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      Reset Account (₹10L)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary Route Navigation Tabs */}
      <nav className="px-4 lg:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
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
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              } ${link.highlight && !isActive ? "text-slate-200" : ""}`}
            >
              <Icon
                className={`w-3.5 h-3.5 ${
                  isActive ? "text-cyan-400" : "text-slate-400"
                }`}
              />
              <span>{link.label}</span>
              {link.highlight && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
