"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTerminalStore } from "@/stores/terminal-store";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  SlidersHorizontal,
  Flame,
} from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";

interface MoverItem {
  symbol: string;
  name: string;
  sector: string;
  ltp: number;
  change: number;
  changePercent: number;
  dayLow: number;
  dayHigh: number;
  volume: string;
}

const TOP_GAINERS: MoverItem[] = [
  {
    symbol: "TATASTEEL",
    name: "Tata Steel Ltd.",
    sector: "Metals & Mining",
    ltp: 168.45,
    change: 6.85,
    changePercent: 4.24,
    dayLow: 161.2,
    dayHigh: 170.1,
    volume: "42.8M",
  },
  {
    symbol: "TATAMOTORS",
    name: "Tata Motors Ltd.",
    sector: "Automotive",
    ltp: 985.2,
    change: 32.4,
    changePercent: 3.4,
    dayLow: 955.0,
    dayHigh: 991.5,
    volume: "18.4M",
  },
  {
    symbol: "ICICIBANK",
    name: "ICICI Bank Ltd.",
    sector: "Private Banking",
    ltp: 1245.6,
    change: 31.8,
    changePercent: 2.62,
    dayLow: 1215.0,
    dayHigh: 1252.0,
    volume: "24.1M",
  },
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    sector: "Energy & Retail",
    ltp: 2985.5,
    change: 54.5,
    changePercent: 1.86,
    dayLow: 2930.0,
    dayHigh: 2998.0,
    volume: "12.3M",
  },
  {
    symbol: "SBIN",
    name: "State Bank of India",
    sector: "Public Banking",
    ltp: 812.3,
    change: 14.1,
    changePercent: 1.77,
    dayLow: 798.5,
    dayHigh: 816.0,
    volume: "29.7M",
  },
];

const TOP_LOSERS: MoverItem[] = [
  {
    symbol: "WIPRO",
    name: "Wipro Ltd.",
    sector: "IT Services",
    ltp: 482.1,
    change: -14.65,
    changePercent: -2.95,
    dayLow: 480.0,
    dayHigh: 498.5,
    volume: "15.2M",
  },
  {
    symbol: "INFY",
    name: "Infosys Ltd.",
    sector: "IT Services",
    ltp: 1612.4,
    change: -38.2,
    changePercent: -2.31,
    dayLow: 1608.0,
    dayHigh: 1655.0,
    volume: "16.8M",
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "IT Services",
    ltp: 3890.0,
    change: -62.5,
    changePercent: -1.58,
    dayLow: 3875.0,
    dayHigh: 3960.0,
    volume: "6.4M",
  },
  {
    symbol: "HINDUNILVR",
    name: "Hindustan Unilever",
    sector: "FMCG",
    ltp: 2450.8,
    change: -31.4,
    changePercent: -1.27,
    dayLow: 2442.0,
    dayHigh: 2488.0,
    volume: "4.9M",
  },
  {
    symbol: "BAJFINANCE",
    name: "Bajaj Finance Ltd.",
    sector: "Financial Services",
    ltp: 6920.0,
    change: -74.0,
    changePercent: -1.06,
    dayLow: 6890.0,
    dayHigh: 7015.0,
    volume: "3.8M",
  },
];

const MOST_ACTIVE: MoverItem[] = [
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd.",
    sector: "Private Banking",
    ltp: 1642.5,
    change: 12.8,
    changePercent: 0.79,
    dayLow: 1628.0,
    dayHigh: 1649.0,
    volume: "52.4M",
  },
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    sector: "Energy & Retail",
    ltp: 2985.5,
    change: 54.5,
    changePercent: 1.86,
    dayLow: 2930.0,
    dayHigh: 2998.0,
    volume: "38.2M",
  },
  {
    symbol: "TATASTEEL",
    name: "Tata Steel Ltd.",
    sector: "Metals & Mining",
    ltp: 168.45,
    change: 6.85,
    changePercent: 4.24,
    dayLow: 161.2,
    dayHigh: 170.1,
    volume: "42.8M",
  },
  {
    symbol: "SBIN",
    name: "State Bank of India",
    sector: "Public Banking",
    ltp: 812.3,
    change: 14.1,
    changePercent: 1.77,
    dayLow: 798.5,
    dayHigh: 816.0,
    volume: "29.7M",
  },
  {
    symbol: "ITC",
    name: "ITC Ltd.",
    sector: "Diversified FMCG",
    ltp: 432.8,
    change: 2.1,
    changePercent: 0.49,
    dayLow: 430.0,
    dayHigh: 435.5,
    volume: "28.5M",
  },
];

