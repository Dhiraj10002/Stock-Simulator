import { FeedStatus, MarketStatus, ConnectionState } from "@/stores/market-store";

export interface AuthoritativeStatusInfo {
  badgeText: string;
  subText?: string;
  fullLabel: string;
  bannerType: "live" | "simulated" | "closed" | "disconnected" | "unavailable";
  bannerTitle: string;
  bannerDescription: string;
  bannerClasses: string;
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
      bannerType: "disconnected",
      bannerTitle: "MARKET FEED RECONNECTING",
      bannerDescription: "WebSocket feed link was interrupted. Automatically re-establishing secure market stream...",
      bannerClasses: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-200",
      pillClasses: "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-300",
      dotClasses: "bg-rose-400 animate-pulse",
      isLive: false,
      tooltip: "Market feed connection dropped. Reconnecting...",
    };
  }

  // 2. If backend feed supervisor is unavailable:
  if (feedStatus.feedState === "UNAVAILABLE") {
    return {
      badgeText: "UNAVAILABLE",
      subText: "NO FEED",
      fullLabel: "UNAVAILABLE — NO FEED",
      bannerType: "unavailable",
      bannerTitle: "MARKET FEED UNAVAILABLE",
      bannerDescription: "Upstream exchange feed is currently unavailable. Live trade executions are paused to prevent bad fills.",
      bannerClasses: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-200",
      pillClasses: "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-300",
      dotClasses: "bg-rose-400",
      isLive: false,
      tooltip: "Market feed is unavailable. No trade execution allowed.",
    };
  }

  // 3. If backend feed supervisor is reconnecting / retrying:
  if (feedStatus.feedState === "RETRYING" || feedStatus.feedState === "DISCONNECTED") {
    return {
      badgeText: "DISCONNECTED",
      subText: "RECONNECTING",
      fullLabel: "DISCONNECTED — RECONNECTING",
      bannerType: "disconnected",
      bannerTitle: "FEED SUPERVISOR RETRYING",
      bannerDescription: "Market worker is reconnecting to the exchange feed. Real-time ticks may be momentarily delayed.",
      bannerClasses: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-200",
      pillClasses: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-300",
      dotClasses: "bg-amber-400 animate-pulse",
      isLive: false,
      tooltip: "Market worker feed disconnected. Attempting to reconnect...",
    };
  }

  // 4. If connecting:
  if (feedStatus.feedState === "CONNECTING" || connectionState === "connecting") {
    const sub = feedStatus.feedProvider === "angel_one" ? "ANGEL ONE" : "CONNECTING";
    return {
      badgeText: "CONNECTING",
      subText: sub,
      fullLabel: `CONNECTING — ${sub}`,
      bannerType: "disconnected",
      bannerTitle: "INITIALIZING MARKET FEED",
      bannerDescription: "Establishing encrypted connection and subscribing to live NSE/BSE symbol orderbooks...",
      bannerClasses: "bg-cyan-50 border-cyan-200 text-cyan-800 dark:bg-cyan-950/40 dark:border-cyan-500/30 dark:text-cyan-200",
      pillClasses: "bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-950/40 dark:border-cyan-500/30 dark:text-cyan-300",
      dotClasses: "bg-cyan-400 animate-pulse",
      isLive: false,
      tooltip: "Establishing live market data connection...",
    };
  }

  // 5. If synthetic simulation feed:
  if (feedStatus.isSynthetic || feedStatus.feedProvider === "synthetic" || feedStatus.feedState === "FALLBACK") {
    return {
      badgeText: "SIMULATION",
      subText: "SYNTHETIC",
      fullLabel: "SIMULATED MODE — SYNTHETIC",
      bannerType: "simulated",
      bannerTitle: "SIMULATED MODE",
      bannerDescription: "24/7 Geometric Brownian Motion synthetic simulation active. Practice orders and test trading strategies with zero risk.",
      bannerClasses: "bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950/40 dark:border-purple-500/30 dark:text-purple-200",
      pillClasses: "bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-500/30 dark:text-purple-300",
      dotClasses: "bg-purple-400 animate-pulse",
      isLive: true,
      tooltip: "Running on realistic 24/7 Synthetic Geometric Brownian Motion simulation feed",
    };
  }

  // 6. If Angel One live feed:
  if (feedStatus.feedProvider === "angel_one" && feedStatus.feedState === "LIVE") {
    const isMarketOpen = marketStatus === "OPEN";
    if (isMarketOpen) {
      return {
        badgeText: "LIVE",
        subText: "ANGEL ONE",
        fullLabel: "LIVE FEED — ANGEL ONE",
        bannerType: "live",
        bannerTitle: "LIVE FEED",
        bannerDescription: "Connected directly to Angel One institutional exchange feed. Real-time NSE/BSE market ticks active.",
        bannerClasses: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-200",
        pillClasses: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-300 dark:shadow-[0_0_12px_-2px_rgba(16,185,129,0.2)]",
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
        bannerType: "closed",
        bannerTitle: "MARKET CLOSED",
        bannerDescription: `NSE/BSE regular trading session is closed (09:15 - 15:30 IST). Last session closed at ${timeStr}. Orders placed now follow market hours rules.`,
        bannerClasses: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-200",
        pillClasses: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-300",
        dotClasses: "bg-amber-400/80",
        isLive: false,
        tooltip: `NSE/BSE Market closed. Last exchange session closed at ${timeStr}`,
      };
    }
  }

  // 7. Default fallback:
  return {
    badgeText: "SIMULATION",
    subText: "SYNTHETIC",
    fullLabel: "SIMULATED MODE — SYNTHETIC",
    bannerType: "simulated",
    bannerTitle: "SIMULATED MODE",
    bannerDescription: "Paper trading simulation active.",
    bannerClasses: "bg-slate-100 border-slate-300 text-slate-800 dark:bg-slate-900/90 dark:border-slate-800 dark:text-slate-300",
    pillClasses: "bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-900/90 dark:border-slate-800 dark:text-slate-400",
    dotClasses: "bg-slate-400",
    isLive: false,
    tooltip: "Market simulation active",
  };
}
