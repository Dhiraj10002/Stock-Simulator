"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
  X,
  Keyboard,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Minus,
} from "lucide-react";
import TradingViewChart from "@/components/trading/TradingViewChart";
import { useTradingStore } from "@/stores/trading-store";
import {
  useMarketStore,
  useSymbolQuote,
  useTargetedSubscription,
} from "@/stores/market-store";
import { useUIStore } from "@/stores/ui-store";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { formatPaise, formatPercent } from "@/lib/format";
import { apiFetch, publicFetch, getAuthToken } from "@/lib/api";
import { resolveCanonicalSymbol } from "@/lib/alias";
import { getAuthoritativeFeedStatus } from "@/lib/feedStatus";
import FeedStatusBanner from "@/components/layout/FeedStatusBanner";
import type { Candle, Wallet, Position, Order, Trade } from "@/types";

// Static catalog tabs for the Watchlist panel
interface WatchlistPreset {
  id: string;
  name: string;
  symbols: string[];
}

const WATCHLIST_PRESETS: WatchlistPreset[] = [
  {
    id: "core",
    name: "Core Nifty 50",
    symbols: ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "LT"],
  },
  {
    id: "momentum",
    name: "Momentum",
    symbols: ["TATAMOTORS", "BAJFINANCE", "ADANIENT", "ZOMATO", "TRENT", "APARINDS", "SUNPHARMA"],
  },
  {
    id: "fno",
    name: "F&O & Indices",
    symbols: ["NIFTY", "BANKNIFTY", "FINNIFTY", "TCS24SEPFUT", "NIFTY24SEPFUT"],
  },
];

const TIMEFRAMES = [
  { id: "1m", label: "1m", keyHint: "1" },
  { id: "5m", label: "5m", keyHint: "2" },
  { id: "15m", label: "15m", keyHint: "3" },
  { id: "1H", label: "1H", keyHint: "4" },
  { id: "1D", label: "1D", keyHint: "5" },
];

