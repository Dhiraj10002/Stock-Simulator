"use client";

import React from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import {
  SlidersHorizontal,
  PieChart,
  BarChart2,
  BrainCircuit,
  ArrowRight,
  Zap,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Welcome & Launch Banner */}
        <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 p-6 sm:p-8 overflow-hidden shadow-2xl">
          <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5" />
              <span>Institutional Paper Execution Engine</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Master the Markets with{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                Zero Risk
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300">
              Practice real-time NSE & BSE trading with ₹10 Lakhs virtual capital,
              live Level-2 depth, F&O option chain, statutory tax breakdowns, and
              AI behavioral critique.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/trade"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all hover:scale-105"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Launch Trading Terminal</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                href="/analytics"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-semibold text-sm transition-colors"
              >
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                <span>View P&L Analytics</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Nav Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/trade"
            className="p-5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">Trading Terminal</h2>
              <p className="text-xs text-slate-400 mt-1">
                Full-featured candlestick chart, Level-2 depth, bracket orders, and options.
              </p>
            </div>
            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Open terminal →
            </span>
          </Link>

          <Link
            href="/portfolio"
            className="p-5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">Portfolio & Positions</h2>
              <p className="text-xs text-slate-400 mt-1">
                Segmented holdings across CNC, MIS, and F&O with real-time mark-to-market.
              </p>
            </div>
            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              View holdings →
            </span>
          </Link>

          <Link
            href="/analytics"
            className="p-5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">Console & Analytics</h2>
              <p className="text-xs text-slate-400 mt-1">
                Monthly P&L calendar heatmap, statutory contract notes, and tax breakdowns.
              </p>
            </div>
            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Explore console →
            </span>
          </Link>

          <Link
            href="/mentor"
            className="p-5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">AI Trade Copilot</h2>
              <p className="text-xs text-slate-400 mt-1">
                Pre-trade risk checks, institutional letter grades (A+ to F), and discipline audits.
              </p>
            </div>
            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Chat with mentor →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
