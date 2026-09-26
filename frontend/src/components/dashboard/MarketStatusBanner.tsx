"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Radio,
  Calendar,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { publicFetch } from "@/lib/api";
import { useMarketStore } from "@/stores/market-store";

interface MarketStatusData {
  status: "OPEN" | "CLOSED" | "PRE_OPEN" | "POST_MARKET" | "HOLIDAY";
  is_open: boolean;
  server_time: string;
  holiday_name?: string;
  feed_provider?: string;
  feed_state?: string;
  is_synthetic?: boolean;
  last_tick?: string;
}

interface MarketBreadthData {
  advances: number;
  declines: number;
  unchanged: number;
  total: number;
  advance_decline_ratio: number;
  advance_percent: number;
  updated_at?: string;
}

interface MarketStatusBannerProps {
  className?: string;
}

export default function MarketStatusBanner({ className = "" }: MarketStatusBannerProps) {
  const storeFeedProvider = useMarketStore((s) => s.feedProvider);
  const storeConnectionState = useMarketStore((s) => s.connectionState);

  // Poll authoritative backend market status
  const { data: statusData, refetch: refetchStatus, isFetching: isRefreshingStatus } = useQuery<MarketStatusData>({
    queryKey: ["market-status-banner"],
    queryFn: () => publicFetch<MarketStatusData>("/market/status"),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // Poll authoritative backend market breadth
  const { data: breadthData } = useQuery<MarketBreadthData>({
    queryKey: ["market-breadth-banner"],
    queryFn: () => publicFetch<MarketBreadthData>("/market/breadth"),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // Client-side IST clock for second-accurate feedback
  const [istTime, setIstTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(
        now.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }) + " IST"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const status = statusData?.status || "CLOSED";
  const isOpen = statusData?.is_open || false;
  const holidayName = statusData?.holiday_name;

  // Feed badge configuration
  const isSynthetic = statusData?.is_synthetic ?? true;
  const feedLabel =
    storeConnectionState === "disconnected"
      ? "Offline"
      : isSynthetic
      ? "Synthetic Matching Engine"
      : "Angel One Institutional Live";

  // Status visual attributes
  const statusConfig = {
    OPEN: {
      badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      dot: "bg-emerald-500 animate-pulse",
      label: "MARKET OPEN",
      subtext: "Regular Trading Session active (09:15 - 15:30)",
    },
    PRE_OPEN: {
      badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      dot: "bg-amber-500 animate-ping",
      label: "PRE-OPEN SESSION",
      subtext: "Order collection & price discovery (09:00 - 09:15)",
    },
    POST_MARKET: {
      badgeBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
      dot: "bg-indigo-500",
      label: "POST-MARKET / CLOSING",
      subtext: "Closing price determination session (15:30 - 16:00)",
    },
    HOLIDAY: {
      badgeBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      dot: "bg-rose-500",
      label: "TRADING HOLIDAY",
      subtext: holidayName ? `Exchanges closed for ${holidayName}` : "Exchanges closed for official holiday",
    },
    CLOSED: {
      badgeBg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
      dot: "bg-slate-400",
      label: "MARKET CLOSED",
      subtext: "Regular session closed. Orders will route at next open (09:15)",
    },
  }[status];

  return (
    <div
      className={`rounded-2xl bg-white/90 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 shadow-xs ${className}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Status Badge & Timing Info */}
        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black tracking-wide border ${statusConfig.badgeBg}`}
          >
            <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
            <span>{statusConfig.label}</span>
          </div>

          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span>{statusConfig.subtext}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <Clock className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              <span>{istTime || "13:00:00 IST"}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>NSE & BSE Cash Segments</span>
            </div>
          </div>
        </div>

        {/* Right: Feed Provider & Market Breadth */}
        <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
          {/* Market Breadth Pill (if data available) */}
          {breadthData && breadthData.total > 0 && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[11px] font-mono">
              <span className="text-slate-500 font-sans font-semibold">Breadth:</span>
              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <TrendingUp className="w-3 h-3" />
                {breadthData.advances} Adv
              </span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-bold">
                <TrendingDown className="w-3 h-3" />
                {breadthData.declines} Dec
              </span>
            </div>
          )}

          {/* Feed Mode Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[11px]">
            <Radio
              className={`w-3 h-3 ${
                isSynthetic
                  ? "text-cyan-500 animate-pulse"
                  : "text-emerald-500 animate-pulse"
              }`}
            />
            <span className="text-slate-500 dark:text-slate-400 font-medium">Feed:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {feedLabel}
            </span>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={() => refetchStatus()}
            disabled={isRefreshingStatus}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Refresh market status"
            aria-label="Refresh market status"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshingStatus ? "animate-spin text-cyan-500" : ""}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
