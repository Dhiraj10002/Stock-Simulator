"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Bell,
  User as UserIcon,
  ChevronRight,
  Plus,
  Check,
  Share2,
  SlidersHorizontal,
  Bookmark,
  Building2,
  PieChart,
  BarChart3,
  Calendar,
  ShieldCheck,
  Clock,
  Briefcase,
  Layers,
  ArrowLeft,
  X,
  Info,
  Sparkles,
  Newspaper,
  BrainCircuit,
  ShieldAlert,
  Zap,
  ArrowRight,
  CandlestickChart,
  AreaChart,
  Loader2,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import { MASTER_STOCKS_CATALOG, WatchlistItem } from "@/components/dashboard/DashboardPage";
import { useMarketStore } from "@/stores/market-store";
import Navbar from "@/components/layout/Navbar";
import { apiFetch, publicFetch, getAuthToken } from "@/lib/api";
import type { Wallet, Candle, ApiResponse, Quote as QuoteType } from "@/types";

interface StockDetailsProps {
  initialSymbol?: string;
}

// Comprehensive Metadata & Fundamentals per stock
interface StockFundamentals {
  marketCapCr: number;
  peRatio: number;
  pbRatio: number;
  industryPe: number;
  debtToEquity: number;
  roe: number;
  eps: number;
  divYield: number;
  bookValue: number;
  faceValue: number;
  todayLow: number;
  todayHigh: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  openPrice: number;
  prevClose: number;
  volumeShares: string;
  tradedValueCr: number;
  upperCircuit: number;
  lowerCircuit: number;
  sector: string;
  industry: string;
  ceo: string;
  founded: string;
  headquarters: string;
  about: string;
}

const STOCK_PROFILES: Record<string, Partial<StockFundamentals>> = {
  ITC: {
    sector: "Consumer Staples & FMCG",
    industry: "Cigarettes, Packaged Foods & Paperboards",
    ceo: "Sanjiv Puri (Chairman & MD)",
    founded: "1910",
    headquarters: "Kolkata, West Bengal",
    marketCapCr: 614480,
    peRatio: 28.45,
    pbRatio: 7.82,
    industryPe: 34.2,
    debtToEquity: 0.01,
    roe: 29.4,
    eps: 17.3,
    divYield: 3.24,
    bookValue: 62.8,
    faceValue: 1.0,
    todayLow: 488.5,
    todayHigh: 494.8,
    fiftyTwoWeekLow: 399.3,
    fiftyTwoWeekHigh: 528.55,
    openPrice: 489.0,
    prevClose: 489.2,
    volumeShares: "1.48 Cr",
    tradedValueCr: 728.5,
    upperCircuit: 538.1,
    lowerCircuit: 440.2,
    about:
      "ITC Limited is an Indian conglomerate company headquartered in Kolkata. It has a diversified presence across industries such as FMCG (Cigarettes, Branded Packaged Foods like Aashirvaad, Sunfeast, Bingo!, Yippee!, Classmate), Hotels (ITC Hotels), Paperboards & Packaging, Agri Business, and Information Technology.",
  },
  RELIANCE: {
    sector: "Energy & Conglomerate",
    industry: "Oil to Chemicals, Retail & Digital Services (Jio)",
    ceo: "Mukesh D. Ambani (Chairman & MD)",
    founded: "1973",
    headquarters: "Mumbai, Maharashtra",
    marketCapCr: 2015000,
    peRatio: 26.8,
    pbRatio: 2.45,
    industryPe: 22.4,
    debtToEquity: 0.38,
    roe: 10.2,
    eps: 111.2,
    divYield: 0.35,
    bookValue: 1215.0,
    faceValue: 10.0,
    todayLow: 2954.0,
    todayHigh: 2995.0,
    fiftyTwoWeekLow: 2220.0,
    fiftyTwoWeekHigh: 3217.0,
    openPrice: 2960.0,
    prevClose: 2955.6,
    volumeShares: "94.2 Lakh",
    tradedValueCr: 2810.0,
    upperCircuit: 3250.0,
    lowerCircuit: 2660.0,
    about:
      "Reliance Industries Limited (RIL) is a Fortune 500 company and the largest private sector corporation in India. Its businesses encompass energy, petrochemicals, natural gas, retail, telecommunications (Jio), and media.",
  },
  TCS: {
    sector: "Information Technology",
    industry: "IT Services & Consulting",
    ceo: "K. Krithivasan (MD & CEO)",
    founded: "1968",
    headquarters: "Mumbai, Maharashtra",
    marketCapCr: 1524000,
    peRatio: 31.2,
    pbRatio: 14.8,
    industryPe: 29.5,
    debtToEquity: 0.0,
    roe: 48.5,
    eps: 135.0,
    divYield: 1.85,
    bookValue: 284.5,
    faceValue: 1.0,
    todayLow: 4180.0,
    todayHigh: 4245.0,
    fiftyTwoWeekLow: 3315.0,
    fiftyTwoWeekHigh: 4585.0,
    openPrice: 4230.0,
    prevClose: 4245.0,
    volumeShares: "32.5 Lakh",
    tradedValueCr: 1370.0,
    upperCircuit: 4669.0,
    lowerCircuit: 3820.0,
    about:
      "Tata Consultancy Services is an Indian multinational information technology services and consulting company headquartered in Mumbai. It is a part of the Tata Group and operates in 150 locations across 50 countries.",
  },
  HDFCBANK: {
    sector: "Financial Services",
    industry: "Private Commercial Banking",
    ceo: "Sashidhar Jagdishan (MD & CEO)",
    founded: "1994",
    headquarters: "Mumbai, Maharashtra",
    marketCapCr: 1250000,
    peRatio: 18.9,
    pbRatio: 2.75,
    industryPe: 16.5,
    debtToEquity: 0.85,
    roe: 16.8,
    eps: 87.0,
    divYield: 1.2,
    bookValue: 598.0,
    faceValue: 1.0,
    todayLow: 1630.0,
    todayHigh: 1655.0,
    fiftyTwoWeekLow: 1363.0,
    fiftyTwoWeekHigh: 1794.0,
    openPrice: 1632.0,
    prevClose: 1626.4,
    volumeShares: "2.14 Cr",
    tradedValueCr: 3510.0,
    upperCircuit: 1789.0,
    lowerCircuit: 1463.0,
    about:
      "HDFC Bank Limited is an Indian banking and financial services company headquartered in Mumbai. It is India's largest private sector bank by assets and the world's fourth-largest bank by market capitalization.",
  },
};

