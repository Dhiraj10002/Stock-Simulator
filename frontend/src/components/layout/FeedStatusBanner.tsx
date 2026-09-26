"use client";

import React, { useState, useEffect } from "react";
import { useMarketStore } from "@/stores/market-store";
import { getAuthoritativeFeedStatus } from "@/lib/feedStatus";
import { getIndianMarketStatus } from "@/lib/format";
import {
  Activity,
  AlertTriangle,
  Clock,
  Radio,
  WifiOff,
  Zap,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

interface FeedStatusBannerProps {
  compact?: boolean;
  dismissable?: boolean;
  className?: string;
}

export default function FeedStatusBanner({
  compact = false,
  dismissable = true,
  className = "",
}: FeedStatusBannerProps) {
  const feedStatus = useMarketStore((s) => s.feedStatus);
  const serverMarketStatus = useMarketStore((s) => s.marketStatus);
  const connectionState = useMarketStore((s) => s.connectionState);

  const [clientMarketStatus, setClientMarketStatus] = useState(getIndianMarketStatus());
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissedBannerType, setDismissedBannerType] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
    const timer = setInterval(() => {
      setClientMarketStatus(getIndianMarketStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const authoritativeStatus = getAuthoritativeFeedStatus(
    feedStatus,
    serverMarketStatus,
    connectionState,
    clientMarketStatus.istTime
  );

  const isDismissed = dismissedBannerType === authoritativeStatus.bannerType;

  if (!mounted) {
    return null;
  }

  const getStatusIcon = () => {
    switch (authoritativeStatus.bannerType) {
      case "live":
        return <Activity className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />;
      case "simulated":
        return <Zap className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" />;
      case "closed":
        return <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />;
      case "disconnected":
        return <WifiOff className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />;
      case "unavailable":
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />;
      default:
        return <Radio className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 shrink-0" />;
    }
  };

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border backdrop-blur-md transition-all shadow-xs ${authoritativeStatus.pillClasses} ${className}`}
        title={authoritativeStatus.tooltip}
      >
        <span className={`w-2 h-2 rounded-full ${authoritativeStatus.dotClasses}`} />
        <span className="font-semibold tracking-wider text-[11px] uppercase">
          {authoritativeStatus.bannerTitle}
        </span>
        <span className="text-[10px] opacity-75 font-mono border-l border-current/20 pl-1.5 flex items-center gap-1">
          {clientMarketStatus.istTime}
        </span>
      </div>
    );
  }

  if (isDismissed) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-label="Market Feed Status"
      className={`relative w-full border-b transition-all duration-200 overflow-hidden ${authoritativeStatus.bannerClasses} ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Status Badge & Description */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex h-2.5 w-2.5 relative">
              {authoritativeStatus.isLive && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${authoritativeStatus.dotClasses}`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${authoritativeStatus.dotClasses}`}
              />
            </span>
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] font-mono">
              {getStatusIcon()}
              <span>{authoritativeStatus.bannerTitle}</span>
            </div>
          </div>

          <p className="hidden md:inline truncate text-[11px] opacity-90 border-l border-current/25 pl-3">
            {authoritativeStatus.bannerDescription}
          </p>
        </div>

        {/* Right: Exchange session timings, controls & dismiss */}
        <div className="flex items-center gap-3 shrink-0 ml-auto font-mono text-[11px]">
          <div className="flex items-center gap-1.5 opacity-85">
            <Clock className="w-3.5 h-3.5" />
            <span>IST {clientMarketStatus.istTime}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/5 border border-current/15 text-[10px]">
            <span className="opacity-70">SESSION:</span>
            <span className="font-semibold uppercase">{serverMarketStatus || "REGULAR"}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="md:hidden p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            aria-label="Toggle feed details"
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {dismissable && (
            <button
              type="button"
              onClick={() => setDismissedBannerType(authoritativeStatus.bannerType)}
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-70 hover:opacity-100"
              aria-label="Dismiss status banner"
              title="Dismiss status banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Expanded Drawer */}
      {isExpanded && (
        <div className="md:hidden px-4 pb-2 text-[11px] opacity-90 border-t border-current/15 pt-1.5">
          <p>{authoritativeStatus.bannerDescription}</p>
        </div>
      )}
    </aside>
  );
}
