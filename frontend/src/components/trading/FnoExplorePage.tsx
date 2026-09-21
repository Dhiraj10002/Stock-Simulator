"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMarketStore } from "@/stores/market-store";
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Zap,
  Activity,
  ArrowRight,
  Search,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  ShieldAlert,
  Wallet as WalletIcon,
  PieChart,
  BarChart2,
  Sparkles,
  ArrowUpRight,
  Filter,
} from "lucide-react";
import { formatPaise, formatNumber } from "@/lib/format";
import type { Wallet, Portfolio, ApiResponse } from "@/types";
import FnoOrderModal from "@/components/trading/FnoOrderModal";
import type { InstrumentMetadata } from "@/lib/mockData";

// ---------------------------------------------------------------------------
// TYPES & DATA CONTRACTS
// ---------------------------------------------------------------------------

export interface IndexTicker {
  name: string;
  symbol: string;
  value: string;
  change: string;
  percent: string;
  isGain: boolean;
  sparkline: number[];
}

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TopTradedUnderlying {
  symbol: string;
  name: string;
  type: "INDEX" | "STOCK";
  price: number;
  change: number;
  changePercent: number;
  candles: CandleData[];
  lotSize: number;
  optionsSymbol: string;
}

export interface FnoStockRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  oi: string;
  isGain: boolean;
}

export interface FutureContract {
  symbol: string;
  underlying: string;
  name: string;
  expiry: string;
  price: number;
  change: number;
  changePercent: number;
  lotSize: number;
  openInterest: string;
  isGain: boolean;
}

// ---------------------------------------------------------------------------
// DATASETS (Matching User Annotations)
// ---------------------------------------------------------------------------

export const FNO_INDICES_STRIP: IndexTicker[] = [
  {
    name: "NIFTY",
    symbol: "NIFTY",
    value: "23,346.40",
    change: "+75.80",
    percent: "+0.33%",
    isGain: true,
    sparkline: [23280, 23300, 23290, 23330, 23320, 23350, 23346],
  },
  {
    name: "SENSEX",
    symbol: "SENSEX",
    value: "74,294.96",
    change: "-19.63",
    percent: "-0.03%",
    isGain: false,
    sparkline: [74340, 74320, 74300, 74310, 74280, 74290, 74294],
  },
  {
    name: "BANKNIFTY",
    symbol: "BANKNIFTY",
    value: "56,358.70",
    change: "+302.95",
    percent: "+0.54%",
    isGain: true,
    sparkline: [56050, 56120, 56180, 56240, 56310, 56358],
  },
  {
    name: "MIDCPNIFTY",
    symbol: "MIDCPNIFTY",
    value: "14,500.75",
    change: "+78.90",
    percent: "+0.55%",
    isGain: true,
    sparkline: [14420, 14450, 14470, 14490, 14500],
  },
  {
    name: "FINNIFTY",
    symbol: "FINNIFTY",
    value: "25,510.00",
    change: "+48.40",
    percent: "+0.19%",
    isGain: true,
    sparkline: [25450, 25480, 25470, 25490, 25510],
  },
];

