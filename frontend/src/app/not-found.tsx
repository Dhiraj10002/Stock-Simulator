import React from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  LayoutDashboard,
  PieChart,
  ArrowRight,
  TrendingDown,
} from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/3 -left-32 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 -right-32 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full text-center space-y-6 relative z-10">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 mx-auto flex items-center justify-center text-rose-400 shadow-xl shadow-rose-500/10">
          <TrendingDown className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-rose-400">
            HTTP 404 · Counter Delisted
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Instrument Not Found
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            The market page, contract, or symbol you requested does not exist on the NSE/BSE simulator or has been moved.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-left space-y-3">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Quick Market Navigation:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Link
              href="/stocks/ITC"
              className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-cyan-300 font-semibold text-xs border border-slate-700/80 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
              <span>Explore Stocks</span>
              <ArrowRight className="w-3 h-3 ml-auto text-slate-500" />
            </Link>

            <Link
              href="/"
              className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold text-xs border border-slate-700/80 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-emerald-400" />
              <span>Market Explore</span>
              <ArrowRight className="w-3 h-3 ml-auto text-slate-500" />
            </Link>

            <Link
              href="/portfolio"
              className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold text-xs border border-slate-700/80 transition-colors"
            >
              <PieChart className="w-4 h-4 text-purple-400" />
              <span>Portfolio</span>
              <ArrowRight className="w-3 h-3 ml-auto text-slate-500" />
            </Link>

            <Link
              href="/watchlist"
              className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold text-xs border border-slate-700/80 transition-colors"
            >
              <Search className="w-4 h-4 text-amber-400" />
              <span>Watchlist</span>
              <ArrowRight className="w-3 h-3 ml-auto text-slate-500" />
            </Link>
          </div>
        </div>

        <Link
          href="/"
          className="inline-block text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          ← Return to Market Dashboard
        </Link>
      </div>
    </div>
  );
}