// ---------------------------------------------------------------------------
// STOCK SPECIFIC NEWS & CATALYSTS DATA
// ---------------------------------------------------------------------------
export interface StockNewsItem {
  title: string;
  source: string;
  timeAgo: string;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  summary: string;
}

export function getStockNews(symbol: string, name: string): StockNewsItem[] {
  const stockSpecificNews: Record<string, StockNewsItem[]> = {
    SUPREMEIND: [
      {
        title: "Supreme Industries posts 18% YoY volume surge driven by piping and packaging demand",
        source: "CNBC-TV18",
        timeAgo: "22m ago",
        sentiment: "POSITIVE",
        summary:
          "Robust order flow from agricultural and infrastructure segments drives EBITDA margin expansion to 15.4%.",
      },
      {
        title: "Capex expansion on track: New production lines commissioned in Southern India facility",
        source: "Economic Times",
        timeAgo: "1h ago",
        sentiment: "POSITIVE",
        summary:
          "Management reaffirms FY26 revenue guidance with planned ₹850 Cr capital outlay funded via internal accruals.",
      },
      {
        title: "Raw material PVC resin prices soften globally, offering quarterly gross margin cushion",
        source: "LiveMint",
        timeAgo: "3h ago",
        sentiment: "POSITIVE",
        summary:
          "Import parity pricing trends remain favorable amidst easing freight costs from East Asian suppliers.",
      },
    ],
    RELIANCE: [
      {
        title: "Jio Platforms subscriber additions accelerate with 5G rollout in tier-2 and tier-3 towns",
        source: "LiveMint",
        timeAgo: "15m ago",
        sentiment: "POSITIVE",
        summary:
          "ARPU reaches ₹182 with rising digital entertainment and cloud storage bundle adoption.",
      },
      {
        title: "Retail arm expands fast-fashion and grocery network with 140 new store openings",
        source: "Economic Times",
        timeAgo: "2h ago",
        sentiment: "POSITIVE",
        summary:
          "Omni-channel integration drives 22% higher basket sizes across metropolitan clusters.",
      },
      {
        title: "Singapore refining margins fluctuate; upstream gas realization stays strong at $9.8/mmbtu",
        source: "Reuters",
        timeAgo: "4h ago",
        sentiment: "NEUTRAL",
        summary:
          "KG-D6 deepwater production reaches peak plateau sustaining cash flow stability.",
      },
    ],
    TCS: [
      {
        title: "TCS bags $1.2B mega multi-year digital transformation deal with European banking consortium",
        source: "Moneycontrol",
        timeAgo: "30m ago",
        sentiment: "POSITIVE",
        summary:
          "Deal encompasses core banking migration to hybrid cloud and sovereign AI implementation.",
      },
      {
        title: "Attrition stabilizes at 12.1%; management accelerates campus onboarding for FY26",
        source: "CNBC-TV18",
        timeAgo: "2h ago",
        sentiment: "POSITIVE",
        summary:
          "Employee utilization climbs to 85.2% as discretionary tech spending shows signs of bottoming out.",
      },
      {
        title: "Q3 deal pipeline remains resilient despite cautious enterprise tech budgets in US retail",
        source: "LiveMint",
        timeAgo: "5h ago",
        sentiment: "NEUTRAL",
        summary:
          "Cross-currency headwinds slightly moderate constant currency revenue growth expectations.",
      },
    ],
    HDFCBANK: [
      {
        title: "HDFC Bank advances deposit accretion pace; Credit-to-Deposit ratio improves to 99%",
        source: "Economic Times",
        timeAgo: "18m ago",
        sentiment: "POSITIVE",
        summary:
          "Branch expansion blitz of 300+ new branches helps mobilize granular retail CASA balances.",
      },
      {
        title: "Net Interest Margin (NIM) stabilizes at 3.65% with disciplined wholesale loan repricing",
        source: "Bloomberg",
        timeAgo: "2h ago",
        sentiment: "POSITIVE",
        summary:
          "Asset quality remains pristine with Gross NPA holding steady below 1.35%.",
      },
      {
        title: "FII institutional ownership rises 45 bps following MSCI index weight rebalancing",
        source: "LiveMint",
        timeAgo: "6h ago",
        sentiment: "POSITIVE",
        summary:
          "Passive foreign capital inflows provide firm liquidity support at key pivot levels.",
      },
    ],
    ITC: [
      {
        title: "ITC Hotels demerger process enters final phase following NCLT shareholder clearance",
        source: "CNBC-TV18",
        timeAgo: "45m ago",
        sentiment: "POSITIVE",
        summary:
          "Direct listing expected next quarter with 10:1 ratio unlocking significant enterprise value.",
      },
      {
        title: "Non-cigarette FMCG brands (Aashirvaad, Sunfeast) clock double-digit revenue expansion",
        source: "Economic Times",
        timeAgo: "3h ago",
        sentiment: "POSITIVE",
        summary:
          "Export markets and modern retail tie-ups boost operating margins to record 11.2%.",
      },
      {
        title: "Agri-business unit secures major global wheat and spice export contracts",
        source: "LiveMint",
        timeAgo: "5h ago",
        sentiment: "POSITIVE",
        summary:
          "Integrated supply chain and e-Choupal digital procurement yield competitive price advantages.",
      },
    ],
  };

  if (stockSpecificNews[symbol]) {
    return stockSpecificNews[symbol];
  }

  return [
    {
      title: `${name} trading volume surges on institutional block orders and sector tailwinds`,
      source: "LiveMint",
      timeAgo: "28m ago",
      sentiment: "POSITIVE",
      summary: `Substantial delivery percentage recorded on NSE as market participants evaluate forward earnings growth and sectoral momentum.`,
    },
    {
      title: `Exchange filing: ${symbol} schedules board meeting for quarterly performance review`,
      source: "NSE Disclosures",
      timeAgo: "2h ago",
      sentiment: "NEUTRAL",
      summary: `Management to deliberate upon quarterly financial results, dividend considerations, and future capital allocation strategy.`,
    },
    {
      title: `Sectoral update: Industry analysts maintain constructive outlook for ${symbol} peers`,
      source: "Economic Times",
      timeAgo: "4h ago",
      sentiment: "POSITIVE",
      summary: `Macro-economic catalysts and robust domestic demand bolster revenue visibility across mid and large-cap market leaders.`,
    },
  ];
}