export default function TradingTerminalDesk() {
  const queryClient = useQueryClient();
  const setShortcutsGuideOpen = useUIStore((s) => s.setShortcutsGuideOpen);

  // Global Trading Store State
  const selectedSymbol = useTradingStore((s) => s.selectedSymbol);
  const setSelectedSymbol = useTradingStore((s) => s.setSelectedSymbol);

  // Terminal Layout State
  const [activeTimeframe, setActiveTimeframe] = useState<string>("1m");
  const [activeWatchlistTab, setActiveWatchlistTab] = useState<string>("core");
  const [watchlistSearch, setWatchlistSearch] = useState<string>("");
  const [mobileTab, setMobileTab] = useState<"chart" | "watchlist" | "order" | "desk">("chart");
  const [isBottomDrawerCollapsed, setIsBottomDrawerCollapsed] = useState<boolean>(false);
  const [bottomDrawerTab, setBottomDrawerTab] = useState<"positions" | "orders" | "trades">("positions");

  // Order Ticket State
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderProduct, setOrderProduct] = useState<"DELIVERY" | "INTRADAY">("DELIVERY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL" | "SL-M">("MARKET");
  const [quantity, setQuantity] = useState<number>(10);
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [triggerPrice, setTriggerPrice] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [orderFeedback, setOrderFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Quantity input ref for hotkey focus
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Authentication State
  const [token, setToken] = useState<string>(() =>
    typeof window !== "undefined" ? getAuthToken() : ""
  );
  useEffect(() => {
    const handleAuthChange = () => setToken(getAuthToken());
    window.addEventListener("auth-changed", handleAuthChange);
    return () => window.removeEventListener("auth-changed", handleAuthChange);
  }, []);

  // Active Symbol Live Quote & Feed State
  const liveQuote = useSymbolQuote(selectedSymbol);
  const feedStatus = useMarketStore((s) => s.feedStatus);
  const serverMarketStatus = useMarketStore((s) => s.marketStatus);
  const connectionState = useMarketStore((s) => s.connectionState);
  const quotesMap = useMarketStore((s) => s.quotes);

  const authoritativeStatus = getAuthoritativeFeedStatus(
    feedStatus,
    serverMarketStatus,
    connectionState
  );

  // Pre-populate limit price from live quote if empty or on symbol change
  useEffect(() => {
    if (liveQuote && liveQuote.price_paise > 0) {
      const p = (liveQuote.price_paise / 100).toFixed(2);
      queueMicrotask(() => {
        setLimitPrice((prev) => (prev === "" ? p : prev));
      });
    }
  }, [liveQuote, selectedSymbol]);

  // Aggregate symbols for WebSocket subscription
  const currentTabPreset = useMemo(
    () => WATCHLIST_PRESETS.find((p) => p.id === activeWatchlistTab) || WATCHLIST_PRESETS[0],
    [activeWatchlistTab]
  );

  const activeSymbolsToSubscribe = useMemo(() => {
    const set = new Set<string>();
    set.add(selectedSymbol);
    currentTabPreset.symbols.forEach((s) => set.add(s));
    return Array.from(set);
  }, [selectedSymbol, currentTabPreset]);

  // Phase 5 targeted WebSocket subscription
  useTargetedSubscription(activeSymbolsToSubscribe);

  // 1. Fetch Historical Candles for Chart
  const candleLimit = useMemo(() => {
    switch (activeTimeframe) {
      case "1m":
        return 120;
      case "5m":
        return 180;
      case "15m":
        return 240;
      case "1H":
        return 360;
      case "1D":
        return 500;
      default:
        return 120;
    }
  }, [activeTimeframe]);

  const {
    data: historicalCandles = [],
    isLoading: isCandlesLoading,
    refetch: refetchCandles,
  } = useQuery<Candle[]>({
    queryKey: ["candle-history", selectedSymbol, candleLimit],
    queryFn: () =>
      publicFetch<Candle[]>(
        `/market/quotes/${encodeURIComponent(selectedSymbol)}/history?limit=${candleLimit}`
      ),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // 2. Fetch User Wallet
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", token],
    queryFn: () => apiFetch<Wallet>("/wallet"),
    enabled: !!token,
    refetchInterval: 10000,
  });

  // 3. Fetch User Positions & Portfolio
  const { data: portfolio } = useQuery<{
    invested_value_paise: number;
    current_value_paise: number;
    unrealized_pnl_paise: number;
    positions: Position[];
  }>({
    queryKey: ["portfolio", token],
    queryFn: () => apiFetch("/portfolio"),
    enabled: !!token,
    refetchInterval: 5000,
  });

  // 4. Fetch User Orders
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["orders", token],
    queryFn: () => apiFetch<Order[]>("/orders"),
    enabled: !!token,
    refetchInterval: 5000,
  });

  // 5. Fetch User Trades
  const { data: trades = [] } = useQuery<Trade[]>({
    queryKey: ["trades", token],
    queryFn: () => apiFetch<Trade[]>("/trades"),
    enabled: !!token,
    refetchInterval: 8000,
  });

  // Filter pending/open orders
  const pendingOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status === "OPEN" ||
        o.status === "PENDING" ||
        o.status === "TRIGGER_PENDING"
    );
  }, [orders]);

  // Reprice positions using live WebSocket quotes
  const livePositions = useMemo(() => {
    const raw = portfolio?.positions || [];
    return raw.map((pos) => {
      const canonical = resolveCanonicalSymbol(pos.symbol);
      const quote = quotesMap[pos.symbol] || quotesMap[canonical];
      let ltpPaise = pos.current_price_paise;
      let quoteStatus = pos.quote_status || (ltpPaise > 0 ? "FRESH" : "UNAVAILABLE");

      if (quote && quote.price_paise > 0) {
        ltpPaise = quote.price_paise;
        quoteStatus = "FRESH";
      }

      const qty = pos.quantity;
      const avg = pos.average_price_paise;
      const currentValPaise = Math.abs(qty) * ltpPaise;
      let pnlPaise = pos.unrealized_pnl_paise;

      if (ltpPaise > 0) {
        if (qty < 0) {
          pnlPaise = (avg - ltpPaise) * Math.abs(qty);
        } else {
          pnlPaise = (ltpPaise - avg) * qty;
        }
      }

      return {
        ...pos,
        current_price_paise: ltpPaise,
        current_value_paise: currentValPaise,
        unrealized_pnl_paise: pnlPaise,
        quote_status: quoteStatus,
      };
    });
  }, [portfolio?.positions, quotesMap]);

  // Aggregate Total Unrealized P&L
  const totalUnrealizedPnlPaise = useMemo(() => {
    return livePositions.reduce((acc, p) => acc + (p.unrealized_pnl_paise || 0), 0);
  }, [livePositions]);

  // ---------------------------------------------------------------------------
  // Financial & Margin Calculations for Order Ticket
  // ---------------------------------------------------------------------------
  const effectivePrice = useMemo(() => {
    if (orderType === "LIMIT" || orderType === "SL") {
      const parsed = parseFloat(limitPrice);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (liveQuote && liveQuote.price_paise > 0) {
      return liveQuote.price_paise / 100;
    }
    return 100.0;
  }, [orderType, limitPrice, liveQuote]);

  const grossOrderValue = useMemo(() => {
    return effectivePrice * quantity;
  }, [effectivePrice, quantity]);

  // Margin Requirement: MIS is 5x leverage (20% margin); Delivery is 100% margin
  const requiredMargin = useMemo(() => {
    return orderProduct === "INTRADAY" ? grossOrderValue / 5 : grossOrderValue;
  }, [orderProduct, grossOrderValue]);

  const availableBalance = useMemo(() => {
    return (wallet?.available_balance_paise ?? 100000000) / 100;
  }, [wallet?.available_balance_paise]);

  const isMarginSufficient = availableBalance >= requiredMargin;

  // Estimated statutory & exchange charges
  const estimatedCharges = useMemo(() => {
    const isIntraday = orderProduct === "INTRADAY";
    const brokerage = 0; // Zero commission paper simulator
    const stt = isIntraday
      ? orderSide === "SELL" ? grossOrderValue * 0.00025 : 0
      : grossOrderValue * 0.001;
    const exchangeTurnover = grossOrderValue * 0.0000297;
    const sebiCharges = grossOrderValue * 0.000001;
    const gst = (brokerage + exchangeTurnover) * 0.18;
    const stampDuty = orderSide === "BUY" ? grossOrderValue * (isIntraday ? 0.00003 : 0.00015) : 0;
    const total = stt + exchangeTurnover + sebiCharges + gst + stampDuty;

    return {
      brokerage,
      stt,
      exchangeTurnover,
      sebiCharges,
      gst,
      stampDuty,
      total,
    };
  }, [grossOrderValue, orderProduct, orderSide]);

  // ---------------------------------------------------------------------------
  // Order Placement Handler
  // ---------------------------------------------------------------------------
  const handleExecuteOrder = useCallback(async () => {
    if (!token) {
      setOrderFeedback({
        type: "error",
        message: "Please log in to place orders",
      });
      setTimeout(() => setOrderFeedback(null), 3000);
      return;
    }

    if (quantity <= 0) {
      setOrderFeedback({
        type: "error",
        message: "Quantity must be greater than zero",
      });
      setTimeout(() => setOrderFeedback(null), 3000);
      return;
    }

    if (!isMarginSufficient && orderSide === "BUY") {
      setOrderFeedback({
        type: "error",
        message: `Insufficient margin. Required ₹${requiredMargin.toFixed(2)}, available ₹${availableBalance.toFixed(2)}`,
      });
      setTimeout(() => setOrderFeedback(null), 4000);
      return;
    }

    setIsSubmitting(true);
    setOrderFeedback(null);

    try {
      const isMarket = orderType === "MARKET";
      const limitPaise =
        orderType === "LIMIT" || orderType === "SL"
          ? Math.round(parseFloat(limitPrice) * 100)
          : 0;
      const triggerPaise =
        orderType === "SL" || orderType === "SL-M"
          ? Math.round(parseFloat(triggerPrice) * 100)
          : 0;

      const payload = {
        symbol: selectedSymbol,
        side: orderSide,
        type: orderType,
        product: orderProduct,
        quantity,
        price_paise: limitPaise,
        trigger_price_paise: triggerPaise,
      };

      const created = await apiFetch<{
        uuid: string;
        status: string;
        executed_price_paise?: number;
      }>("/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Auto-trigger execution if it's a MARKET order still pending
      if (isMarket && created?.uuid && created.status !== "EXECUTED") {
        await apiFetch(`/orders/${created.uuid}/execute`, { method: "POST" });
      }

      const fillPrice = created?.executed_price_paise
        ? (created.executed_price_paise / 100).toFixed(2)
        : effectivePrice.toFixed(2);

      setOrderFeedback({
        type: "success",
        message: isMarket
          ? `✓ ${orderSide} ${quantity} ${selectedSymbol} executed @ ₹${fillPrice}`
          : `✓ ${orderSide} ${orderType} ${quantity} ${selectedSymbol} @ ₹${effectivePrice.toFixed(2)} placed`,
      });

      // Invalidate relevant queries
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["trades"] });

      setTimeout(() => setOrderFeedback(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to place order";
      setOrderFeedback({
        type: "error",
        message: `✗ ${msg}`,
      });
      setTimeout(() => setOrderFeedback(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    token,
    quantity,
    isMarginSufficient,
    orderSide,
    requiredMargin,
    availableBalance,
    orderType,
    limitPrice,
    triggerPrice,
    selectedSymbol,
    orderProduct,
    effectivePrice,
    queryClient,
  ]);

  // ---------------------------------------------------------------------------
  // Order Cancellation Handler
  // ---------------------------------------------------------------------------
  const handleCancelOrder = async (orderUuid: string) => {
    if (!token) return;
    try {
      await apiFetch(`/orders/${orderUuid}`, { method: "DELETE" });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel order");
    }
  };

  // ---------------------------------------------------------------------------
  // Position Square-Off Handler
  // ---------------------------------------------------------------------------
  const handleSquareOffPosition = async (pos: Position) => {
    if (!token) return;
    const closeSide = pos.quantity > 0 ? "SELL" : "BUY";
    try {
      await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol: pos.symbol,
          side: closeSide,
          type: "MARKET",
          product: pos.product,
          quantity: Math.abs(pos.quantity),
        }),
      });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to square off position");
    }
  };

  // ---------------------------------------------------------------------------
  // Bulk MIS Square-off Handler
  // ---------------------------------------------------------------------------
  const handleSquareOffAllMIS = async () => {
    if (!token) return;
    if (!confirm("Are you sure you want to square off ALL open intraday (MIS) positions at market price?")) {
      return;
    }
    try {
      await apiFetch("/orders/squareoff-mis", { method: "POST" });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to square off MIS positions");
    }
  };

  // ---------------------------------------------------------------------------
  // Keyboard Shortcuts Hook
  // ---------------------------------------------------------------------------
  useKeyboardShortcuts({
    onBuy: () => {
      setOrderSide("BUY");
      qtyInputRef.current?.focus();
      setMobileTab("order");
    },
    onSell: () => {
      setOrderSide("SELL");
      qtyInputRef.current?.focus();
      setMobileTab("order");
    },
    onCancel: () => {
      setOrderFeedback(null);
      if (!isBottomDrawerCollapsed) {
        // Can toggle or blur
        qtyInputRef.current?.blur();
      }
    },
    onTimeframeChange: (tf) => {
      setActiveTimeframe(tf);
    },
    onFocusPositions: () => {
      setIsBottomDrawerCollapsed(false);
      setBottomDrawerTab("positions");
      setMobileTab("desk");
    },
    onFocusOrders: () => {
      setIsBottomDrawerCollapsed(false);
      setBottomDrawerTab("orders");
      setMobileTab("desk");
    },
    onToggleShortcutsModal: () => {
      setShortcutsGuideOpen(true);
    },
  });

  // Filtered Watchlist Symbols
  const filteredWatchlistSymbols = useMemo(() => {
    const list = currentTabPreset.symbols;
    if (!watchlistSearch.trim()) return list;
    const q = watchlistSearch.trim().toUpperCase();
    return list.filter((s) => s.toUpperCase().includes(q));
  }, [currentTabPreset, watchlistSearch]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-slate-950 text-slate-100 select-none overflow-hidden font-sans">
      {/* Authoritative Market & Feed Status Announcement Banner */}
      <FeedStatusBanner />

      {/* -------------------------------------------------------------------- */}
      {/* 1. TOP SUBHEADER / TICKER BAR */}
      {/* -------------------------------------------------------------------- */}
      <div className="h-12 border-b border-slate-800/80 bg-slate-900/90 px-4 flex items-center justify-between shrink-0 gap-4">
        {/* Symbol Info & Price */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white transition-all text-xs font-semibold mr-1"
            title="Return to Main Dashboard"
          >
            <span className="font-black font-mono text-cyan-400">SS</span>
            <span className="hidden sm:inline text-[11px] text-slate-400">Desk</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-black tracking-wider text-cyan-400">
              {selectedSymbol}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold border border-slate-700">
              NSE
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* LTP & Change */}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold font-mono tracking-tight text-white">
              {liveQuote && liveQuote.price_paise > 0
                ? formatPaise(liveQuote.price_paise)
                : "₹---"}
            </span>

            {liveQuote && liveQuote.change_percent !== undefined && (
              <span
                className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                  liveQuote.change_percent >= 0
                    ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                    : "bg-rose-950/60 text-rose-400 border border-rose-800/50"
                }`}
              >
                {liveQuote.change_percent >= 0 ? (
                  <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 stroke-[2.5]" />
                )}
                {formatPercent(liveQuote.change_percent)}
              </span>
            )}
          </div>

          {/* Session Metrics (Hidden on Mobile) */}
          <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-slate-400 pl-2">
            <div>
              <span className="text-slate-500">H:</span>{" "}
              <span className="text-slate-200">
                {liveQuote?.high_paise ? formatPaise(liveQuote.high_paise) : "--"}
              </span>
            </div>
            <div>
              <span className="text-slate-500">L:</span>{" "}
              <span className="text-slate-200">
                {liveQuote?.low_paise ? formatPaise(liveQuote.low_paise) : "--"}
              </span>
            </div>
            <div>
              <span className="text-slate-500">O:</span>{" "}
              <span className="text-slate-200">
                {liveQuote?.open_paise ? formatPaise(liveQuote.open_paise) : "--"}
              </span>
            </div>
          </div>
        </div>

        {/* Timeframe Controls & Global Actions */}
        <div className="flex items-center gap-2">
          {/* Timeframe selector */}
          <div className="hidden sm:flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setActiveTimeframe(tf.id)}
                className={`px-2 py-1 rounded text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  activeTimeframe === tf.id
                    ? "bg-cyan-500 text-slate-950 shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
                title={`Switch to ${tf.label} timeframe [Hotkey: ${tf.keyHint}]`}
              >
                {tf.label}
                <span className="text-[9px] opacity-60">[{tf.keyHint}]</span>
              </button>
            ))}
          </div>

          {/* Authoritative Market & Feed Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono transition-colors shadow-xs ${authoritativeStatus.pillClasses}`}
            title={authoritativeStatus.tooltip}
          >
            <span
              className={`w-2 h-2 rounded-full ${authoritativeStatus.dotClasses}`}
            />
            <span className="hidden sm:inline font-bold tracking-wider text-[10px] uppercase">
              {authoritativeStatus.bannerTitle}
            </span>
            {authoritativeStatus.subText && (
              <span className="hidden lg:inline text-[9px] opacity-75 font-mono border-l border-current/25 pl-1.5">
                {authoritativeStatus.subText}
              </span>
            )}
          </div>

          {/* Keyboard Cheatsheet Button */}
          <button
            type="button"
            onClick={() => setShortcutsGuideOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 cursor-pointer flex items-center gap-1 text-xs"
            title="Keyboard Shortcuts Cheatsheet [?]"
          >
            <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline font-mono font-semibold text-[11px]">?</span>
          </button>

          {/* Link to Standard Stocks Overview */}
          <Link
            href={`/stocks/${selectedSymbol}`}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 text-xs font-semibold hidden md:inline-flex items-center gap-1"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="text-[11px]">Overview</span>
          </Link>
        </div>
      </div>

      {/* Mobile Segmented Navigation Tab Switcher */}
      <div className="flex md:hidden bg-slate-900 border-b border-slate-800 text-xs font-bold">
        <button
          type="button"
          onClick={() => setMobileTab("chart")}
          className={`flex-1 py-2 text-center border-b-2 cursor-pointer ${
            mobileTab === "chart"
              ? "border-cyan-400 text-cyan-400 bg-slate-800/50"
              : "border-transparent text-slate-400"
          }`}
        >
          Chart
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("watchlist")}
          className={`flex-1 py-2 text-center border-b-2 cursor-pointer ${
            mobileTab === "watchlist"
              ? "border-cyan-400 text-cyan-400 bg-slate-800/50"
              : "border-transparent text-slate-400"
          }`}
        >
          Watchlist
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("order")}
          className={`flex-1 py-2 text-center border-b-2 cursor-pointer ${
            mobileTab === "order"
              ? "border-cyan-400 text-cyan-400 bg-slate-800/50"
              : "border-transparent text-slate-400"
          }`}
        >
          Order Ticket
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("desk")}
          className={`flex-1 py-2 text-center border-b-2 cursor-pointer ${
            mobileTab === "desk"
              ? "border-cyan-400 text-cyan-400 bg-slate-800/50"
              : "border-transparent text-slate-400"
          }`}
        >
          Positions
        </button>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2. MAIN 3-PANEL TRADING WORKSPACE */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* PANEL 1: LEFT WATCHLIST (~280px) */}
        <div
          className={`w-full md:w-72 lg:w-80 border-r border-slate-800 bg-slate-950/80 flex flex-col shrink-0 ${
            mobileTab === "watchlist" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Watchlist Presets Tab Bar */}
          <div className="flex border-b border-slate-800/80 bg-slate-900/60 px-2 pt-2 gap-1 overflow-x-auto scrollbar-none">
            {WATCHLIST_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveWatchlistTab(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-all shrink-0 cursor-pointer ${
                  activeWatchlistTab === p.id
                    ? "bg-slate-950 text-cyan-400 border-t-2 border-cyan-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="p-2 border-b border-slate-800/60 bg-slate-950">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={watchlistSearch}
                onChange={(e) => setWatchlistSearch(e.target.value)}
                placeholder="Filter watchlist..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 transition-colors font-mono"
              />
              {watchlistSearch && (
                <button
                  type="button"
                  onClick={() => setWatchlistSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Instruments List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900/60">
            {filteredWatchlistSymbols.map((sym) => {
              const q = quotesMap[sym];
              const isSelected = selectedSymbol === sym;
              const hasQuote = q && q.price_paise > 0;
              const isPositive = (q?.change_percent ?? 0) >= 0;

              return (
                <div
                  key={sym}
                  onClick={() => {
                    setSelectedSymbol(sym);
                    if (mobileTab === "watchlist") setMobileTab("chart");
                  }}
                  className={`px-3 py-2.5 flex items-center justify-between cursor-pointer group transition-colors ${
                    isSelected
                      ? "bg-cyan-950/40 border-l-2 border-cyan-400"
                      : "hover:bg-slate-900/60"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-mono font-bold truncate ${
                          isSelected ? "text-cyan-400" : "text-slate-200"
                        }`}
                      >
                        {sym}
                      </span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-900 text-slate-500 font-mono">
                        NSE
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-white">
                      {hasQuote ? formatPaise(q.price_paise) : "---"}
                    </div>
                    {hasQuote && q.change_percent !== undefined && (
                      <div
                        className={`text-[10px] font-mono font-semibold flex items-center justify-end gap-0.5 ${
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {formatPercent(q.change_percent)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredWatchlistSymbols.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-500">
                No matching symbols found
              </div>
            )}
          </div>
        </div>

        {/* PANEL 2: CENTER CHART (flex-1) */}
        <div
          className={`flex-1 flex flex-col bg-slate-950 min-w-0 ${
            mobileTab === "chart" ? "flex" : "hidden md:flex"
          }`}
        >
          <div className="flex-1 relative min-h-[300px]">
            <TradingViewChart
              key={`${selectedSymbol}-${activeTimeframe}`}
              symbol={selectedSymbol}
              historicalCandles={historicalCandles}
              liveQuote={liveQuote}
              isLoading={isCandlesLoading}
              onRefresh={refetchCandles}
              defaultTimeframe={activeTimeframe}
              onTimeframeChange={setActiveTimeframe}
              height={420}
              className="w-full h-full border-0"
            />
          </div>
        </div>

        {/* PANEL 3: RIGHT QUICK ORDER ENTRY TICKET (~340px) */}
        <div
          className={`w-full md:w-80 lg:w-88 border-l border-slate-800 bg-slate-950/90 flex flex-col shrink-0 ${
            mobileTab === "order" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Header Action Switcher: BUY vs SELL */}
          <div className="p-3 border-b border-slate-800/80 bg-slate-900/60">
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => setOrderSide("BUY")}
                className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  orderSide === "BUY"
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-950/50"
                    : "text-slate-400 hover:text-emerald-400 hover:bg-slate-900"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                BUY <span className="text-[10px] opacity-75 font-mono">[B]</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderSide("SELL")}
                className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  orderSide === "SELL"
                    ? "bg-rose-600 text-white shadow-lg shadow-rose-950/50"
                    : "text-slate-400 hover:text-rose-400 hover:bg-slate-900"
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                SELL <span className="text-[10px] opacity-75 font-mono">[S]</span>
              </button>
            </div>
          </div>

          {/* Order Configuration Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Feedback Alert */}
            {orderFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold border flex items-center gap-2 animate-fade-in ${
                  orderFeedback.type === "success"
                    ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
                    : "bg-rose-950/80 border-rose-500/40 text-rose-200"
                }`}
              >
                {orderFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{orderFeedback.message}</span>
              </div>
            )}

            {/* Product: Delivery CNC vs Intraday MIS */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Product Segment
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderProduct("DELIVERY")}
                  className={`p-2 rounded-lg border text-xs font-bold transition-all cursor-pointer text-left ${
                    orderProduct === "DELIVERY"
                      ? "border-cyan-500 bg-cyan-950/30 text-cyan-300"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div>Delivery (CNC)</div>
                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                    100% Cash • Hold Long
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderProduct("INTRADAY")}
                  className={`p-2 rounded-lg border text-xs font-bold transition-all cursor-pointer text-left ${
                    orderProduct === "INTRADAY"
                      ? "border-cyan-500 bg-cyan-950/30 text-cyan-300"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Intraday (MIS)</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                      5x
                    </span>
                  </div>
                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                    Square-off 15:20 IST
                  </div>
                </button>
              </div>
            </div>

            {/* Order Type: MARKET | LIMIT | SL | SL-M */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Order Type
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
                {(["MARKET", "LIMIT", "SL", "SL-M"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setOrderType(t)}
                    className={`py-1 text-[11px] font-mono font-bold rounded cursor-pointer transition-all ${
                      orderType === t
                        ? "bg-slate-800 text-cyan-300 shadow-xs"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity Input with Stepper */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Quantity (Shares)
                </label>
                <div className="flex items-center gap-1">
                  {[10, 50, 100, 500].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setQuantity((q) => q + inc)}
                      className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[10px] font-mono text-slate-400 hover:text-cyan-300 border border-slate-800 transition-colors cursor-pointer"
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <input
                  ref={qtyInputRef}
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-center text-sm font-mono font-bold text-white focus:outline-hidden focus:border-cyan-500 transition-colors"
                />

                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Price Inputs (Limit / Trigger) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  disabled={orderType === "MARKET" || orderType === "SL-M"}
                  value={
                    orderType === "MARKET" || orderType === "SL-M"
                      ? effectivePrice.toFixed(2)
                      : limitPrice
                  }
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="Market"
                  className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono font-bold focus:outline-hidden transition-colors ${
                    orderType === "MARKET" || orderType === "SL-M"
                      ? "border-slate-800/60 text-slate-500 cursor-not-allowed"
                      : "border-slate-800 text-white focus:border-cyan-500"
                  }`}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Trigger Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  disabled={orderType !== "SL" && orderType !== "SL-M"}
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  placeholder="0.00"
                  className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono font-bold focus:outline-hidden transition-colors ${
                    orderType !== "SL" && orderType !== "SL-M"
                      ? "border-slate-800/60 text-slate-500 cursor-not-allowed"
                      : "border-slate-800 text-white focus:border-cyan-500"
                  }`}
                />
              </div>
            </div>

            {/* Margin Calculation Summary */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-400">
                <span>Required Margin:</span>
                <span className="font-bold text-white">
                  ₹{requiredMargin.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-400">
                <span>Available Cash:</span>
                <span className="font-bold text-cyan-400">
                  ₹{availableBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-400">
                <span>Estimated Taxes & Charges:</span>
                <span className="text-slate-300">₹{estimatedCharges.total.toFixed(2)}</span>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Margin Status:</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-bold ${
                    isMarginSufficient
                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                      : "bg-rose-950/60 text-rose-400 border border-rose-800/40"
                  }`}
                >
                  {isMarginSufficient
                    ? "✓ Sufficient Balance"
                    : `✗ Deficit: ₹${(requiredMargin - availableBalance).toFixed(2)}`}
                </span>
              </div>
            </div>
          </div>

          {/* Execution Action Button */}
          <div className="p-4 border-t border-slate-800/80 bg-slate-900/80">
            <button
              type="button"
              disabled={isSubmitting || (!isMarginSufficient && orderSide === "BUY")}
              onClick={handleExecuteOrder}
              className={`w-full py-3 rounded-xl text-sm font-bold shadow-xl transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                orderSide === "BUY"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-emerald-950 disabled:text-emerald-700"
                  : "bg-rose-600 hover:bg-rose-500 text-white disabled:bg-rose-950 disabled:text-rose-700"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>
                    {orderSide} {quantity} {selectedSymbol} @{" "}
                    {orderType === "MARKET" ? "MKT" : `₹${effectivePrice.toFixed(2)}`}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono opacity-75 font-normal">
                Press [Enter] to execute • [C] to cancel
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 3. BOTTOM DOCKABLE DRAWER: POSITIONS & ORDERS EXECUTION DESK */}
      {/* -------------------------------------------------------------------- */}
      <div
        className={`border-t border-slate-800 bg-slate-950 flex flex-col shrink-0 transition-all duration-200 ${
          mobileTab === "desk" ? "flex h-80" : isBottomDrawerCollapsed ? "h-9" : "h-56 lg:h-64"
        }`}
      >
        {/* Drawer Header */}
        <div className="h-9 px-4 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setBottomDrawerTab("positions");
                setIsBottomDrawerCollapsed(false);
              }}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                bottomDrawerTab === "positions"
                  ? "bg-slate-800 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Positions</span>
              <span className="px-1 py-0.2 rounded bg-slate-950 text-[10px] text-cyan-400">
                {livePositions.length}
              </span>
              <span className="text-[9px] text-slate-500 hidden sm:inline">[⇧P]</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBottomDrawerTab("orders");
                setIsBottomDrawerCollapsed(false);
              }}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                bottomDrawerTab === "orders"
                  ? "bg-slate-800 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Pending Orders</span>
              <span className="px-1 py-0.2 rounded bg-slate-950 text-[10px] text-amber-400">
                {pendingOrders.length}
              </span>
              <span className="text-[9px] text-slate-500 hidden sm:inline">[⇧O]</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBottomDrawerTab("trades");
                setIsBottomDrawerCollapsed(false);
              }}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                bottomDrawerTab === "trades"
                  ? "bg-slate-800 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Executed Trades</span>
              <span className="px-1 py-0.2 rounded bg-slate-950 text-[10px] text-slate-400">
                {trades.length}
              </span>
            </button>
          </div>

          {/* Right Drawer Actions */}
          <div className="flex items-center gap-3">
            {/* Live Unrealized P&L Chip */}
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold">
              <span className="text-slate-500 hidden sm:inline">Unrealized P&L:</span>
              <span
                className={`px-2 py-0.5 rounded text-xs ${
                  totalUnrealizedPnlPaise >= 0
                    ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                    : "bg-rose-950/60 text-rose-400 border border-rose-800/50"
                }`}
              >
                {formatPaise(totalUnrealizedPnlPaise)}
              </span>
            </div>

            {/* Quick Bulk Square-Off Button */}
            {livePositions.some((p) => p.product === "INTRADAY") && (
              <button
                type="button"
                onClick={handleSquareOffAllMIS}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950/60 text-rose-400 hover:bg-rose-900 border border-rose-800/50 transition-colors cursor-pointer"
                title="Square off all open MIS positions at market"
              >
                Exit MIS
              </button>
            )}

            {/* Drawer Expand/Collapse Toggle */}
            <button
              type="button"
              onClick={() => setIsBottomDrawerCollapsed((c) => !c)}
              className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              {isBottomDrawerCollapsed ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Drawer Table Content */}
        {!isBottomDrawerCollapsed && (
          <div className="flex-1 overflow-auto bg-slate-950">
            {/* 1. POSITIONS TABLE */}
            {bottomDrawerTab === "positions" && (
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Symbol</th>
                    <th className="py-2 px-3 font-semibold">Product</th>
                    <th className="py-2 px-3 font-semibold text-right">Net Qty</th>
                    <th className="py-2 px-3 font-semibold text-right">Avg Price</th>
                    <th className="py-2 px-3 font-semibold text-right">LTP</th>
                    <th className="py-2 px-3 font-semibold text-right">Value</th>
                    <th className="py-2 px-3 font-semibold text-right">P&L</th>
                    <th className="py-2 px-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {livePositions.map((pos) => {
                    const isLong = pos.quantity > 0;
                    const isProfit = (pos.unrealized_pnl_paise || 0) >= 0;

                    return (
                      <tr
                        key={pos.uuid || `${pos.symbol}-${pos.product}`}
                        className="hover:bg-slate-900/50 transition-colors"
                      >
                        <td className="py-2 px-3 font-bold text-white flex items-center gap-1.5">
                          <span>{pos.symbol}</span>
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                              isLong
                                ? "bg-emerald-950 text-emerald-400"
                                : "bg-rose-950 text-rose-400"
                            }`}
                          >
                            {isLong ? "LONG" : "SHORT"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400">{pos.product}</td>
                        <td className="py-2 px-3 text-right font-bold text-white">
                          {pos.quantity}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">
                          {formatPaise(pos.average_price_paise)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-cyan-400">
                          {formatPaise(pos.current_price_paise)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">
                          {formatPaise(pos.current_value_paise)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            isProfit ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatPaise(pos.unrealized_pnl_paise)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleSquareOffPosition(pos)}
                            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-800 hover:border-rose-700 transition-colors cursor-pointer text-[11px]"
                          >
                            Square Off
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {livePositions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No active open positions. Place a BUY or SELL order to begin trading.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* 2. PENDING ORDERS TABLE */}
            {bottomDrawerTab === "orders" && (
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Time</th>
                    <th className="py-2 px-3 font-semibold">Symbol</th>
                    <th className="py-2 px-3 font-semibold">Side</th>
                    <th className="py-2 px-3 font-semibold">Type</th>
                    <th className="py-2 px-3 font-semibold">Product</th>
                    <th className="py-2 px-3 font-semibold text-right">Qty</th>
                    <th className="py-2 px-3 font-semibold text-right">Price</th>
                    <th className="py-2 px-3 font-semibold text-right">Trigger</th>
                    <th className="py-2 px-3 font-semibold text-center">Status</th>
                    <th className="py-2 px-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {pendingOrders.map((ord) => (
                    <tr key={ord.uuid} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-2 px-3 text-slate-500">
                        {new Date(ord.created_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-2 px-3 font-bold text-white">{ord.symbol}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            ord.side === "BUY"
                              ? "bg-emerald-950 text-emerald-400"
                              : "bg-rose-950 text-rose-400"
                          }`}
                        >
                          {ord.side}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400">{ord.type}</td>
                      <td className="py-2 px-3 text-slate-400">{ord.product}</td>
                      <td className="py-2 px-3 text-right font-bold text-white">
                        {ord.quantity}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">
                        {ord.price_paise > 0 ? formatPaise(ord.price_paise) : "MKT"}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400">
                        {ord.trigger_price_paise ? formatPaise(ord.trigger_price_paise) : "--"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40 text-[10px]">
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(ord.uuid)}
                          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-800 hover:border-rose-700 transition-colors cursor-pointer text-[11px]"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}

                  {pendingOrders.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        No pending or open orders at this time.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* 3. EXECUTED TRADES TABLE */}
            {bottomDrawerTab === "trades" && (
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Time</th>
                    <th className="py-2 px-3 font-semibold">Symbol</th>
                    <th className="py-2 px-3 font-semibold">Side</th>
                    <th className="py-2 px-3 font-semibold">Product</th>
                    <th className="py-2 px-3 font-semibold text-right">Qty</th>
                    <th className="py-2 px-3 font-semibold text-right">Fill Price</th>
                    <th className="py-2 px-3 font-semibold text-right">Value</th>
                    <th className="py-2 px-3 font-semibold text-right">Realized P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {trades.map((tr) => (
                    <tr key={tr.uuid} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-2 px-3 text-slate-500">
                        {new Date(tr.executed_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-2 px-3 font-bold text-white">{tr.symbol}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            tr.side === "BUY"
                              ? "bg-emerald-950 text-emerald-400"
                              : "bg-rose-950 text-rose-400"
                          }`}
                        >
                          {tr.side}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400">{tr.product}</td>
                      <td className="py-2 px-3 text-right font-bold text-white">
                        {tr.quantity}
                      </td>
                      <td className="py-2 px-3 text-right text-cyan-400 font-bold">
                        {formatPaise(tr.executed_price_paise)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">
                        {formatPaise(tr.quantity * tr.executed_price_paise)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          (tr.realized_pnl_paise || 0) >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {tr.realized_pnl_paise ? formatPaise(tr.realized_pnl_paise) : "--"}
                      </td>
                    </tr>
                  ))}

                  {trades.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No executed trades recorded yet in this session.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
