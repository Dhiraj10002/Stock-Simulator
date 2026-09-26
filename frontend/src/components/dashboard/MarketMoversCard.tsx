"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Flame,
  ArrowRight,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { publicFetch } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format";

export interface MarketMoverItem {
  symbol: string;
  name?: string;
  price_paise: number;
  change_paise: number;
  change_percent: number;
  volume: number;
  turnover?: number;
  trending_score?: number;
  exchange?: string;
  source?: string;
  updated_at?: string;
}

export interface MarketMoversResponse {
  gainers: MarketMoverItem[];
  losers: MarketMoverItem[];
  most_traded: MarketMoverItem[];
  trending: MarketMoverItem[];
  updated_at?: string;
}

interface MarketMoversCardProps {
  className?: string;
  limit?: number;
}

type TabType = "gainers" | "losers" | "most_traded" | "trending";

export default function MarketMoversCard({
  className = "",
  limit = 8,
}: MarketMoversCardProps) {
  const [activeTab, setActiveTab] = useState<TabType>("gainers");

  const { data: moversData, isLoading, refetch, isFetching } = useQuery<MarketMoversResponse>({
    queryKey: ["market-movers-card", limit],
    queryFn: () => publicFetch<MarketMoversResponse>(`/market/movers?limit=${limit}`),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const items = moversData ? moversData[activeTab] || [] : [];

  const tabLabels: { key: TabType; label: string; icon: React.ReactNode }[] = [
    {
      key: "gainers",
      label: "Top Gainers",
      icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />,
    },
    {
      key: "losers",
      label: "Top Losers",
      icon: <TrendingDown className="w-3.5 h-3.5 text-rose-500" />,
    },
    {
      key: "most_traded",
      label: "Most Active",
      icon: <Activity className="w-3.5 h-3.5 text-cyan-500" />,
    },
    {
      key: "trending",
      label: "Trending",
      icon: <Flame className="w-3.5 h-3.5 text-amber-500" />,
    },
  ];

  return (
    <div
      className={`rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col ${className}`}
    >
      {/* Header & Tabs */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40">
        <div>
          <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
            <span>Market Movers</span>
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300">
              Live Aggregation
            </span>
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Ranked dynamically across active NSE equities
          </p>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl">
          {tabLabels.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === t.key
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Movers Table / List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 flex-1 min-h-[300px]">
        {isLoading && items.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
            <RotateCcw className="w-5 h-5 animate-spin text-cyan-500" />
            <span>Fetching live market rankings...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-2">
            <Activity className="w-8 h-8 text-slate-500 opacity-40 mb-1" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              No Movers Recorded Yet
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs">
              Market rankings update in real time once ticks stream from the market data supervisor.
            </p>
          </div>
        ) : (
          items.map((item, idx) => {
            const price = item.price_paise / 100;
            const change = item.change_paise / 100;
            const changePct = item.change_percent;
            const isPositive = changePct >= 0;
            const turnoverCr = item.turnover ? item.turnover / 1e7 : (price * item.volume) / 1e7;

            return (
              <Link
                key={item.symbol}
                href={`/stocks/${item.symbol}`}
                className="p-3 px-4 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
              >
                {/* Left: Rank & Symbol Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono font-bold text-slate-400 w-4 text-center">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                        {item.symbol}
                      </span>
                      <span className="text-[9px] uppercase font-mono px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {item.exchange || "NSE"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px] sm:max-w-xs">
                      {item.name || item.symbol}
                    </div>
                  </div>
                </div>

                {/* Right: Metrics & Live Price */}
                <div className="text-right pl-3">
                  <div className="text-xs font-black font-tabular text-slate-900 dark:text-slate-100">
                    ₹{formatNumber(price, 2)}
                  </div>
                  <div className="flex items-center justify-end gap-2 text-[11px] font-tabular">
                    <span
                      className={`font-bold flex items-center gap-0.5 ${
                        isPositive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      <span>{isPositive ? "▲" : "▼"}</span>
                      <span>{formatPercent(changePct)}</span>
                    </span>

                    {/* Volume or Turnover Pill */}
                    {activeTab === "most_traded" ? (
                      <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                        ₹{turnoverCr.toFixed(1)} Cr
                      </span>
                    ) : item.volume > 0 ? (
                      <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                        Vol: {(item.volume / 1000).toFixed(0)}k
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Footer Link */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs bg-slate-50/40 dark:bg-slate-900/40">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Auto-refreshes every 5s on live ticks
        </span>
        <Link
          href="/stocks"
          className="inline-flex items-center gap-1 font-bold text-cyan-600 dark:text-cyan-400 hover:underline text-[11px]"
        >
          <span>View all {activeTab.replace("_", " ")}</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