export default function StockDetailsPage({ initialSymbol = "ITC" }: StockDetailsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Resolve active symbol from URL query or prop
  const symbolParam = (searchParams.get("symbol") || initialSymbol || "ITC").toUpperCase();

  const [activeTimeframe, setActiveTimeframe] = useState<"1D" | "1W" | "1M" | "1Y" | "5Y" | "ALL">("1D");
  const [chartType, setChartType] = useState<"area" | "candle">("area");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Right column tab: AI Mentor vs News (Requested by user: "add this for every stocks")
  const [rightPanelTab, setRightPanelTab] = useState<"mentor" | "news">("mentor");

  // Quick Order Modal state
  const [orderModal, setOrderModal] = useState<{
    isOpen: boolean;
    action: "BUY" | "SELL";
  }>({
    isOpen: false,
    action: "BUY",
  });
  const [orderQty, setOrderQty] = useState(10);
  const [orderProduct, setOrderProduct] = useState<"CNC" | "MIS">("CNC");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [orderFeedback, setOrderFeedback] = useState<string | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  const quotes = useMarketStore((s) => s.quotes);
  const token = useMemo(() => getAuthToken(), []);

  // ---------------------------------------------------------------------------
  // REAL DATA: Fetch wallet balance
  // ---------------------------------------------------------------------------
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", token],
    queryFn: () => apiFetch<Wallet>("/wallet"),
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
    placeholderData: {
      uuid: "",
      cash_balance_paise: 100000000,
      available_balance_paise: 100000000,
      blocked_paise: 0,
    },
  });

  const availableBalancePaise = wallet?.available_balance_paise ?? 100000000;

  // ---------------------------------------------------------------------------
  // REAL DATA: Fetch candle history from backend
  // ---------------------------------------------------------------------------
  const candleLimit = activeTimeframe === "1D" ? 50 : activeTimeframe === "1W" ? 100 : activeTimeframe === "1M" ? 200 : 300;
  const { data: rawCandles } = useQuery<Candle[]>({
    queryKey: ["candle-history", symbolParam, candleLimit],
    queryFn: () => publicFetch<Candle[]>(`/market/quotes/${encodeURIComponent(symbolParam)}/history?limit=${candleLimit}`),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // ---------------------------------------------------------------------------
  // REAL DATA: Fetch API quote for full details (circuits, change, source)
  // ---------------------------------------------------------------------------
  interface ApiQuoteResponse {
    symbol: string;
    price_paise: number;
    change_paise: number;
    change_percent: number;
    lower_circuit_paise: number;
    upper_circuit_paise: number;
    source: string;
    updated_at: string;
  }
  const { data: apiQuote } = useQuery<ApiQuoteResponse>({
    queryKey: ["api-quote", symbolParam],
    queryFn: () => publicFetch<ApiQuoteResponse>(`/market/quotes/${encodeURIComponent(symbolParam)}`),
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // ---------------------------------------------------------------------------
  // REAL DATA: Watchlist from backend API
  // ---------------------------------------------------------------------------
  interface WatchlistApiItem {
    id?: number;
    user_uuid?: string;
    symbol: string;
  }
  const { data: watchlistItems } = useQuery<WatchlistApiItem[]>({
    queryKey: ["watchlist", token],
    queryFn: () => apiFetch<WatchlistApiItem[]>("/watchlist"),
    enabled: !!token,
  });

  // Find stock in catalog and merge with authentic live Angel One quote
  const stock = useMemo(() => {
    const cleanSym = symbolParam.replace("-EQ", "").toUpperCase();
    const found = MASTER_STOCKS_CATALOG.find(
      (s) => s.symbol.toUpperCase() === cleanSym || s.symbol.toUpperCase() === symbolParam.toUpperCase()
    );
    const base = found || {
      symbol: cleanSym,
      exchange: "NSE",
      name: `${cleanSym} Limited`,
      price: 492.1,
      change: 2.9,
      changePercent: 0.59,
      isPositive: true,
    };

    // Try WebSocket live quote first, fall back to API quote
    const q = quotes[cleanSym] || (cleanSym === "ZOMATO" ? quotes["ETERNAL"] : undefined);
    const liveQuote = q || (apiQuote ? { price_paise: apiQuote.price_paise, change_paise: apiQuote.change_paise, change_percent: apiQuote.change_percent } : undefined);
    if (!liveQuote || !liveQuote.price_paise) return base;

    const price = liveQuote.price_paise / 100;
    const change = liveQuote.change_paise !== undefined ? liveQuote.change_paise / 100 : +(price - base.price).toFixed(2);
    const changePercent = liveQuote.change_percent !== undefined ? liveQuote.change_percent : +((change / (price - change || 1)) * 100).toFixed(2);
    const isPositive = changePercent >= 0;

    return {
      ...base,
      price,
      change,
      changePercent: +changePercent.toFixed(2),
      isPositive,
    };
  }, [symbolParam, quotes, apiQuote]);

  // Fundamentals & Profile — merge with live API quote data for circuits
  const profile: StockFundamentals = useMemo(() => {
    const base = STOCK_PROFILES[stock.symbol] || {};
    const price = stock.price;
    const lc = apiQuote?.lower_circuit_paise ? apiQuote.lower_circuit_paise / 100 : undefined;
    const uc = apiQuote?.upper_circuit_paise ? apiQuote.upper_circuit_paise / 100 : undefined;

    // Use live quote for today's open/high/low if available
    const wsQ = quotes[stock.symbol];
    const liveOpen = wsQ?.open_paise ? wsQ.open_paise / 100 : undefined;
    const liveHigh = wsQ?.high_paise ? wsQ.high_paise / 100 : undefined;
    const liveLow = wsQ?.low_paise ? wsQ.low_paise / 100 : undefined;

    return {
      marketCapCr: base.marketCapCr ?? +(price * 1250).toFixed(0),
      peRatio: base.peRatio ?? 27.5,
      pbRatio: base.pbRatio ?? 6.4,
      industryPe: base.industryPe ?? 31.0,
      debtToEquity: base.debtToEquity ?? 0.05,
      roe: base.roe ?? 22.5,
      eps: base.eps ?? +(price / 28).toFixed(2),
      divYield: base.divYield ?? 2.45,
      bookValue: base.bookValue ?? +(price / 6.4).toFixed(2),
      faceValue: base.faceValue ?? 1.0,
      todayLow: liveLow ?? base.todayLow ?? +(price * 0.992).toFixed(2),
      todayHigh: liveHigh ?? base.todayHigh ?? +(price * 1.008).toFixed(2),
      fiftyTwoWeekLow: base.fiftyTwoWeekLow ?? +(price * 0.78).toFixed(2),
      fiftyTwoWeekHigh: base.fiftyTwoWeekHigh ?? +(price * 1.15).toFixed(2),
      openPrice: liveOpen ?? base.openPrice ?? +(price * 0.996).toFixed(2),
      prevClose: base.prevClose ?? +(price - stock.change).toFixed(2),
      volumeShares: base.volumeShares ?? "84.2 Lakh",
      tradedValueCr: base.tradedValueCr ?? 412.0,
      upperCircuit: uc ?? base.upperCircuit ?? +(price * 1.1).toFixed(2),
      lowerCircuit: lc ?? base.lowerCircuit ?? +(price * 0.9).toFixed(2),
      sector: base.sector ?? "Core Equities & Industry",
      industry: base.industry ?? "Diversified Operations",
      ceo: base.ceo ?? "Executive Leadership",
      founded: base.founded ?? "1985",
      headquarters: base.headquarters ?? "India",
      about:
        base.about ??
        `${stock.name} is a leading publicly traded corporation listed on NSE and BSE, catering to millions of institutional and retail market participants.`,
    };
  }, [stock, apiQuote, quotes]);

  // ---------------------------------------------------------------------------
  // CHART: Use real candle data when available, fall back to synthetic
  // ---------------------------------------------------------------------------
  const candles: Candle[] = useMemo(() => {
    if (rawCandles && rawCandles.length > 0) return rawCandles;
    // Synthetic fallback — generate fake candles from stock price
    const base = stock.price;
    const numPoints = candleLimit;
    const fakeCandles: Candle[] = [];
    let cur = base - stock.change;
    const now = Date.now();
    for (let i = 0; i < numPoints; i++) {
      const noise = (Math.sin(i * 0.6) + Math.cos(i * 0.3) * 0.5) * (base * 0.003);
      const trend = (i / numPoints) * stock.change;
      const close = +(base - stock.change + trend + noise).toFixed(2);
      const open = i === 0 ? base - stock.change : fakeCandles[i - 1].close_paise;
      const high = Math.round(Math.max(open, close * 100) + Math.abs(noise) * 40);
      const low = Math.round(Math.min(open, close * 100) - Math.abs(noise) * 40);
      fakeCandles.push({
        timestamp: Math.floor((now - (numPoints - i) * 60000) / 1000),
        open_paise: Math.round(open),
        high_paise: high,
        low_paise: low,
        close_paise: Math.round(close * 100),
        volume: Math.floor(1000 + Math.random() * 5000),
      });
    }
    return fakeCandles;
  }, [rawCandles, stock, candleLimit]);

  const chartPoints = useMemo(() => {
    if (candles.length === 0) return [stock.price];
    return candles.map((c) => c.close_paise / 100);
  }, [candles, stock.price]);

  const minChart = Math.min(...chartPoints);
  const maxChart = Math.max(...chartPoints);
  const chartRange = maxChart - minChart || 1;

  // SVG coordinates generator for area chart
  const svgPath = useMemo(() => {
    const width = 800;
    const height = 260;
    const padding = 20;

    const coords = chartPoints.map((val, idx) => {
      const x = (idx / (chartPoints.length - 1 || 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((val - minChart) / chartRange) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const linePath = `M ${coords.join(" L ")}`;
    const areaPath = `M ${coords[0].split(",")[0]},${height - padding} L ${coords.join(" L ")} L ${
      coords[coords.length - 1].split(",")[0]
    },${height - padding} Z`;

    return { linePath, areaPath };
  }, [chartPoints, minChart, chartRange]);

  // ---------------------------------------------------------------------------
  // Watchlist state — prefer backend API, fall back to localStorage
  // ---------------------------------------------------------------------------
  const [isInWatchlist, setIsInWatchlist] = useState(false);

  useEffect(() => {
    if (token && watchlistItems) {
      setIsInWatchlist(watchlistItems.some((w) => w.symbol === stock.symbol));
    } else if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("stock_sim_watchlists_v2");
        if (saved) {
          const parsed = JSON.parse(saved);
          const list = parsed[1] || [];
          setIsInWatchlist(list.some((s: WatchlistItem) => s.symbol === stock.symbol));
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [stock.symbol, watchlistItems, token]);

  const handleToggleWatchlist = useCallback(async () => {
    if (token) {
      // Use backend API
      try {
        if (isInWatchlist) {
          await apiFetch(`/watchlist/${stock.symbol}`, { method: "DELETE" });
          setIsInWatchlist(false);
          setToastMsg(`Removed ${stock.symbol} from Watchlist`);
        } else {
          await apiFetch("/watchlist", {
            method: "POST",
            body: JSON.stringify({ symbol: stock.symbol }),
          });
          setIsInWatchlist(true);
          setToastMsg(`✓ Added ${stock.symbol} to Watchlist`);
        }
        queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      } catch (err) {
        setToastMsg(`Watchlist error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    } else {
      // Fallback: localStorage
      try {
        const saved = localStorage.getItem("stock_sim_watchlists_v2");
        const parsed = saved ? JSON.parse(saved) : { 1: [] };
        const list: WatchlistItem[] = parsed[1] || [];

        let updatedList: WatchlistItem[];
        if (isInWatchlist) {
          updatedList = list.filter((s) => s.symbol !== stock.symbol);
          setIsInWatchlist(false);
          setToastMsg(`Removed ${stock.symbol} from Watchlist`);
        } else {
          updatedList = [stock, ...list];
          setIsInWatchlist(true);
          setToastMsg(`✓ Added ${stock.symbol} to Watchlist 1`);
        }

        parsed[1] = updatedList;
        localStorage.setItem("stock_sim_watchlists_v2", JSON.stringify(parsed));
      } catch (e) {
        console.error(e);
      }
    }
    setTimeout(() => setToastMsg(null), 2500);
  }, [token, isInWatchlist, stock, queryClient]);

  // ---------------------------------------------------------------------------
  // REAL ORDER EXECUTION: POST /api/v1/orders + auto-execute
  // ---------------------------------------------------------------------------
  const handleExecuteOrder = useCallback(async () => {
    if (!token) {
      setOrderFeedback("⚠ Please log in to place orders");
      setTimeout(() => setOrderFeedback(null), 2500);
      return;
    }

    setOrderSubmitting(true);
    setOrderFeedback(null);
    try {
      // Map frontend product types to backend enum
      const productMap: Record<string, string> = { CNC: "DELIVERY", MIS: "INTRADAY" };
      const isMarket = orderType === "MARKET";
      const effectiveLimitPrice = limitPrice > 0 ? limitPrice : stock.price;
      const orderPayload = {
        symbol: stock.symbol,
        side: orderModal.action,
        type: orderType,
        product: productMap[orderProduct] || "DELIVERY",
        quantity: orderQty,
        price_paise: isMarket ? 0 : Math.round(effectiveLimitPrice * 100),
      };

      // Step 1: Create order (backend automatically executes MARKET orders upon creation)
      const created = await apiFetch<{
        uuid: string;
        status: string;
        executed_price_paise?: number;
      }>("/orders", {
        method: "POST",
        body: JSON.stringify(orderPayload),
      });

      // Step 2: Only call execute if the market order is still pending/unexecuted
      if (isMarket && created?.uuid && created.status !== "EXECUTED") {
        await apiFetch(`/orders/${created.uuid}/execute`, { method: "POST" });
      }

      const fillPrice = created?.executed_price_paise
        ? (created.executed_price_paise / 100).toFixed(2)
        : stock.price.toFixed(2);

      setOrderFeedback(
        isMarket
          ? `✓ ${orderModal.action} ${orderQty} ${stock.symbol} executed @ ₹${fillPrice}!`
          : `✓ ${orderModal.action} Limit order for ${orderQty} ${stock.symbol} @ ₹${effectiveLimitPrice.toFixed(2)} placed!`
      );

      // Refetch wallet + portfolio
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });

      setTimeout(() => {
        setOrderModal({ isOpen: false, action: "BUY" });
        setOrderFeedback(null);
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Order failed";
      setOrderFeedback(`✗ ${msg}`);
      setTimeout(() => setOrderFeedback(null), 4000);
    } finally {
      setOrderSubmitting(false);
    }
  }, [token, stock, orderModal.action, orderProduct, orderType, limitPrice, orderQty, queryClient]);

  // ---------------------------------------------------------------------------
  // Dynamic Market Depth — generated from live price with realistic spread
  // ---------------------------------------------------------------------------
  const marketDepthRows = useMemo(() => {
    const p = stock.price;
    const tick = p > 1000 ? 0.05 : p > 100 ? 0.05 : 0.01;
    const baseQty = p > 5000 ? 200 : p > 1000 ? 800 : p > 100 ? 1500 : 5000;
    // Use a pseudo-random seed from price to get consistent-looking variation
    const seed = Math.floor(p * 100) % 1000;
    return Array.from({ length: 5 }, (_, i) => ({
      bidP: +(p - tick * (i + 1)).toFixed(2),
      bidQ: baseQty + ((seed * (i + 1) * 7) % (baseQty * 3)),
      askP: +(p + tick * i).toFixed(2),
      askQ: baseQty + ((seed * (i + 2) * 11) % (baseQty * 3)),
    }));
  }, [stock.price]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white transition-colors duration-150">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-2xl flex items-center gap-2 border border-slate-700 animate-slide-up">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Unified 2-Tier Navbar */}
      <Navbar />

      {/* Stock Subheader Breadcrumb Strip */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm px-4 sm:px-6 py-2.5 transition-colors">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <Link
              href="/"
              className="hover:text-cyan-600 dark:hover:text-cyan-400 flex items-center gap-1 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
            <Link
              href="/stocks"
              className="hover:text-cyan-600 dark:hover:text-cyan-400 font-medium transition-colors"
            >
              Stocks
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
            <span className="font-bold text-slate-900 dark:text-slate-100">{stock.symbol}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              {stock.exchange || "NSE"}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <span>Trading Desk: CASH EQUITIES</span>
            <span className="border-l border-slate-200 dark:border-slate-800 pl-3 text-emerald-600 dark:text-emerald-400 font-semibold">
              ● Live Feed
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN STOCK OVERVIEW WORKSPACE                                         */}
      {/* ========================================================================= */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-[#64748b]">
          <Link href="/" className="hover:text-cyan-600 transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <Link href="/watchlist" className="hover:text-cyan-600 transition-colors">
            Stocks
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 dark:text-slate-100 font-semibold">{stock.name}</span>
        </nav>

        {/* Hero Stock Header Card */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: Stock Details & Badges */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-500 text-white font-extrabold text-lg flex items-center justify-center shadow-md shadow-cyan-600/10 shrink-0">
              {(stock?.symbol || "---").slice(0, 3)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  {stock.name}
                </h1>
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 px-2 py-0.5 rounded uppercase">
                  {stock.exchange || "NSE"}
                </span>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/50 px-2 py-0.5 rounded uppercase">
                  BSE
                </span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded">
                  F&O Active
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
                <span>{profile.sector}</span>
                <span>•</span>
                <span>{profile.industry}</span>
              </p>
            </div>
          </div>

          {/* Right: Price & Main Action Buttons */}
          <div className="flex items-end md:items-center gap-6 justify-between md:justify-end">
            <div className="text-right">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-tabular tracking-tight">
                ₹{stock.price.toFixed(2)}
              </div>
              <div
                className={`text-xs sm:text-sm font-bold font-tabular flex items-center justify-end gap-1 ${
                  stock.isPositive ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {stock.isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                <span>
                  {stock.isPositive ? "+" : ""}
                  {stock.change.toFixed(2)} ({stock.changePercent.toFixed(2)}%)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal ml-0.5">1D</span>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 px-1.5 py-0.5 rounded flex items-center gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Angel One
                </span>
              </div>
            </div>

            {/* Quick Watchlist + Trade Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleWatchlist}
                className={`p-2.5 rounded-xl border transition-all text-xs font-bold flex items-center gap-1.5 ${
                  isInWatchlist
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-white border-[#e2e8f0] text-slate-600 hover:bg-slate-50"
                }`}
                title={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              >
                {isInWatchlist ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                <span className="hidden sm:inline">{isInWatchlist ? "Watchlisted" : "Watchlist"}</span>
              </button>

              <button
                onClick={() => setOrderModal({ isOpen: true, action: "BUY" })}
                className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-sm shadow-md shadow-cyan-600/20 transition-all hover:scale-[1.02]"
              >
                BUY
              </button>

              <button
                onClick={() => setOrderModal({ isOpen: true, action: "SELL" })}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-sm shadow-md shadow-rose-600/20 transition-all hover:scale-[1.02]"
              >
                SELL
              </button>
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Chart & Performance & Fundamentals */}
          <div className="lg:col-span-2 space-y-6">
            {/* Interactive Chart Container */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              {/* Chart Controls & Timeframe Pills */}
              <div className="flex items-center justify-between gap-4 flex-wrap pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    {(["1D", "1W", "1M", "1Y", "5Y", "ALL"] as const).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setActiveTimeframe(tf)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activeTimeframe === tf
                            ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-2xs"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>

                  {/* Area / Candlestick Toggle */}
                  <div className="flex items-center gap-0.5 bg-slate-50 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setChartType("area")}
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${
                        chartType === "area"
                          ? "bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-2xs"
                          : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                      title="Area Chart"
                    >
                      <AreaChart className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setChartType("candle")}
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${
                        chartType === "candle"
                          ? "bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-2xs"
                          : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                      title="Candlestick Chart"
                    >
                      <CandlestickChart className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hidden sm:block">
                    Range: <span className="font-tabular font-bold text-slate-800 dark:text-slate-200">₹{minChart.toFixed(2)}</span> -{" "}
                    <span className="font-tabular font-bold text-slate-800 dark:text-slate-200">₹{maxChart.toFixed(2)}</span>
                  </div>
                  {rawCandles && rawCandles.length > 0 && (
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50">
                      LIVE DATA
                    </span>
                  )}
                </div>
              </div>

              {/* Chart Rendering */}
              <div className="relative h-64 w-full">
                <svg viewBox="0 0 800 260" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="stockAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  <line x1="20" y1="40" x2="780" y2="40" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                  <line x1="20" y1="120" x2="780" y2="120" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                  <line x1="20" y1="200" x2="780" y2="200" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />

                  {chartType === "area" ? (
                    <>
                      {/* Gradient Area Fill */}
                      <path d={svgPath.areaPath} fill="url(#stockAreaGradient)" />
                      {/* Top Curve Line */}
                      <path
                        d={svgPath.linePath}
                        fill="none"
                        stroke="#0891b2"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  ) : (
                    /* Candlestick Chart */
                    <>
                      {candles.map((c, idx) => {
                        const width = 800;
                        const height = 260;
                        const padding = 20;
                        const len = candles.length;
                        const candleWidth = Math.max(2, ((width - padding * 2) / len) * 0.6);
                        const gap = (width - padding * 2) / len;
                        const x = padding + idx * gap + gap / 2;

                        const allPrices = candles.flatMap((cc) => [cc.high_paise, cc.low_paise]);
                        const minP = Math.min(...allPrices);
                        const maxP = Math.max(...allPrices);
                        const range = maxP - minP || 1;

                        const yScale = (paise: number) =>
                          height - padding - ((paise - minP) / range) * (height - padding * 2);

                        const open = c.open_paise;
                        const close = c.close_paise;
                        const high = c.high_paise;
                        const low = c.low_paise;
                        const isBullish = close >= open;
                        const color = isBullish ? "#10b981" : "#ef4444";

                        const bodyTop = yScale(Math.max(open, close));
                        const bodyBottom = yScale(Math.min(open, close));
                        const bodyHeight = Math.max(1, bodyBottom - bodyTop);

                        return (
                          <g key={idx}>
                            {/* Wick (high-low line) */}
                            <line
                              x1={x}
                              y1={yScale(high)}
                              x2={x}
                              y2={yScale(low)}
                              stroke={color}
                              strokeWidth="1"
                            />
                            {/* Body */}
                            <rect
                              x={x - candleWidth / 2}
                              y={bodyTop}
                              width={candleWidth}
                              height={bodyHeight}
                              fill={isBullish ? color : color}
                              stroke={color}
                              strokeWidth="0.5"
                              rx="0.5"
                            />
                          </g>
                        );
                      })}
                    </>
                  )}
                </svg>

                {/* Live Current Price Badge Overlay */}
                <div className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/50 text-cyan-700 dark:text-cyan-300 text-xs font-bold font-tabular shadow-2xs">
                  CMP: ₹{stock.price.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Performance Sliders & Trading Metrics (Groww Style) */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-6">
              <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                Price Performance & Ranges
              </h2>

              {/* Today's Low / High Range Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Today&apos;s Low <strong className="text-slate-900 dark:text-slate-100 font-tabular">₹{profile.todayLow.toFixed(2)}</strong>
                  </span>
                  <span>
                    Today&apos;s High <strong className="text-slate-900 dark:text-slate-100 font-tabular">₹{profile.todayHigh.toFixed(2)}</strong>
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-500 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          10,
                          ((stock.price - profile.todayLow) / (profile.todayHigh - profile.todayLow || 1)) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* 52-Week Low / High Range Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    52W Low <strong className="text-slate-900 dark:text-slate-100 font-tabular">₹{profile.fiftyTwoWeekLow.toFixed(2)}</strong>
                  </span>
                  <span>
                    52W High <strong className="text-slate-900 dark:text-slate-100 font-tabular">₹{profile.fiftyTwoWeekHigh.toFixed(2)}</strong>
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          10,
                          ((stock.price - profile.fiftyTwoWeekLow) /
                            (profile.fiftyTwoWeekHigh - profile.fiftyTwoWeekLow || 1)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Key Trading Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Open</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-tabular mt-0.5">₹{profile.openPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Prev. Close</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-tabular mt-0.5">₹{profile.prevClose.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Volume</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-tabular mt-0.5">{profile.volumeShares}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Total Traded Value</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-tabular mt-0.5">₹{profile.tradedValueCr} Cr</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Upper Circuit</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 font-tabular mt-0.5">₹{profile.upperCircuit.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Lower Circuit</div>
                  <div className="font-bold text-rose-600 dark:text-rose-400 font-tabular mt-0.5">₹{profile.lowerCircuit.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Face Value</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-tabular mt-0.5">₹{profile.faceValue.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Settlement</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">T+1 Rolling</div>
                </div>
              </div>
            </div>

            {/* Fundamentals & Key Ratios (Groww Style) */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                Key Fundamentals & Ratios
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-xs">
                <div className="border-b border-slate-100 dark:border-slate-800/80 pb-2">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Market Cap</div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-tabular mt-0.5">
                    ₹{profile.marketCapCr.toLocaleString("en-IN")} Cr
                  </div>
                </div>

                <div className="border-b border-slate-100 dark:border-slate-800/80 pb-2">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">P/E Ratio (TTM)</div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-tabular mt-0.5">{profile.peRatio}</div>
                </div>

                <div className="border-b border-slate-100 dark:border-slate-800/80 pb-2">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">P/B Ratio</div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-tabular mt-0.5">{profile.pbRatio}</div>
                </div>

                <div className="border-b border-slate-100 dark:border-slate-800/80 pb-2">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Industry P/E</div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-tabular mt-0.5">{profile.industryPe}</div>
                </div>

                <div className="border-b border-slate-100 dark:border-slate-800/80 pb-2">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Debt to Equity</div>
                  <div className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 font-tabular mt-0.5">
                    {profile.debtToEquity} (Virtually Debt-Free)
                  </div>
                </div>

                <div className="border-b border-slate-100 dark:border-slate-800/80 pb-2">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">ROE</div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-tabular mt-0.5">{profile.roe}%</div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">EPS (TTM)</div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-tabular mt-0.5">₹{profile.eps}</div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Dividend Yield</div>
                  <div className="font-extrabold text-sm text-cyan-600 dark:text-cyan-400 font-tabular mt-0.5">{profile.divYield}%</div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Book Value</div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-tabular mt-0.5">₹{profile.bookValue}</div>
                </div>
              </div>
            </div>

            {/* About the Company */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                About {stock.name}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{profile.about}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Managing Director & CEO</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">{profile.ceo}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Founded</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">{profile.founded}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Headquarters</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">{profile.headquarters}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Listing</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">NSE, BSE (ISIN Active)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Market Depth (Level 2 Order Book) & Quick Order Box */}
          <div className="space-y-6">
            {/* Market Depth Level 2 Book */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Market Depth (L2 Book)</span>
                </h3>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50">
                  Live Feed
                </span>
              </div>

              {/* Bid vs Ask 5-Row Table */}
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between">
                    <span>BID PRICE</span>
                    <span>ORDERS</span>
                  </div>
                  <div className="flex justify-between text-right">
                    <span>ORDERS</span>
                    <span>ASK PRICE</span>
                  </div>
                </div>

                {marketDepthRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2 font-tabular text-[11px]">
                    <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100/50 dark:border-emerald-900/30 px-2 py-1 rounded">
                      <span className="font-bold">₹{row.bidP.toFixed(2)}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10px]">{row.bidQ.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between items-center text-rose-700 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/40 border border-rose-100/50 dark:border-rose-900/30 px-2 py-1 rounded text-right">
                      <span className="text-slate-500 dark:text-slate-400 text-[10px]">{row.askQ.toLocaleString("en-IN")}</span>
                      <span className="font-bold">₹{row.askP.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fast Order Execution Box */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                Fast Order Placement
              </h3>

              {/* Buy / Sell Tabs */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setOrderModal((prev) => ({ ...prev, action: "BUY" }))}
                  className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    orderModal.action === "BUY"
                      ? "bg-cyan-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  BUY
                </button>
                <button
                  onClick={() => setOrderModal((prev) => ({ ...prev, action: "SELL" }))}
                  className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    orderModal.action === "SELL"
                      ? "bg-rose-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  SELL
                </button>
              </div>

              {/* Order Type (Market vs Limit) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">ORDER TYPE</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => setOrderType("MARKET")}
                    className={`py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                      orderType === "MARKET"
                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    Market
                  </button>
                  <button
                    onClick={() => {
                      setOrderType("LIMIT");
                      if (!limitPrice) setLimitPrice(stock.price);
                    }}
                    className={`py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                      orderType === "LIMIT"
                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    Limit
                  </button>
                </div>
              </div>

              {/* Limit Price Input if Limit chosen */}
              {orderType === "LIMIT" && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">LIMIT PRICE (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={limitPrice || stock.price}
                    onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-tabular text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">QUANTITY (SHARES)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={orderQty}
                    onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-tabular text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex gap-1">
                    {[10, 50, 100].map((q) => (
                      <button
                        key={q}
                        onClick={() => setOrderQty(q)}
                        className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                      >
                        +{q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Product Type (CNC vs MIS) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">PRODUCT</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => setOrderProduct("CNC")}
                    className={`py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                      orderProduct === "CNC"
                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    Delivery (CNC)
                  </button>
                  <button
                    onClick={() => setOrderProduct("MIS")}
                    className={`py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                      orderProduct === "MIS"
                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    Intraday (MIS 5x)
                  </button>
                </div>
              </div>

              {/* Margin Calculation */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Approx. Margin</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 font-tabular">
                    ₹{((orderProduct === "MIS" ? (orderType === "LIMIT" && limitPrice > 0 ? limitPrice : stock.price) * 0.2 : (orderType === "LIMIT" && limitPrice > 0 ? limitPrice : stock.price)) * orderQty).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <span>Available Funds</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-tabular">
                    ₹{(availableBalancePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleExecuteOrder}
                disabled={orderSubmitting}
                className={`w-full py-3 rounded-xl text-white font-extrabold text-sm shadow-md transition-all cursor-pointer ${
                  orderSubmitting ? "opacity-60 cursor-not-allowed" : "hover:scale-[1.01]"
                } ${
                  orderModal.action === "BUY"
                    ? "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20"
                    : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                }`}
              >
                {orderSubmitting ? "Executing Order..." : `${orderModal.action} ${orderQty} ${stock.symbol}`}
              </button>

              {orderFeedback && (
                <div className={`p-2.5 rounded-xl text-xs font-bold text-center animate-fade-in border ${
                  orderFeedback.startsWith("✓")
                    ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300"
                    : "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300"
                }`}>
                  {orderFeedback}
                </div>
              )}
            </div>

            {/* ========================================================================= */}
            {/* AI MENTOR & NEWS DESK (Requested by user: "add this for every stocks")   */}
            {/* ========================================================================= */}
            <div className="bg-white dark:bg-slate-900/60 border border-[#e2e8f0] dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden space-y-0">
              {/* Segmented Tab Headers: AI Mentor | News */}
              <div className="grid grid-cols-2 border-b border-[#e2e8f0] dark:border-slate-800 bg-[#f8fafc] dark:bg-slate-900/80">
                <button
                  onClick={() => setRightPanelTab("mentor")}
                  className={`py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border-b-2 ${
                    rightPanelTab === "mentor"
                      ? "border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-400 bg-white dark:bg-slate-800/60 shadow-xs"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>AI Mentor</span>
                </button>

                <button
                  onClick={() => setRightPanelTab("news")}
                  className={`py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border-b-2 ${
                    rightPanelTab === "news"
                      ? "border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-400 bg-white dark:bg-slate-800/60 shadow-xs"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  <Newspaper className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>News</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                </button>
              </div>

              {/* TAB 1: AI MENTOR INTELLIGENCE */}
              {rightPanelTab === "mentor" && (
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Signal & Conviction Pill */}
                  <div className="p-3 rounded-xl bg-gradient-to-r from-cyan-500/10 via-teal-500/10 to-transparent border border-cyan-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300 flex items-center gap-1">
                        <BrainCircuit className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        AI Technical Signal
                      </span>
                      <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                        {stock.changePercent >= 2 ? "88% High Conviction" : "79% Conviction"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-black uppercase tracking-wide ${
                          stock.changePercent >= 2
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                            : stock.changePercent > 0
                            ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800"
                            : stock.changePercent < -3
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                        }`}
                      >
                        {stock.changePercent >= 2
                          ? "Bullish Accumulation"
                          : stock.changePercent > 0
                          ? "Momentum Continuation"
                          : stock.changePercent < -3
                          ? "Oversold Reversal Watch"
                          : "Consolidation / Range"}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {stock.changePercent >= 0 ? "Buyers leading" : "Sellers testing support"}
                      </span>
                    </div>
                  </div>

                  {/* Key Price Levels: Pivot, Resistances, Supports */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Key Strategic Pivots</span>
                      <span className="font-mono text-[10px]">Fibonacci / S&R</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-1">
                        <div className="text-[10px] text-slate-400 font-medium">Resistance 2 (R2)</div>
                        <div className="font-black font-tabular text-rose-600 dark:text-rose-400">
                          ₹{(stock.price * 1.035).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-1">
                        <div className="text-[10px] text-slate-400 font-medium">Resistance 1 (R1)</div>
                        <div className="font-black font-tabular text-rose-500 dark:text-rose-400">
                          ₹{(stock.price * 1.018).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-1">
                        <div className="text-[10px] text-slate-400 font-medium">Support 1 (S1)</div>
                        <div className="font-black font-tabular text-emerald-600 dark:text-emerald-400">
                          ₹{(stock.price * 0.982).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-1">
                        <div className="text-[10px] text-slate-400 font-medium">Stop Loss Guard</div>
                        <div className="font-black font-tabular text-amber-600 dark:text-amber-400">
                          ₹{(stock.price * 0.97).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Strategic Rationale */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                      <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Copilot Strategic Rationale</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {stock.name} is trading with {stock.changePercent >= 0 ? "healthy buyer participation and volume absorption" : "short-term selling pressure near moving average clusters"}. Delivery volumes suggest {stock.changePercent >= 0 ? "strong institutional hands defending intraday dips" : "possible mean reversion once lower boundary is tested"}. Maintain strict risk-reward discipline around recommended pivots.
                    </p>
                  </div>

                  {/* Deep AI Copilot Link */}
                  <Link
                    href={`/mentor?query=Analyze+${stock.symbol}+for+intraday+and+swing+trading`}
                    className="w-full py-2.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all hover:scale-[1.01]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Deep AI Chat Analysis for {stock.symbol}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}

              {/* TAB 2: COMPANY & MARKET NEWS */}
              {rightPanelTab === "news" && (
                <div className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                    <span>Recent Disclosures & Catalysts</span>
                    <span className="font-mono">Live Sync</span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/70 space-y-2.5">
                    {getStockNews(stock.symbol, stock.name).map((news, idx) => (
                      <div key={idx} className="pt-2.5 first:pt-0 space-y-1 group">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-cyan-700 dark:text-cyan-400">
                            {news.source}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                news.sentiment === "POSITIVE"
                                  ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400"
                                  : news.sentiment === "NEGATIVE"
                                  ? "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {news.sentiment}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {news.timeAgo}
                            </span>
                          </div>
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                          {news.title}
                        </h4>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {news.summary}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400">
                      Disclosures synced from BSE/NSE filings & leading financial wires
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Floating Order Modal (Triggered from Buy / Sell button in Header) */}
      {orderModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs text-white font-black ${
                      orderModal.action === "BUY" ? "bg-cyan-600" : "bg-rose-600"
                    }`}
                  >
                    {orderModal.action}
                  </span>
                  <span>{stock.name}</span>
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">NSE • ₹{stock.price.toFixed(2)}</span>
              </div>
              <button
                onClick={() => setOrderModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Order Type Toggle */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-500 dark:text-slate-400">ORDER TYPE</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setOrderType("MARKET")}
                    className={`py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                      orderType === "MARKET"
                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    Market
                  </button>
                  <button
                    onClick={() => {
                      setOrderType("LIMIT");
                      if (!limitPrice) setLimitPrice(stock.price);
                    }}
                    className={`py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                      orderType === "LIMIT"
                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    Limit
                  </button>
                </div>
              </div>

              {orderType === "LIMIT" && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="font-bold text-slate-500 dark:text-slate-400">LIMIT PRICE (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={limitPrice || stock.price}
                    onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-tabular text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold text-slate-500 dark:text-slate-400">QUANTITY</label>
                <input
                  type="number"
                  min="1"
                  value={orderQty}
                  onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-tabular text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Total Payable:</span>
                  <span className="font-black text-sm text-slate-900 dark:text-slate-100 font-tabular">
                    ₹{(((orderType === "LIMIT" && limitPrice > 0 ? limitPrice : stock.price)) * orderQty).toFixed(2)}
                  </span>
                </div>
              </div>

              {orderFeedback ? (
                <div className={`p-3 rounded-xl font-bold text-center border ${
                  orderFeedback.startsWith("✓")
                    ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300"
                    : "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300"
                }`}>
                  {orderFeedback}
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setOrderModal((prev) => ({ ...prev, isOpen: false }))}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteOrder}
                    disabled={orderSubmitting}
                    className={`flex-1 py-2.5 rounded-xl text-white font-extrabold cursor-pointer transition-all ${
                      orderSubmitting ? "opacity-60 cursor-not-allowed" : ""
                    } ${
                      orderModal.action === "BUY" ? "bg-cyan-600 hover:bg-cyan-500" : "bg-rose-600 hover:bg-rose-500"
                    }`}
                  >
                    {orderSubmitting ? "Executing..." : `Execute ${orderModal.action}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