// Top Traded Underlyings (Indices + Stocks with mini Candlesticks matching Groww Image 1)
export const TOP_TRADED_UNDERLYINGS: TopTradedUnderlying[] = [
  {
    symbol: "NIFTY 50",
    name: "Nifty 50 Index",
    type: "INDEX",
    price: 23346.4,
    change: 75.8,
    changePercent: 0.33,
    lotSize: 50,
    optionsSymbol: "NIFTY",
    candles: [
      { open: 23280, high: 23310, low: 23270, close: 23300 },
      { open: 23300, high: 23330, low: 23290, close: 23320 },
      { open: 23320, high: 23315, low: 23280, close: 23290 },
      { open: 23290, high: 23340, low: 23285, close: 23335 },
      { open: 23335, high: 23360, low: 23320, close: 23346 },
    ],
  },
  {
    symbol: "SENSEX",
    name: "BSE Sensex 30",
    type: "INDEX",
    price: 74294.96,
    change: -19.63,
    changePercent: -0.03,
    lotSize: 10,
    optionsSymbol: "SENSEX",
    candles: [
      { open: 74350, high: 74380, low: 74320, close: 74330 },
      { open: 74330, high: 74340, low: 74290, close: 74305 },
      { open: 74305, high: 74320, low: 74270, close: 74280 },
      { open: 74280, high: 74310, low: 74275, close: 74290 },
      { open: 74290, high: 74300, low: 74260, close: 74294 },
    ],
  },
  {
    symbol: "BANK NIFTY",
    name: "Nifty Bank Index",
    type: "INDEX",
    price: 56358.7,
    change: 302.95,
    changePercent: 0.54,
    lotSize: 15,
    optionsSymbol: "BANKNIFTY",
    candles: [
      { open: 56050, high: 56150, low: 56020, close: 56120 },
      { open: 56120, high: 56210, low: 56100, close: 56190 },
      { open: 56190, high: 56240, low: 56160, close: 56225 },
      { open: 56225, high: 56340, low: 56210, close: 56310 },
      { open: 56310, high: 56390, low: 56290, close: 56358 },
    ],
  },
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    type: "STOCK",
    price: 1226.4,
    change: -17.5,
    changePercent: -1.41,
    lotSize: 250,
    optionsSymbol: "RELIANCE",
    candles: [
      { open: 1245, high: 1248, low: 1238, close: 1240 },
      { open: 1240, high: 1242, low: 1232, close: 1235 },
      { open: 1235, high: 1236, low: 1225, close: 1228 },
      { open: 1228, high: 1232, low: 1222, close: 1224 },
      { open: 1224, high: 1229, low: 1220, close: 1226.4 },
    ],
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank",
    type: "STOCK",
    price: 731.0,
    change: 18.0,
    changePercent: 2.52,
    lotSize: 550,
    optionsSymbol: "HDFCBANK",
    candles: [
      { open: 713, high: 718, low: 711, close: 716 },
      { open: 716, high: 722, low: 715, close: 720 },
      { open: 720, high: 725, low: 718, close: 724 },
      { open: 724, high: 729, low: 722, close: 728 },
      { open: 728, high: 733, low: 726, close: 731.0 },
    ],
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    type: "STOCK",
    price: 2105.0,
    change: -85.0,
    changePercent: -3.88,
    lotSize: 175,
    optionsSymbol: "TCS",
    candles: [
      { open: 2190, high: 2195, low: 2170, close: 2175 },
      { open: 2175, high: 2180, low: 2150, close: 2155 },
      { open: 2155, high: 2160, low: 2125, close: 2130 },
      { open: 2130, high: 2135, low: 2095, close: 2100 },
      { open: 2100, high: 2115, low: 2090, close: 2105.0 },
    ],
  },
];

// F&O Stocks Table (matching Image 1 & 2 annotated list)
export const FNO_STOCKS_DATA: FnoStockRow[] = [
  {
    symbol: "SUPREMEIND",
    name: "Supreme Industries Ltd",
    price: 3580.3,
    change: 235.9,
    changePercent: 7.05,
    volume: "4,69,754",
    oi: "12.4 Lakh",
    isGain: true,
  },
  {
    symbol: "UNOMINDA",
    name: "UNO Minda Ltd",
    price: 1284.0,
    change: 79.0,
    changePercent: 6.56,
    volume: "12,77,954",
    oi: "28.5 Lakh",
    isGain: true,
  },
  {
    symbol: "RVNL",
    name: "Rail Vikas Nigam Ltd",
    price: 214.29,
    change: 12.59,
    changePercent: 6.24,
    volume: "94,69,057",
    oi: "1.42 Cr",
    isGain: true,
  },
  {
    symbol: "ATHER",
    name: "Ather Energy Ltd",
    price: 1640.0,
    change: 90.0,
    changePercent: 5.81,
    volume: "50,10,015",
    oi: "42.0 Lakh",
    isGain: true,
  },
  {
    symbol: "APLAPOLLO",
    name: "APL Apollo Tubes Ltd",
    price: 2270.1,
    change: 121.6,
    changePercent: 5.66,
    volume: "11,15,754",
    oi: "18.8 Lakh",
    isGain: true,
  },
  {
    symbol: "TATAPOWER",
    name: "Tata Power Co Ltd",
    price: 442.1,
    change: 15.2,
    changePercent: 3.56,
    volume: "82,40,000",
    oi: "3.1 Cr",
    isGain: true,
  },
  {
    symbol: "TATACHEM",
    name: "Tata Chemicals Ltd",
    price: 693.25,
    change: -86.1,
    changePercent: -11.04,
    volume: "68,14,200",
    oi: "1.05 Cr",
    isGain: false,
  },
  {
    symbol: "GODIGIT",
    name: "Go Digit General Insurance",
    price: 239.0,
    change: -16.2,
    changePercent: -6.46,
    volume: "35,22,100",
    oi: "84.5 Lakh",
    isGain: false,
  },
  {
    symbol: "TATATECH",
    name: "Tata Technologies Ltd",
    price: 722.45,
    change: -36.2,
    changePercent: -4.78,
    volume: "42,80,900",
    oi: "62.0 Lakh",
    isGain: false,
  },
  {
    symbol: "NIACL",
    name: "New India Assurance",
    price: 187.66,
    change: -9.4,
    changePercent: -4.77,
    volume: "24,15,000",
    oi: "45.2 Lakh",
    isGain: false,
  },
];