type MoverTab = "gainers" | "losers" | "active";

export default function MarketMovers() {
  const router = useRouter();
  const setSelectedSymbol = useTerminalStore((s) => s.setSelectedSymbol);
  const [activeTab, setActiveTab] = useState<MoverTab>("gainers");

  const items = useMemo(() => {
    switch (activeTab) {
      case "gainers":
        return TOP_GAINERS;
      case "losers":
        return TOP_LOSERS;
      case "active":
        return MOST_ACTIVE;
    }
  }, [activeTab]);

  const handleTrade = (sym: string) => {
    setSelectedSymbol(sym);
    router.push(`/stocks/${encodeURIComponent(sym)}`);
  };

  return (
    <div className="flex flex-col h-full rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-lg">
      {/* Header & Tabs */}
      <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-slate-100">Market Movers & Discover</h3>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950/60 border border-slate-800">
          <button
            onClick={() => setActiveTab("gainers")}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold transition-all ${
              activeTab === "gainers"
                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Top Gainers</span>
          </button>

          <button
            onClick={() => setActiveTab("losers")}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold transition-all ${
              activeTab === "losers"
                ? "bg-rose-950/80 text-rose-400 border border-rose-800/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Top Losers</span>
          </button>

          <button
            onClick={() => setActiveTab("active")}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold transition-all ${
              activeTab === "active"
                ? "bg-cyan-950/80 text-cyan-400 border border-cyan-800/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Most Active</span>
          </button>
        </div>
      </div>

      {/* Table Rows */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/30">
              <th className="py-3 px-4">Instrument</th>
              <th className="py-3 px-3 text-right">LTP (₹)</th>
              <th className="py-3 px-3 text-right">Change</th>
              <th className="py-3 px-4 hidden md:table-cell">Day Range (L - H)</th>
              <th className="py-3 px-3 text-right hidden sm:table-cell">Volume</th>
              <th className="py-3 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 font-medium">
            {items.map((item) => {
              const isPositive = item.change >= 0;
              const range = item.dayHigh - item.dayLow || 1;
              const rangePct = Math.min(
                100,
                Math.max(0, ((item.ltp - item.dayLow) / range) * 100)
              );

              return (
                <tr
                  key={item.symbol}
                  onClick={() => handleTrade(item.symbol)}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  {/* Instrument */}
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-100 group-hover:text-cyan-400 transition-colors">
                          {item.symbol}
                        </span>
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                          NSE
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                        {item.name}
                      </span>
                    </div>
                  </td>

                  {/* LTP */}
                  <td className="py-3 px-3 text-right font-bold text-slate-100 font-tabular">
                    ₹{formatNumber(item.ltp, 2)}
                  </td>

                  {/* Change */}
                  <td className="py-3 px-3 text-right font-tabular">
                    <span
                      className={`inline-flex items-center justify-end gap-0.5 font-bold ${
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {formatNumber(item.change, 2)} ({formatPercent(item.changePercent)})
                    </span>
                  </td>

                  {/* Day Range Bar */}
                  <td className="py-3 px-4 hidden md:table-cell">
                    <div className="flex flex-col gap-1 w-32">
                      <div className="flex justify-between text-[9px] font-mono text-slate-500">
                        <span>{item.dayLow.toFixed(1)}</span>
                        <span>{item.dayHigh.toFixed(1)}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden relative">
                        <div
                          className={`h-full rounded-full ${
                            isPositive ? "bg-emerald-400" : "bg-rose-400"
                          }`}
                          style={{ width: `${rangePct}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Volume */}
                  <td className="py-3 px-3 text-right font-semibold text-slate-400 font-tabular hidden sm:table-cell">
                    {item.volume}
                  </td>

                  {/* Trade Action */}
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTrade(item.symbol);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-slate-950 text-[11px] font-bold border border-cyan-500/30 hover:border-cyan-500 transition-all group-hover:shadow-sm"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>Trade</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
