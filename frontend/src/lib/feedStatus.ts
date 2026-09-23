import { FeedStatus, MarketStatus, ConnectionState } from "@/stores/market-store";

export interface AuthoritativeStatusInfo {
  badgeText: string;
  subText?: string;
  fullLabel: string;
  pillClasses: string;
  dotClasses: string;
  isLive: boolean;
  tooltip: string;
}

export function getAuthoritativeFeedStatus(
  feedStatus: FeedStatus,
  marketStatus: MarketStatus,
  connectionState: ConnectionState,
  clientIstTime?: string
): AuthoritativeStatusInfo {
  // 1. If frontend WS connection to backend is disconnected:
  if (connectionState === "disconnected") {
    return {
      badgeText: "DISCONNECTED",
      subText: "RECONNECTING",
      fullLabel: "DISCONNECTED — RECONNECTING",
      pillClasses: "bg-rose-950/40 border-rose-500/30 text-rose-300 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-300",
      dotClasses: "bg-rose-400 animate-pulse",
      isLive: false,
      tooltip: "Market feed connection dropped. Reconnecting...",
    };
  }

  // 2. If backend feed supervisor is reconnecting / retrying:
  if (feedStatus.feedState === "RETRYING" || feedStatus.feedState === "DISCONNECTED") {
    return {
      badgeText: "DISCONNECTED",
      subText: "RECONNECTING",
      fullLabel: "DISCONNECTED — RECONNECTING",
      pillClasses: "bg-amber-950/40 border-amber-500/30 text-amber-300 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-300",
      dotClasses: "bg-amber-400 animate-pulse",
      isLive: false,
      tooltip: "Market worker feed disconnected. Attempting to reconnect...",
    };
  }

  // 3. If connecting:
  if (feedStatus.feedState === "CONNECTING" || connectionState === "connecting") {
    const sub = feedStatus.feedProvider === "angel_one" ? "ANGEL ONE" : "CONNECTING";
    return {
      badgeText: "CONNECTING",
      subText: sub,
      fullLabel: `CONNECTING — ${sub}`,
      pillClasses: "bg-cyan-950/40 border-cyan-500/30 text-cyan-300 dark:bg-cyan-950/40 dark:border-cyan-500/30 dark:text-cyan-300",
      dotClasses: "bg-cyan-400 animate-pulse",
      isLive: false,
      tooltip: "Establishing live market data connection...",
    };
  }

  // 4. If synthetic simulation feed:
  if (feedStatus.isSynthetic || feedStatus.feedProvider === "synthetic" || feedStatus.feedState === "FALLBACK") {
    return {
      badgeText: "SIMULATION",
      subText: "SYNTHETIC",
      fullLabel: "SIMULATION — SYNTHETIC",
      pillClasses: "bg-purple-950/40 border-purple-500/30 text-purple-300 dark:bg-purple-950/40 dark:border-purple-500/30 dark:text-purple-300",
      dotClasses: "bg-purple-400 animate-pulse",
      isLive: true,
      tooltip: "Running on realistic 24/7 Synthetic Geometric Brownian Motion simulation feed",
    };
  }

  // 5. If Angel One live feed:
  if (feedStatus.feedProvider === "angel_one" && feedStatus.feedState === "LIVE") {
    const isMarketOpen = marketStatus === "OPEN";
    if (isMarketOpen) {
      return {
        badgeText: "LIVE",
        subText: "ANGEL ONE",
        fullLabel: "LIVE — ANGEL ONE",
        pillClasses: "bg-emerald-950/40 border-emerald-500/30 text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-300 dark:shadow-[0_0_12px_-2px_rgba(16,185,129,0.2)]",
        dotClasses: "bg-emerald-400 animate-pulse",
        isLive: true,
        tooltip: "Connected to Angel One real-time institutional exchange feed",
      };
    } else {
      const timeStr = clientIstTime || "15:30 IST";
      return {
        badgeText: "MARKET CLOSED",
        subText: timeStr,
        fullLabel: `MARKET CLOSED — ${timeStr}`,
        pillClasses: "bg-amber-950/40 border-amber-500/30 text-amber-300 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-300",
        dotClasses: "bg-amber-400/80",
        isLive: false,
        tooltip: `NSE/BSE Market closed. Last exchange session closed at ${timeStr}`,
      };
    }
  }

  // 6. Default fallback:
  return {
    badgeText: "SIMULATION",
    subText: "SYNTHETIC",
    fullLabel: "SIMULATION — SYNTHETIC",
    pillClasses: "bg-slate-900/90 border-slate-800 text-slate-400 dark:bg-slate-900/90 dark:border-slate-800 dark:text-slate-400",
    dotClasses: "bg-slate-400",
    isLive: false,
    tooltip: "Market simulation active",
  };
}