// Top Traded Index Futures (matching Image 3 annotated card list)
export const TOP_INDEX_FUTURES: FutureContract[] = [
  {
    symbol: "NIFTY24SEPFUT",
    underlying: "NIFTY 50",
    name: "NIFTY 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 23378.5,
    change: 45.1,
    changePercent: 0.19,
    lotSize: 50,
    openInterest: "1.42 Cr",
    isGain: true,
  },
  {
    symbol: "BANKNIFTY24SEPFUT",
    underlying: "BANK NIFTY",
    name: "BANKNIFTY 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 56527.0,
    change: 217.0,
    changePercent: 0.39,
    lotSize: 15,
    openInterest: "48.2 Lakh",
    isGain: true,
  },
  {
    symbol: "NIFTY24OCTFUT",
    underlying: "NIFTY 50",
    name: "NIFTY 27 Oct Fut",
    expiry: "27 Oct 2026",
    price: 23480.3,
    change: 38.3,
    changePercent: 0.16,
    lotSize: 50,
    openInterest: "62.5 Lakh",
    isGain: true,
  },
  {
    symbol: "MIDCPNIFTY24SEPFUT",
    underlying: "MIDCP NIFTY",
    name: "MIDCPNIFTY 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 14524.4,
    change: 85.6,
    changePercent: 0.59,
    lotSize: 50,
    openInterest: "25.8 Lakh",
    isGain: true,
  },
];

// Top Traded Stock Futures (matching Image 3 annotated card list)
export const TOP_STOCK_FUTURES: FutureContract[] = [
  {
    symbol: "HDFCBANK24SEPFUT",
    underlying: "HDFCBANK",
    name: "HDFCBANK 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 731.85,
    change: 16.3,
    changePercent: 2.28,
    lotSize: 550,
    openInterest: "4.8 Cr",
    isGain: true,
  },
  {
    symbol: "TCS24SEPFUT",
    underlying: "TCS",
    name: "TCS 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 2098.2,
    change: -93.3,
    changePercent: -4.26,
    lotSize: 175,
    openInterest: "88.4 Lakh",
    isGain: false,
  },
  {
    symbol: "INFY24SEPFUT",
    underlying: "INFY",
    name: "INFY 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 1049.6,
    change: -16.0,
    changePercent: -1.5,
    lotSize: 400,
    openInterest: "1.82 Cr",
    isGain: false,
  },
  {
    symbol: "RELIANCE24SEPFUT",
    underlying: "RELIANCE",
    name: "RELIANCE 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 1241.4,
    change: -6.0,
    changePercent: -0.48,
    lotSize: 250,
    openInterest: "2.14 Cr",
    isGain: false,
  },
];

// ---------------------------------------------------------------------------
// MINI CANDLESTICK CHART COMPONENT
// ---------------------------------------------------------------------------

function MiniCandlestickChart({ candles }: { candles: CandleData[] }) {
  const w = 110;
  const h = 48;
  const padY = 4;
  const padX = 6;

  const allLows = candles.map((c) => c.low);
  const allHighs = candles.map((c) => c.high);
  const min = Math.min(...allLows);
  const max = Math.max(...allHighs);
  const range = max - min || 1;

  const candleW = 9;
  const candleGap = (w - padX * 2 - candles.length * candleW) / (candles.length - 1);

  const getY = (val: number) => {
    return h - padY - ((val - min) / range) * (h - padY * 2);
  };

  return (
    <svg width={w} height={h} className="overflow-visible select-none">
      {candles.map((c, i) => {
        const isUp = c.close >= c.open;
        const color = isUp ? "#10b981" : "#f43f5e";
        const xCenter = padX + i * (candleW + candleGap) + candleW / 2;
        const xLeft = padX + i * (candleW + candleGap);

        const yHigh = getY(c.high);
        const yLow = getY(c.low);
        const yOpen = getY(c.open);
        const yClose = getY(c.close);

        const bodyY = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yClose - yOpen), 2);

        return (
          <g key={i}>
            {/* Wick */}
            <line
              x1={xCenter}
              y1={yHigh}
              x2={xCenter}
              y2={yLow}
              stroke={color}
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            {/* Candle body */}
            <rect
              x={xLeft}
              y={bodyY}
              width={candleW}
              height={bodyHeight}
              fill={color}
              rx="1.5"
            />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// MINI SPARKLINE HELPER
// ---------------------------------------------------------------------------

function MiniSparkline({ points, isGain }: { points: number[]; isGain: boolean }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 70;
  const h = 20;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - 2 - ((p - min) / range) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={w} height={h} className="overflow-visible">
      <path
        d={`M ${coords.join(" L ")}`}
        fill="none"
        stroke={isGain ? "#10b981" : "#f43f5e"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// MAIN FNO EXPLORE PAGE COMPONENT
// ---------------------------------------------------------------------------

interface FnoExplorePageProps {
  onSelectOptionChain?: (symbol: string) => void;
}

export default function FnoExplorePage({}: FnoExplorePageProps = {}) {
  const router = useRouter();
  const quotes = useMarketStore((s) => s.quotes);

  // Filter state for Top Traded Underlyings
  const [underlyingFilter, setUnderlyingFilter] = useState<"ALL" | "INDICES" | "EQUITY">("ALL");

  // F&O Direct Buy/Sell order placement modal state
  const [fnoModalInstrument, setFnoModalInstrument] = useState<InstrumentMetadata | null>(null);
  const [fnoOrderSide, setFnoOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [isFnoModalOpen, setIsFnoModalOpen] = useState(false);

  const handleOpenFnoOrder = (fut: FutureContract, side: "BUY" | "SELL" = "BUY") => {
    const inst: InstrumentMetadata = {
      symbol: fut.symbol,
      name: fut.name,
      exchange: "NFO",
      segment: "FUTURES",
      basePricePaise: Math.round(fut.price * 100),
      dayChangePercent: fut.changePercent,
      lotSize: fut.lotSize,
      expiry: fut.expiry,
      underlying: fut.underlying,
    };
    setFnoModalInstrument(inst);
    setFnoOrderSide(side);
    setIsFnoModalOpen(true);
  };

  // Tab state for F&O Stocks Table
  const [fnoStockTab, setFnoStockTab] = useState<"GAINERS" | "LOSERS" | "ALL">("GAINERS");

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Token & API
  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // Fetch Wallet
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", token],
    queryFn: async () => {
      if (!token) {
        return {
          uuid: "",
          cash_balance_paise: 100000000,
          available_balance_paise: 100000000,
          blocked_paise: 0,
        };
      }
      try {
        const res = await fetch(`${apiUrl}/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return {
            uuid: "",
            cash_balance_paise: 100000000,
            available_balance_paise: 100000000,
            blocked_paise: 0,
          };
        }
        const json: ApiResponse<Wallet> = await res.json();
        return (
          json.data || {
            uuid: "",
            cash_balance_paise: 100000000,
            available_balance_paise: 100000000,
            blocked_paise: 0,
          }
        );
      } catch {
        return {
          uuid: "",
          cash_balance_paise: 100000000,
          available_balance_paise: 100000000,
          blocked_paise: 0,
        };
      }
    },
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

  // Fetch Portfolio
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["portfolio", token],
    queryFn: async () => {
      if (!token) {
        return {
          invested_value_paise: 0,
          current_value_paise: 0,
          unrealized_pnl_paise: 0,
          positions: [],
        };
      }
      try {
        const res = await fetch(`${apiUrl}/portfolio`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return {
            invested_value_paise: 0,
            current_value_paise: 0,
            unrealized_pnl_paise: 0,
            positions: [],
          };
        }
        const json: ApiResponse<Portfolio> = await res.json();
        return (
          json.data || {
            invested_value_paise: 0,
            current_value_paise: 0,
            unrealized_pnl_paise: 0,
            positions: [],
          }
        );
      } catch {
        return {
          invested_value_paise: 0,
          current_value_paise: 0,
          unrealized_pnl_paise: 0,
          positions: [],
        };
      }
    },
    enabled: !!token,
    refetchInterval: token ? 5000 : false,
  });

  const availableBalance = wallet?.available_balance_paise ?? 100000000;
  const unrealizedPnl = portfolio?.unrealized_pnl_paise ?? 0;
  const isProfit = unrealizedPnl >= 0;
  const fnoPositions = (portfolio?.positions ?? []).filter(
    (p) => p.product === "FNO" || p.product === "INTRADAY"
  );

  // Filtered Top Traded Underlyings
  const filteredUnderlyings = useMemo(() => {
    return TOP_TRADED_UNDERLYINGS.filter((u) => {
      if (underlyingFilter === "INDICES") return u.type === "INDEX";
      if (underlyingFilter === "EQUITY") return u.type === "STOCK";
      return true;
    });
  }, [underlyingFilter]);

  // Filtered F&O Stocks
  const filteredFnoStocks = useMemo(() => {
    return FNO_STOCKS_DATA.filter((s) => {
      if (fnoStockTab === "GAINERS") return s.isGain;
      if (fnoStockTab === "LOSERS") return !s.isGain;
      return true;
    });
  }, [fnoStockTab]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. MAJOR INDICES HORIZONTAL STRIP (NIFTY, SENSEX, BANKNIFTY, etc.)         */}
      {/* ========================================================================= */}
      <section className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
          {FNO_INDICES_STRIP.map((idx) => {
            const live = quotes[idx.symbol];
            const liveVal = live ? (live.price_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : idx.value;
            const livePct = live?.change_percent !== undefined ? live.change_percent : parseFloat(idx.percent);
            const isGain = livePct >= 0;
            const liveChange = live ? `${isGain ? "+" : ""}${((live.price_paise * (livePct / 100)) / 100).toFixed(2)}` : idx.change;

            return (
              <div
                key={idx.symbol}
                className="flex items-center justify-between gap-4 p-2.5 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 hover:border-cyan-500/50 transition-all shrink-0 min-w-[210px]"
              >
                <div>
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                    {idx.name}
                  </div>
                  <div className="text-sm font-black font-tabular text-slate-900 dark:text-slate-100 mt-0.5">
                    ₹{liveVal}
                  </div>
                  <div
                    className={`text-[11px] font-bold font-tabular flex items-center gap-1 ${
                      isGain
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    <span>{liveChange}</span>
                    <span>({isGain ? "+" : ""}{livePct.toFixed(2)}%)</span>
                  </div>
                </div>

                <div className="shrink-0 pl-1">
                  <MiniSparkline points={idx.sparkline} isGain={isGain} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* MAIN TWO-COLUMN LAYOUT: F&O EXPLORE CONTENT (8 Cols) + MARGIN DESK (4 Cols) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT / CENTER CONTENT AREA (8 or 9 Cols) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-8">
          {/* ===================================================================== */}
          {/* 2. TOP TRADED UNDERLYINGS WITH CANDLESTICKS (Nifty, Bank Nifty, etc.)  */}
          {/* ===================================================================== */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Top traded
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Highest liquidity equity & index derivative contracts
                </p>
              </div>

              {/* Sub-toggle: All / Indices / Equity */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                {(["ALL", "INDICES", "EQUITY"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setUnderlyingFilter(filter)}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer capitalize ${
                      underlyingFilter === filter
                        ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs font-bold"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {filter === "ALL" ? "All Underlyings" : filter === "INDICES" ? "Indices" : "Equity"}
                  </button>
                ))}
              </div>
            </div>

            {/* 6 Grid Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredUnderlyings.map((u) => {
                const symKey = u.optionsSymbol || u.symbol.replace(" 50", "").replace(" ", "");
                const live = quotes[symKey];
                const currentPrice = live ? live.price_paise / 100 : u.price;
                const currentPct = live?.change_percent !== undefined ? live.change_percent : u.changePercent;
                const isGain = currentPct >= 0;
                const currentChange = live ? ((currentPrice * currentPct) / 100) : u.change;

                return (
                  <div
                    key={u.symbol}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 shadow-xs transition-all group flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                            {u.symbol}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono">
                            Lot: {u.lotSize}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[140px]">
                          {u.name}
                        </div>
                      </div>

                      {/* Mini Candlestick Visual */}
                      <div className="shrink-0 pt-1">
                        <MiniCandlestickChart candles={u.candles} />
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-100 dark:divide-slate-800/60 flex items-center justify-between">
                      <div>
                        <div className="text-base font-black font-tabular text-slate-900 dark:text-slate-100">
                          ₹{currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div
                          className={`text-xs font-bold font-tabular flex items-center gap-1 ${
                            isGain
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          <span>{isGain ? "+" : ""}{currentChange.toFixed(2)}</span>
                          <span>({isGain ? "+" : ""}{currentPct.toFixed(2)}%)</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/stocks/${u.optionsSymbol}`}
                          className="px-2.5 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/60 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          title="Trade Equity"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Trade</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ===================================================================== */}
          {/* 3. F&O STOCKS MOVERS TABLE (Supreme Ind, UNO Minda, RVNL, etc.)        */}
          {/* ===================================================================== */}
          <section className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    F&O Stocks
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Underlying stocks eligible for futures & options trading
                </p>
              </div>

              {/* Controls: Timeframe + Direction Tabs */}
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                  <span>1 Day</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </span>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                  {(["GAINERS", "LOSERS"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setFnoStockTab(tab)}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer capitalize ${
                        fnoStockTab === tab
                          ? tab === "GAINERS"
                            ? "bg-emerald-500 text-white font-bold shadow-xs"
                            : "bg-rose-500 text-white font-bold shadow-xs"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {tab.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                    <th className="py-2.5 px-3">Stocks</th>
                    <th className="py-2.5 px-3 text-right">Price (LTP)</th>
                    <th className="py-2.5 px-3 text-right">1D Change</th>
                    <th className="py-2.5 px-3 text-right">Volume</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredFnoStocks.map((stock) => (
                    <tr
                      key={stock.symbol}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-cyan-600 dark:text-cyan-400 shrink-0">
                            {stock.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <Link
                              href={`/stocks/${stock.symbol}`}
                              className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors"
                            >
                              {stock.name}
                            </Link>
                            <div className="text-[10px] text-slate-400 font-mono uppercase">
                              {stock.symbol} • NSE
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-black font-tabular text-slate-900 dark:text-slate-100">
                        ₹{stock.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-block font-bold font-tabular px-2 py-0.5 rounded text-[11px] ${
                            stock.isGain
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                              : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40"
                          }`}
                        >
                          {stock.isGain ? "+" : ""}{stock.change.toFixed(2)} ({stock.isGain ? "+" : ""}{stock.changePercent.toFixed(2)}%)
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {stock.volume}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <Link
                          href={`/stocks/${stock.symbol}`}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-cyan-950/60 text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 font-semibold text-[11px] transition-colors inline-block"
                        >
                          Trade Stock →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ===================================================================== */}
          {/* 4. TOP TRADED INDEX FUTURES (Nifty Sep, BankNifty Sep, Midcp, etc.)   */}
          {/* ===================================================================== */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Top traded index futures
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Benchmark monthly & weekly index futures contracts
                </p>
              </div>

              <span className="text-xs text-slate-400 font-mono">
                Cash Settled • NSE
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {TOP_INDEX_FUTURES.map((fut) => {
                const isGain = fut.change >= 0;
                return (
                  <div
                    key={fut.symbol}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 shadow-xs transition-all space-y-3 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-400">
                          INDEX FUT
                        </span>
                        <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors mt-1">
                          {fut.name}
                        </h3>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Expiry: {fut.expiry} • Lot: {fut.lotSize}
                        </div>
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                        <Zap className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
                      <div>
                        <div className="text-sm font-black font-tabular text-slate-900 dark:text-slate-100">
                          ₹{fut.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div
                          className={`text-[11px] font-bold font-tabular flex items-center gap-1 ${
                            isGain
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          <span>{isGain ? "+" : ""}{fut.change.toFixed(2)}</span>
                          <span>({isGain ? "+" : ""}{fut.changePercent.toFixed(2)}%)</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenFnoOrder(fut, "BUY")}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                        >
                          Buy
                        </button>
                        <button
                          onClick={() => handleOpenFnoOrder(fut, "SELL")}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                        >
                          Sell
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ===================================================================== */}
          {/* 5. TOP TRADED STOCK FUTURES (HDFC Bank, TCS, Infy, Reliance)          */}
          {/* ===================================================================== */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Top traded stock futures
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Highest volume single-stock futures across blue-chip counters
                </p>
              </div>

              <span className="text-xs text-slate-400 font-mono">
                Physical Delivery • NSE
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {TOP_STOCK_FUTURES.map((fut) => {
                const isGain = fut.change >= 0;
                return (
                  <div
                    key={fut.symbol}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 shadow-xs transition-all space-y-3 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-400">
                          STOCK FUT
                        </span>
                        <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors mt-1">
                          {fut.name}
                        </h3>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Expiry: {fut.expiry} • Lot: {fut.lotSize}
                        </div>
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
                      <div>
                        <div className="text-sm font-black font-tabular text-slate-900 dark:text-slate-100">
                          ₹{fut.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div
                          className={`text-[11px] font-bold font-tabular flex items-center gap-1 ${
                            isGain
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          <span>{isGain ? "+" : ""}{fut.change.toFixed(2)}</span>
                          <span>({isGain ? "+" : ""}{fut.changePercent.toFixed(2)}%)</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenFnoOrder(fut, "BUY")}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                        >
                          Buy
                        </button>
                        <button
                          onClick={() => handleOpenFnoOrder(fut, "SELL")}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                        >
                          Sell
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ===================================================================== */}
        {/* RIGHT COLUMN: F&O MARGIN UTILIZATION & QUICK DERIVATIVES DESK (4 Cols) */}
        {/* ===================================================================== */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-5 lg:sticky lg:top-24">
          {/* F&O Margin Desk Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <WalletIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                F&O Available Margin
              </h3>
              <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                ● Live
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
                {formatPaise(availableBalance)}
              </div>
              <p className="text-[11px] text-slate-400">
                Margin ready for multi-leg option writing and futures positions.
              </p>
            </div>

            {/* Quick Stats */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Active F&O Contracts:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {fnoPositions.length} Open
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Unrealized F&O P&L:</span>
                <span
                  className={`font-bold font-tabular ${
                    isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {formatPaise(unrealizedPnl)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Span + Exposure:</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  ₹0.00
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Link
                href="/stocks"
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
              >
                <TrendingUp className="w-4 h-4" />
                <span>Explore Live Equities</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/portfolio"
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors text-center"
              >
                <span>View Derivative Holdings</span>
              </Link>
            </div>
          </div>

          {/* Institutional Derivatives Info Alert */}
          <div className="p-4 rounded-2xl bg-cyan-500/5 dark:bg-cyan-500/10 border border-cyan-500/20 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-cyan-800 dark:text-cyan-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Real-Time Greek Analytics</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Delta, Theta, Gamma, and Vega calculations update dynamically using Black-Scholes formulas alongside live Put-Call Ratios and Max Pain strike analysis.
            </p>
          </div>
        </aside>
      </div>

      {/* F&O Direct Buy/Sell Order Modal */}
      <FnoOrderModal
        isOpen={isFnoModalOpen}
        onClose={() => {
          setIsFnoModalOpen(false);
          setFnoModalInstrument(null);
        }}
        instrument={fnoModalInstrument}
        initialSide={fnoOrderSide}
        availableBalancePaise={availableBalance}
      />
    </div>
  );
}
