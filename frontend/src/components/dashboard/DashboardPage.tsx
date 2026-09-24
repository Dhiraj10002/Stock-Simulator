"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMultiSymbolQuotes } from "@/stores/market-store";
import { fetchBatchQuotes, getCachedQuote } from "@/lib/quoteService";
import { getApiUrl } from "@/lib/config";
import Navbar from "@/components/layout/Navbar";
import {
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  Layers,
  PieChart,
  ClipboardList,
  Bookmark,
  BarChart2,
  ArrowRight,
  RefreshCw,
  Zap,
  Activity,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Calendar,
  DollarSign,
  Newspaper,
  Clock,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building,
  Gift,
  ArrowUpRight,
  Anchor,
  Car,
  Building2,
  Flame,
  Pill,
  Factory,
  Cpu,
  Search,
  Filter,
  ShoppingBag,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import type { Wallet, Portfolio, ApiResponse, Candle } from "@/types";

// ---------------------------------------------------------------------------
// TYPES & CATALOG EXPORTS (Kept for compatibility with stock details & routes)
// ---------------------------------------------------------------------------
export interface WatchlistItem {
  symbol: string;
  exchange?: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  isPositive: boolean;
}

export const MASTER_STOCKS_CATALOG: WatchlistItem[] = [
  { symbol: "POONAWALLA", exchange: "NSE", name: "Poonawalla Fincorp Ltd", price: 479.4, change: 46.6, changePercent: 10.77, isPositive: true },
  { symbol: "ATGL", exchange: "NSE", name: "Adani Total Gas Ltd", price: 660.7, change: 73.7, changePercent: 12.56, isPositive: true },
  { symbol: "EMCURE", exchange: "NSE", name: "Emcure Pharmaceuticals", price: 2003.8, change: 94.0, changePercent: 4.92, isPositive: true },
  { symbol: "WELCORP", exchange: "NSE", name: "Welspun Corp Ltd", price: 2660.1, change: 198.5, changePercent: 8.12, isPositive: true },
  { symbol: "BBTC", exchange: "NSE", name: "Bombay Burmah Trading", price: 1512.1, change: 112.4, changePercent: 8.05, isPositive: true },
  { symbol: "JYOTICNC", exchange: "NSE", name: "Jyoti CNC Automation", price: 1049.7, change: 68.7, changePercent: 7.02, isPositive: true },
  { symbol: "SPLPETRO", exchange: "NSE", name: "Supreme Petrochem Ltd", price: 865.7, change: 58.5, changePercent: 7.27, isPositive: true },
  { symbol: "SUPREMEIND", exchange: "NSE", name: "Supreme Industries Ltd", price: 3580.3, change: 236.0, changePercent: 7.05, isPositive: true },
  { symbol: "TRENT", exchange: "NSE", name: "Trent Ltd (Westside & Zudio)", price: 7140.0, change: 328.0, changePercent: 4.82, isPositive: true },
  { symbol: "SUZLON", exchange: "NSE", name: "Suzlon Energy Ltd", price: 74.5, change: 3.0, changePercent: 4.2, isPositive: true },
  { symbol: "RELIANCE", exchange: "NSE", name: "Reliance Industries Ltd", price: 2980.4, change: 24.8, changePercent: 0.84, isPositive: true },
  { symbol: "HDFCBANK", exchange: "NSE", name: "HDFC Bank Ltd", price: 1642.5, change: 16.1, changePercent: 0.99, isPositive: true },
  { symbol: "ICICIBANK", exchange: "NSE", name: "ICICI Bank Ltd", price: 1215.3, change: 13.5, changePercent: 1.12, isPositive: true },
  { symbol: "TATACHEM", exchange: "NSE", name: "Tata Chemicals Ltd", price: 693.25, change: -86.1, changePercent: -11.04, isPositive: false },
  { symbol: "GODIGIT", exchange: "NSE", name: "Go Digit General Insurance", price: 239.0, change: -16.2, changePercent: -6.46, isPositive: false },
  { symbol: "TATATECH", exchange: "NSE", name: "Tata Technologies Ltd", price: 722.45, change: -36.2, changePercent: -4.78, isPositive: false },
  { symbol: "NIACL", exchange: "NSE", name: "New India Assurance", price: 187.66, change: -9.4, changePercent: -4.77, isPositive: false },
  { symbol: "KPITTECH", exchange: "NSE", name: "KPIT Technologies Ltd", price: 1640.0, change: -24.0, changePercent: -1.44, isPositive: false },
  { symbol: "SUNTV", exchange: "NSE", name: "Sun TV Network Ltd", price: 451.7, change: -16.9, changePercent: -3.57, isPositive: false },
  { symbol: "TCS", exchange: "NSE", name: "Tata Consultancy Services", price: 4210.0, change: -35.0, changePercent: -0.82, isPositive: false },
  { symbol: "GILLETTE", exchange: "NSE", name: "Gillette India Ltd", price: 7073.0, change: -234.0, changePercent: -3.2, isPositive: false },
  { symbol: "INFY", exchange: "NSE", name: "Infosys Ltd", price: 1785.2, change: -12.4, changePercent: -0.69, isPositive: false },
  { symbol: "BHARTIARTL", exchange: "NSE", name: "Bharti Airtel Ltd", price: 1564.0, change: 7.0, changePercent: 0.45, isPositive: true },
  { symbol: "SBIN", exchange: "NSE", name: "State Bank of India", price: 785.0, change: -2.8, changePercent: -0.35, isPositive: false },
  { symbol: "PRAJIND", exchange: "NSE", name: "Praj Industries Ltd", price: 317.55, change: 5.4, changePercent: 1.73, isPositive: true },
  { symbol: "BAJFINANCE", exchange: "NSE", name: "Bajaj Finance Ltd", price: 1008.8, change: -12.5, changePercent: -1.22, isPositive: false },
  { symbol: "AXISBANK", exchange: "NSE", name: "Axis Bank Ltd", price: 1242.7, change: -7.3, changePercent: -0.58, isPositive: false },
  { symbol: "KOTAKBANK", exchange: "NSE", name: "Kotak Mahindra Bank", price: 412.65, change: -2.15, changePercent: -0.52, isPositive: false },
  { symbol: "APARINDS", exchange: "NSE", name: "Apar Industries Ltd", price: 18233.0, change: -712.0, changePercent: -3.76, isPositive: false },
];

import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// TRENDING SECTORS (Kite Marketwatch Panel & Groww Sectoral Breadth)
// ---------------------------------------------------------------------------
export interface SectorTrending {
  id: string;
  name: string;
  shortName: string;
  icon: LucideIcon;
  gainersCount: number;
  losersCount: number;
  changePercent: number;
  topStock: string;
  topStockChange: number;
}

export const DASHBOARD_TRENDING_SECTORS: SectorTrending[] = [
  {
    id: "auto",
    name: "Automotive & Electric Mobility",
    shortName: "Auto & EV",
    icon: Car,
    gainersCount: 22,
    losersCount: 6,
    changePercent: 2.45,
    topStock: "TATAMOTORS",
    topStockChange: 1.93,
  },
  {
    id: "banking",
    name: "Banking & Financial Services",
    shortName: "Banking & Fin",
    icon: Building2,
    gainersCount: 31,
    losersCount: 9,
    changePercent: 1.84,
    topStock: "ICICIBANK",
    topStockChange: 1.12,
  },
  {
    id: "energy",
    name: "Energy, Oil & Natural Gas",
    shortName: "Energy & Oil",
    icon: Zap,
    gainersCount: 18,
    losersCount: 8,
    changePercent: 1.35,
    topStock: "ATGL",
    topStockChange: 12.56,
  },
  {
    id: "consumer",
    name: "Consumer Discretionary & Retail",
    shortName: "Retail & Consumer",
    icon: Flame,
    gainersCount: 19,
    losersCount: 15,
    changePercent: 0.91,
    topStock: "TRENT",
    topStockChange: 4.82,
  },
  {
    id: "pharma",
    name: "Pharmaceuticals & Healthcare",
    shortName: "Pharma & Health",
    icon: Pill,
    gainersCount: 16,
    losersCount: 14,
    changePercent: 0.45,
    topStock: "SUNPHARMA",
    topStockChange: 0.9,
  },
  {
    id: "metals",
    name: "Metals & Mining",
    shortName: "Metals & Mining",
    icon: Factory,
    gainersCount: 14,
    losersCount: 12,
    changePercent: -0.32,
    topStock: "TATASTEEL",
    topStockChange: 1.45,
  },
  {
    id: "it",
    name: "Information Technology (IT)",
    shortName: "IT & Tech",
    icon: Cpu,
    gainersCount: 8,
    losersCount: 24,
    changePercent: -1.27,
    topStock: "TCS",
    topStockChange: -0.82,
  },
  {
    id: "realty",
    name: "Real Estate & Infrastructure",
    shortName: "Realty & Infra",
    icon: Building,
    gainersCount: 11,
    losersCount: 5,
    changePercent: 1.15,
    topStock: "DLF",
    topStockChange: 2.1,
  },
  {
    id: "fmcg",
    name: "FMCG & Consumer Staples",
    shortName: "FMCG Staples",
    icon: ShoppingBag,
    gainersCount: 12,
    losersCount: 10,
    changePercent: 0.28,
    topStock: "ITC",
    topStockChange: 0.6,
  },
];

export const SECTOR_CONSTITUENTS: Record<string, string[]> = {
  auto: ["TATAMOTORS", "TATAPOWER", "TATATECH"],
  banking: ["HDFCBANK", "ICICIBANK", "SBIN", "YESBANK", "POONAWALLA", "GODIGIT"],
  energy: ["RELIANCE", "ATGL", "TATAPOWER", "SUZLON"],
  consumer: ["TRENT"],
  pharma: ["SUNPHARMA", "EMCURE"],
  metals: ["TATASTEEL", "WELCORP", "BBTC", "SPLPETRO"],
  it: ["TCS", "INFY", "KPITTECH"],
  realty: ["DLF", "SUPREMEIND", "JYOTICNC"],
  fmcg: ["ITC", "GILLETTE", "NIACL"],
};

// ---------------------------------------------------------------------------
// KITE-STYLE DATA: IPOs, News, Economic Calendar, Holidays, Earnings, Actions
// ---------------------------------------------------------------------------
interface IPORow {
  company: string;
  symbol: string;
  issueDates: string;
  priceBand: string;
  lotSize: number;
  issueSize: string;
  status: "OPEN" | "UPCOMING" | "CLOSED" | "LISTED";
  gmp: string;
  gmpPercent: string;
}

const KITE_IPOS: IPORow[] = [
  {
    company: "Hyundai Motor India Ltd",
    symbol: "HYUNDAI",
    issueDates: "15 Oct - 17 Oct",
    priceBand: "₹1,865 - ₹1,960",
    lotSize: 7,
    issueSize: "₹27,870 Cr",
    status: "UPCOMING",
    gmp: "+₹65",
    gmpPercent: "+3.3%",
  },
  {
    company: "Swiggy Limited",
    symbol: "SWIGGY",
    issueDates: "06 Nov - 08 Nov",
    priceBand: "₹371 - ₹390",
    lotSize: 38,
    issueSize: "₹11,327 Cr",
    status: "UPCOMING",
    gmp: "+₹25",
    gmpPercent: "+6.4%",
  },
  {
    company: "NTPC Green Energy Ltd",
    symbol: "NTPCGREEN",
    issueDates: "19 Nov - 22 Nov",
    priceBand: "₹102 - ₹108",
    lotSize: 138,
    issueSize: "₹10,000 Cr",
    status: "UPCOMING",
    gmp: "+₹12",
    gmpPercent: "+11.1%",
  },
  {
    company: "Bajaj Housing Finance Ltd",
    symbol: "BAJAJHFL",
    issueDates: "09 Sep - 11 Sep",
    priceBand: "₹66 - ₹70",
    lotSize: 214,
    issueSize: "₹6,560 Cr",
    status: "LISTED",
    gmp: "+₹75",
    gmpPercent: "+107.1%",
  },
  {
    company: "Premier Energies Ltd",
    symbol: "PREMIERENE",
    issueDates: "27 Aug - 29 Aug",
    priceBand: "₹427 - ₹450",
    lotSize: 33,
    issueSize: "₹2,830 Cr",
    status: "LISTED",
    gmp: "+₹420",
    gmpPercent: "+93.3%",
  },
];

interface EconomicEvent {
  date: string;
  event: string;
  previous: string;
  forecast?: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
}

const ECONOMIC_CALENDAR_EVENTS: EconomicEvent[] = [
  { date: "23 Sept, Wed", event: "Broad Money Supply (M3)", forecast: "-", previous: "10.4% YoY", impact: "LOW" },
  { date: "25 Sept, Fri", event: "FX Reserves (USD)", forecast: "780.78", previous: "US$ bn", impact: "MEDIUM" },
  { date: "27 Sept, Sun", event: "Bank Deposit Growth", forecast: "17.76", previous: "YoY%", impact: "LOW" },
  { date: "27 Sept, Sun", event: "Bank Credit Growth", forecast: "19.08", previous: "YoY%", impact: "LOW" },
  { date: "28 Sept, Mon", event: "Industrial Production", forecast: "6.67", previous: "YoY%", impact: "MEDIUM" },
  { date: "09 Oct, Wed", event: "RBI MPC Repo Rate Decision", forecast: "6.50%", previous: "6.50%", impact: "HIGH" },
  { date: "12 Oct, Sat", event: "Consumer Price Inflation (CPI)", forecast: "3.65%", previous: "3.54%", impact: "HIGH" },
];

interface MarketHoliday {
  date: string;
  day: string;
  occasion: string;
  status: string;
}

const NSE_MARKET_HOLIDAYS: MarketHoliday[] = [
  { date: "02 Oct 2026", day: "Friday", occasion: "Mahatma Gandhi Jayanti", status: "Market Closed" },
  { date: "21 Oct 2026", day: "Wednesday", occasion: "Dussehra", status: "Market Closed" },
  { date: "01 Nov 2026", day: "Sunday", occasion: "Diwali Laxmi Pujan (Muhurat Trading 18:15)", status: "Special Session" },
  { date: "02 Nov 2026", day: "Monday", occasion: "Diwali Balipratipada", status: "Market Closed" },
  { date: "15 Nov 2026", day: "Sunday", occasion: "Guru Nanak Jayanti", status: "Market Closed" },
  { date: "25 Dec 2026", day: "Friday", occasion: "Christmas", status: "Market Closed" },
];

interface EarningsEvent {
  symbol: string;
  company: string;
  date: string;
  period: string;
  consensusEps: string;
}

const EARNINGS_CALENDAR_EVENTS: EarningsEvent[] = [
  { symbol: "TCS", company: "Tata Consultancy Services", date: "10 Oct 2026", period: "Q2 FY27", consensusEps: "₹33.50" },
  { symbol: "INFY", company: "Infosys Ltd", date: "17 Oct 2026", period: "Q2 FY27", consensusEps: "₹15.80" },
  { symbol: "HDFCBANK", company: "HDFC Bank Ltd", date: "19 Oct 2026", period: "Q2 FY27", consensusEps: "₹22.40" },
  { symbol: "RELIANCE", company: "Reliance Industries", date: "21 Oct 2026", period: "Q2 FY27", consensusEps: "₹28.20" },
  { symbol: "ICICIBANK", company: "ICICI Bank Ltd", date: "24 Oct 2026", period: "Q2 FY27", consensusEps: "₹16.50" },
  { symbol: "ITC", company: "ITC Limited", date: "28 Oct 2026", period: "Q2 FY27", consensusEps: "₹4.30" },
];

interface CorporateAction {
  symbol: string;
  company: string;
  type: "DIVIDEND" | "BONUS" | "SPLIT";
  details: string;
  exDate: string;
}

const CORPORATE_ACTIONS_EVENTS: CorporateAction[] = [
  { symbol: "TCS", company: "Tata Consultancy Services", type: "DIVIDEND", details: "Interim Dividend ₹10.00 / share", exDate: "18 Oct 2026" },
  { symbol: "ITC", company: "ITC Ltd", type: "DIVIDEND", details: "Final Dividend ₹7.50 / share", exDate: "24 Oct 2026" },
  { symbol: "TATAMOTORS", company: "Tata Motors Ltd", type: "SPLIT", details: "Sub-division from ₹2 to ₹1 face value", exDate: "02 Nov 2026" },
  { symbol: "BHARTIARTL", company: "Bharti Airtel Ltd", type: "DIVIDEND", details: "Interim Dividend ₹8.00 / share", exDate: "05 Nov 2026" },
  { symbol: "WIPRO", company: "Wipro Limited", type: "BONUS", details: "Bonus Issue 1:1", exDate: "12 Nov 2026" },
];

interface MarketNewsItem {
  id: string;
  title: string;
  source: string;
  timeAgo: string;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  symbol?: string;
}

const MARKET_NEWS_ITEMS: MarketNewsItem[] = [
  { id: "n1", title: "Nifty touches record high as FII inflows surge in financial and IT counters", source: "LiveMint", timeAgo: "14m ago", sentiment: "POSITIVE", symbol: "NIFTY" },
  { id: "n2", title: "Swiggy files updated draft red herring prospectus for upcoming ₹11,300 Cr mega IPO", source: "Economic Times", timeAgo: "42m ago", sentiment: "NEUTRAL", symbol: "SWIGGY" },
  { id: "n3", title: "Tata Motors domestic commercial vehicle sales grow 8.4% YoY in September", source: "CNBC-TV18", timeAgo: "1h ago", sentiment: "POSITIVE", symbol: "TATAMOTORS" },
  { id: "n4", title: "RBI Governor emphasizes vigilant stance on core inflation amid global commodity volatility", source: "Moneycontrol", timeAgo: "2h ago", sentiment: "NEUTRAL" },
  { id: "n5", title: "Brent crude moderates to $74/bbl, easing margin pressure for paint and tyre companies", source: "Reuters", timeAgo: "3h ago", sentiment: "POSITIVE", symbol: "ASIANPAINT" },
];

interface DashboardPageProps {
  onSignOut?: () => void;
}

export default function DashboardPage({ onSignOut }: DashboardPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [userName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("user_name") || "Trader";
    }
    return "Trader";
  });
  const [resetting, setResetting] = useState(false);

  // Kite widget active tab
  type KiteTab = "ipos" | "news" | "economic" | "earnings";
  const [activeKiteTab, setActiveKiteTab] = useState<KiteTab>("economic");
  const [calendarSubView, setCalendarSubView] = useState<"economic" | "holidays">("economic");
  const [earningsSubView, setEarningsSubView] = useState<"earnings" | "actions">("earnings");

  // Market overview chart index selection
  type OverviewIndex = "NIFTY 50" | "SENSEX" | "BANK NIFTY";
  const [selectedIndex, setSelectedIndex] = useState<OverviewIndex>("NIFTY 50");
  const [selectedTimeframe, setSelectedTimeframe] = useState<"1D" | "1W" | "1M" | "1Y">("1D");
  const [hoveredChartPoint, setHoveredChartPoint] = useState<{ price: number; time: string } | null>(null);

  // Trending Sectors Panel state (Kite left sidebar)
  const [sectorSearch, setSectorSearch] = useState<string>("");
  const [sectorFilter, setSectorFilter] = useState<"all" | "gainers" | "losers">("all");

  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("auth_token") ||
        localStorage.getItem("stock-simulator-access-token") ||
        ""
      );
    }
    return "";
  });

  const apiUrl = getApiUrl();

  // 1. Fetch Wallet
  const { data: wallet, refetch: refetchWallet } = useQuery<Wallet>({
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

  // 2. Fetch Portfolio
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

  // Reset simulation handler
  const handleResetSimulation = async () => {
    if (!confirm("Are you sure you want to reset your portfolio and restore ₹10,00,000 cash?")) {
      return;
    }
    setResetting(true);
    try {
      if (token) {
        await fetch(`${apiUrl}/portfolio/reset`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      await refetchWallet();
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["trades"] });
    } catch {
      // ignore
    } finally {
      setResetting(false);
    }
  };

  const quotes = useMultiSymbolQuotes(MASTER_STOCKS_CATALOG.map((s) => s.symbol));

  // Prefetch live real-time quotes for all catalog stocks on mount
  useEffect(() => {
    const catalogSymbols = MASTER_STOCKS_CATALOG.map((s) => s.symbol);
    fetchBatchQuotes(catalogSymbols).catch(() => {});
  }, []);

  // Live Catalog merged with authentic Angel One ticks
  const liveCatalog: WatchlistItem[] = useMemo(() => {
    return MASTER_STOCKS_CATALOG.map((item) => {
      const q = quotes[item.symbol] || (item.symbol === "ZOMATO" ? quotes["ETERNAL"] : undefined) || getCachedQuote(item.symbol);
      if (!q || !q.price_paise) return item;

      const price = q.price_paise / 100;
      const change = q.change_paise !== undefined ? q.change_paise / 100 : +(price - item.price).toFixed(2);
      const changePercent = q.change_percent !== undefined ? q.change_percent : +((change / (price - change || 1)) * 100).toFixed(2);
      const isPositive = changePercent >= 0;

      return {
        ...item,
        price,
        change,
        changePercent: +changePercent.toFixed(2),
        isPositive,
      };
    });
  }, [quotes]);

  // Top Gainers and Top Losers dynamically sorted by live percentage change
  const topGainers = useMemo(() => {
    return [...liveCatalog]
      .filter((s) => s.changePercent >= 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 8);
  }, [liveCatalog]);

  const topLosers = useMemo(() => {
    return [...liveCatalog]
      .filter((s) => s.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 8);
  }, [liveCatalog]);

  // Dynamic Trending Sectors calculated from live stock prices
  const dynamicSectors = useMemo(() => {
    return DASHBOARD_TRENDING_SECTORS.map((sec) => {
      const symbols = SECTOR_CONSTITUENTS[sec.id] || [];
      const constituents = liveCatalog.filter((s) => symbols.includes(s.symbol));
      if (constituents.length === 0) return sec;

      const gainers = constituents.filter((s) => s.isPositive).length;
      const losers = constituents.filter((s) => !s.isPositive).length;
      const avgChange = constituents.reduce((acc, s) => acc + s.changePercent, 0) / constituents.length;
      const sorted = [...constituents].sort((a, b) => b.changePercent - a.changePercent);
      const top = sorted[0];

      const gainerRatio = constituents.length > 0 ? gainers / constituents.length : 0.5;
      const totalTracked = sec.gainersCount + sec.losersCount;
      const dynamicGainersCount = Math.round(totalTracked * gainerRatio);
      const dynamicLosersCount = totalTracked - dynamicGainersCount;

      return {
        ...sec,
        gainersCount: dynamicGainersCount,
        losersCount: dynamicLosersCount,
        changePercent: +avgChange.toFixed(2),
        topStock: top.symbol,
        topStockChange: +top.changePercent.toFixed(2),
      };
    });
  }, [liveCatalog]);

  // Filtered Trending Sectors for Left Sidebar
  const filteredSectors = useMemo(() => {
    return dynamicSectors.filter((s) => {
      const q = sectorSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.shortName.toLowerCase().includes(q) ||
        s.topStock.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (sectorFilter === "gainers") return s.changePercent > 0;
      if (sectorFilter === "losers") return s.changePercent < 0;
      return true;
    });
  }, [dynamicSectors, sectorSearch, sectorFilter]);

  const totalSectorGainers = useMemo(
    () => dynamicSectors.reduce((acc, s) => acc + s.gainersCount, 0),
    [dynamicSectors]
  );
  const totalSectorLosers = useMemo(
    () => dynamicSectors.reduce((acc, s) => acc + s.losersCount, 0),
    [dynamicSectors]
  );
  const totalSectorStocks = totalSectorGainers + totalSectorLosers;
  const overallAdvancePercent =
    totalSectorStocks > 0
      ? Math.round((totalSectorGainers / totalSectorStocks) * 100)
      : 50;

  const indexKey =
    selectedIndex === "NIFTY 50"
      ? "NIFTY"
      : selectedIndex === "SENSEX"
      ? "SENSEX"
      : "BANKNIFTY";

  const { data: indexCandles } = useQuery<Candle[]>({
    queryKey: ["index-candles", indexKey, selectedTimeframe],
    queryFn: async () => {
      try {
        const res = await apiFetch<Candle[]>(`/market/quotes/${indexKey}/history?limit=50`);
        return res || [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  // Market Overview Chart Coordinates & Values Generator
  const chartData = useMemo(() => {
    const liveIdxQuote = quotes[indexKey];
    const livePrice = liveIdxQuote?.price_paise ? liveIdxQuote.price_paise / 100 : 0;
    const liveChange =
      liveIdxQuote?.change_paise !== undefined ? liveIdxQuote.change_paise / 100 : 0;
    const liveChangePercent = liveIdxQuote?.change_percent ?? 0;

    const candles = indexCandles || [];
    if (candles.length === 0) {
      return {
        pts: [],
        min: 0,
        max: 0,
        coords: [],
        linePath: "",
        areaPath: "",
        currentPrice: livePrice,
        firstPrice: livePrice,
        change: liveChange,
        changePercent: liveChangePercent,
      };
    }

    const pts = candles.map((c) => {
      const d = new Date(c.timestamp * 1000);
      const time = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      return { price: c.close_paise / 100, time };
    });

    const prices = pts.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const width = 760;
    const height = 180;
    const padding = 12;

    const coords = pts.map((pt, idx) => {
      const x = (idx / (pts.length - 1 || 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((pt.price - min) / range) * (height - padding * 2);
      return { x, y, pt };
    });

    const linePath = coords.length > 0 ? `M ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ")}` : "";
    const areaPath =
      coords.length > 0
        ? `M ${coords[0].x.toFixed(1)},${height} L ${coords
            .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
            .join(" L ")} L ${coords[coords.length - 1].x.toFixed(1)},${height} Z`
        : "";

    const finalCurrentPrice = livePrice || (pts.length > 0 ? pts[pts.length - 1].price : 0);
    const finalChange = liveChange ?? (pts.length > 1 ? +(pts[pts.length - 1].price - pts[0].price).toFixed(2) : 0);
    const finalChangePercent =
      liveChangePercent ??
      (pts.length > 1 && pts[0].price > 0
        ? +(((pts[pts.length - 1].price - pts[0].price) / pts[0].price) * 100).toFixed(2)
        : 0);

    return {
      pts,
      min,
      max,
      coords,
      linePath,
      areaPath,
      currentPrice: finalCurrentPrice,
      firstPrice: +(finalCurrentPrice - finalChange).toFixed(2),
      change: finalChange,
      changePercent: finalChangePercent,
    };
  }, [indexKey, indexCandles, quotes]);

  const availableBalance = wallet?.available_balance_paise ?? 100000000;
  const cashBalance = wallet?.cash_balance_paise ?? 100000000;
  const unrealizedPnl = portfolio?.unrealized_pnl_paise ?? 0;
  const isProfit = unrealizedPnl >= 0;
  const openPositions = portfolio?.positions ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      <Navbar
        availableBalancePaise={availableBalance}
        unrealizedPnlPaise={unrealizedPnl}
        onResetSimulation={handleResetSimulation}
        onSignOut={onSignOut}
        resetting={resetting}
      />

      <main className="flex-1 max-w-[1720px] w-full mx-auto p-3 sm:p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ========================================================================= */}
          {/* LEFT SIDEBAR: TRENDING SECTORS DESK (Kite Marketwatch Panel Style)        */}
          {/* ========================================================================= */}
          <aside className="w-full lg:w-[420px] xl:w-[450px] shrink-0 lg:sticky lg:top-24 space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
              {/* Header matching Image 1: Sectors trending today */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Sectors trending today
                      </h2>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Sectoral breadth and advancing vs declining ratio
                    </p>
                  </div>
                  <Link
                    href="/stocks"
                    className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>See all sectors</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Market Breadth Summary Ratio Bar */}
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {totalSectorGainers} Advancing ({overallAdvancePercent}%)
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      {totalSectorLosers} Declining ({100 - overallAdvancePercent}%)
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 flex overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${overallAdvancePercent}%` }}
                    />
                    <div
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${100 - overallAdvancePercent}%` }}
                    />
                  </div>
                </div>

                {/* Search & Filter (Kite marketwatch style) */}
                <div className="space-y-2 pt-0.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={sectorSearch}
                      onChange={(e) => setSectorSearch(e.target.value)}
                      placeholder="Search sector or leader (e.g. Auto, TCS)..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px] font-semibold">
                    {(["all", "gainers", "losers"] as const).map((filterKey) => (
                      <button
                        key={filterKey}
                        onClick={() => setSectorFilter(filterKey)}
                        className={`flex-1 py-1 rounded-md transition-all text-center cursor-pointer capitalize ${
                          sectorFilter === filterKey
                            ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs font-bold"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                        }`}
                      >
                        {filterKey === "all"
                          ? `All (${DASHBOARD_TRENDING_SECTORS.length})`
                          : filterKey === "gainers"
                          ? "Bullish"
                          : "Bearish"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table of Sectors */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-50/40 dark:bg-slate-900/40">
                      <th className="py-2 px-3">Sector</th>
                      <th className="py-2 px-2 text-center">Gainers / Losers</th>
                      <th className="py-2 pr-3 text-right">1D Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredSectors.map((sec) => {
                      const Icon = sec.icon;
                      const isGain = sec.changePercent >= 0;
                      const totalInSec = sec.gainersCount + sec.losersCount;
                      const gainerPct =
                        totalInSec > 0 ? (sec.gainersCount / totalInSec) * 100 : 50;

                      return (
                        <tr
                          key={sec.id}
                          className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* Sector Name & Top Leader */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-slate-200/60 dark:border-slate-700/60">
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                                  {sec.name}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  Top Leader:{" "}
                                  <Link
                                    href={`/stocks/${sec.topStock}`}
                                    className="text-slate-600 dark:text-slate-300 font-semibold hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline"
                                  >
                                    {sec.topStock} ({sec.topStockChange >= 0 ? "+" : ""}
                                    {sec.topStockChange}%)
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Gainers / Losers Ratio & Split Bar */}
                          <td className="py-2.5 px-2">
                            <div className="w-20 sm:w-24 mx-auto space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {sec.gainersCount}
                                </span>
                                <span className="text-rose-600 dark:text-rose-400">
                                  {sec.losersCount}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-l-full transition-all"
                                  style={{ width: `${gainerPct}%` }}
                                />
                                <div
                                  className="h-full bg-rose-500 rounded-r-full transition-all"
                                  style={{ width: `${100 - gainerPct}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* 1D Price Change Badge */}
                          <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                            <span
                              className={`inline-block text-[11px] font-bold font-tabular px-1.5 py-0.5 rounded ${
                                isGain
                                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                                  : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40"
                              }`}
                            >
                              {isGain ? "+" : ""}
                              {sec.changePercent.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredSectors.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-xs text-slate-400">
                          No matching sectors found for &quot;{sectorSearch}&quot;
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/50">
                <Link
                  href="/stocks"
                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center justify-center gap-1"
                >
                  <span>Explore all stocks in sector screener</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </aside>

          {/* ========================================================================= */}
          {/* RIGHT MAIN DESK: DASHBOARD CORE                                           */}
          {/* ========================================================================= */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Welcome Header Banner with Quick Reset & Start Investing */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800">
                PRO PAPER TRADING DESK
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                NSE • Live Feed
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                NSE / BSE Live Simulator
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1 flex items-center gap-2">
              <span className="text-slate-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-b dark:from-white dark:via-slate-100 dark:to-slate-400">
                Welcome back,
              </span>{" "}
              <span className="bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(6,182,212,0.35)]">
                {userName}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Execute equities & options trades in real time with ₹10,00,000 virtual capital and institutional order routing.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetSimulation}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shadow-xs"
              title="Reset virtual account balance to ₹10 Lakhs"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-amber-500 ${resetting ? "animate-spin" : ""}`} />
              <span>Reset Funds</span>
            </button>

            <Link
              href="/stocks/ITC"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all hover:scale-105 active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 fill-current text-white" />
              <span>Trade Equities</span>
              <ArrowRight className="w-3.5 h-3.5 text-white" />
            </Link>
          </div>
        </div>

        {/* Top 3 Financial Status Metric Cards (Cleaned up: Removed AI Mentor card) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Available Margin */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <WalletIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                Available Margin
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                Active
              </span>
            </div>
            <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
              {formatPaise(availableBalance)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Total Capital:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300 font-tabular">
                {formatPaise(cashBalance)}
              </span>
            </div>
          </div>

          {/* Unrealized P&L */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                {isProfit ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                )}
                Unrealized P&L
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  isProfit
                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
                }`}
              >
                Open Positions
              </span>
            </div>
            <div
              className={`text-2xl font-black font-tabular ${
                isProfit
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatPaise(unrealizedPnl)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Holdings / Positions:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {openPositions.length} Open
              </span>
            </div>
          </div>

          {/* F&O Chain & Quick Derivatives Access */}
          <Link
            href="/options"
            className="p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 shadow-xs space-y-2 transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                F&O Derivatives Hub
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              Index & Futures Desk
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>NIFTY & BANK NIFTY:</span>
              <span className="font-semibold text-cyan-600 dark:text-cyan-400 group-hover:underline">
                Open Derivatives Hub →
              </span>
            </div>
          </Link>
        </div>

        {/* ========================================================================= */}
        {/* KITE-STYLE MIDDLE SECTION: Gainers / Losers + IPOs / News / Calendar Desk  */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Top Gainers & Top Losers Side-by-Side (7 Cols) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Top Gainers Box */}
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
              <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/80">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                    Top Gainers
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold">
                    Nifty 500
                  </span>
                </div>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 flex-1">
                {topGainers.map((stock) => (
                  <div
                    key={stock.symbol}
                    className="p-2.5 px-3 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/stocks/${stock.symbol}`}
                        className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors"
                      >
                        {stock.symbol}
                      </Link>
                      <div className="text-[10px] uppercase font-mono text-slate-400">
                        {stock.exchange || "NSE"}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-semibold font-tabular text-slate-900 dark:text-slate-100">
                        ₹{stock.price.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5">
                        <span>▲</span>
                        <span>+{stock.changePercent.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-2 border-t border-slate-200 dark:border-slate-800 text-center bg-slate-50/40 dark:bg-slate-900/40">
                <Link
                  href="/stocks"
                  className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  View all gainers →
                </Link>
              </div>
            </div>

            {/* Top Losers Box */}
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
              <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/80">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                    Top Losers
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-semibold">
                    Nifty 500
                  </span>
                </div>
                <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 flex-1">
                {topLosers.map((stock) => (
                  <div
                    key={stock.symbol}
                    className="p-2.5 px-3 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/stocks/${stock.symbol}`}
                        className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors"
                      >
                        {stock.symbol}
                      </Link>
                      <div className="text-[10px] uppercase font-mono text-slate-400">
                        {stock.exchange || "NSE"}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-semibold font-tabular text-slate-900 dark:text-slate-100">
                        ₹{stock.price.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center justify-end gap-0.5">
                        <span>▼</span>
                        <span>{stock.changePercent.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-2 border-t border-slate-200 dark:border-slate-800 text-center bg-slate-50/40 dark:bg-slate-900/40">
                <Link
                  href="/stocks"
                  className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  View all losers →
                </Link>
              </div>
            </div>
          </div>

          {/* RIGHT: Kite Circled Widget (IPOs, News, Economic Calendar + Holidays, Earnings + Actions) (5 Cols) */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            {/* Widget Segmented Tabs Bar (exact Kite style: IPOs | Economic Calendar | Earnings Calendar) */}
            <div className="px-3 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar bg-slate-50/50 dark:bg-slate-900/80">
              <button
                onClick={() => setActiveKiteTab("ipos")}
                className={`pb-2.5 px-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                  activeKiteTab === "ipos"
                    ? "border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                IPOs
              </button>

              <button
                onClick={() => setActiveKiteTab("news")}
                className={`pb-2.5 px-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  activeKiteTab === "news"
                    ? "border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Market News</span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
              </button>

              <button
                onClick={() => setActiveKiteTab("economic")}
                className={`pb-2.5 px-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                  activeKiteTab === "economic"
                    ? "border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Economic Calendar
              </button>

              <button
                onClick={() => setActiveKiteTab("earnings")}
                className={`pb-2.5 px-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                  activeKiteTab === "earnings"
                    ? "border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Earnings & Actions
              </button>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 p-3 overflow-y-auto max-h-[380px]">
              {/* 1. IPOs TAB */}
              {activeKiteTab === "ipos" && (
                <div className="space-y-2.5">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                    <span>Active & Upcoming Issues</span>
                    <span className="font-mono">GMP Premium</span>
                  </div>

                  {KITE_IPOS.map((ipo) => (
                    <div
                      key={ipo.symbol}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 hover:border-cyan-500/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                              {ipo.company}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                ipo.status === "OPEN"
                                  ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                                  : ipo.status === "UPCOMING"
                                  ? "bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400"
                                  : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              {ipo.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Dates: <span className="font-medium text-slate-700 dark:text-slate-300">{ipo.issueDates}</span> • Price: <span className="font-medium text-slate-700 dark:text-slate-300">{ipo.priceBand}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Lot: {ipo.lotSize} shares • Size: {ipo.issueSize}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-bold text-xs text-emerald-600 dark:text-emerald-400 font-tabular">
                            {ipo.gmp}
                          </div>
                          <div className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400">
                            ({ipo.gmpPercent})
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 2. MARKET NEWS TAB */}
              {activeKiteTab === "news" && (
                <div className="space-y-2.5">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                    <span>Breaking Financial News & Catalysts</span>
                    <span>Live</span>
                  </div>

                  {MARKET_NEWS_ITEMS.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 hover:border-cyan-500/40 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {item.title}
                      </p>
                      <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-600 dark:text-slate-300">{item.source}</span>
                          <span>•</span>
                          <span>{item.timeAgo}</span>
                        </div>
                        {item.symbol && (
                          <Link
                            href={`/stocks/${item.symbol}`}
                            className="font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
                          >
                            {item.symbol} →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. ECONOMIC CALENDAR & HOLIDAYS TAB */}
              {activeKiteTab === "economic" && (
                <div className="space-y-3">
                  {/* Sub-selector: Economic Releases vs Exchange Holidays */}
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                    <button
                      onClick={() => setCalendarSubView("economic")}
                      className={`flex-1 py-1 rounded-md transition-all text-center cursor-pointer ${
                        calendarSubView === "economic"
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      Macro Indicators
                    </button>
                    <button
                      onClick={() => setCalendarSubView("holidays")}
                      className={`flex-1 py-1 rounded-md transition-all text-center cursor-pointer ${
                        calendarSubView === "holidays"
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      🏖️ Trading Holidays
                    </button>
                  </div>

                  {calendarSubView === "economic" ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      <div className="grid grid-cols-12 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1">
                        <span className="col-span-4">Date</span>
                        <span className="col-span-5">Event</span>
                        <span className="col-span-3 text-right">Forecast / Prev</span>
                      </div>

                      {ECONOMIC_CALENDAR_EVENTS.map((item, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-12 py-2 items-center text-xs hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <span className="col-span-4 text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                            {item.date}
                          </span>
                          <div className="col-span-5 flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                item.impact === "HIGH"
                                  ? "bg-rose-500"
                                  : item.impact === "MEDIUM"
                                  ? "bg-amber-500"
                                  : "bg-blue-400"
                              }`}
                            />
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {item.event}
                            </span>
                          </div>
                          <div className="col-span-3 text-right text-[11px] font-mono text-slate-600 dark:text-slate-400">
                            {item.forecast !== "-" ? item.forecast : item.previous}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-800">
                        NSE / BSE Official Holiday Calendar
                      </div>

                      {NSE_MARKET_HOLIDAYS.map((h, i) => (
                        <div
                          key={i}
                          className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              {h.occasion}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {h.date} ({h.day})
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              h.status === "Special Session"
                                ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                                : "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400"
                            }`}
                          >
                            {h.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. EARNINGS CALENDAR & CORPORATE ACTIONS TAB */}
              {activeKiteTab === "earnings" && (
                <div className="space-y-3">
                  {/* Sub-selector: Results vs Corporate Actions */}
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                    <button
                      onClick={() => setEarningsSubView("earnings")}
                      className={`flex-1 py-1 rounded-md transition-all text-center cursor-pointer ${
                        earningsSubView === "earnings"
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      Quarterly Results
                    </button>
                    <button
                      onClick={() => setEarningsSubView("actions")}
                      className={`flex-1 py-1 rounded-md transition-all text-center cursor-pointer ${
                        earningsSubView === "actions"
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      Corporate Actions
                    </button>
                  </div>

                  {earningsSubView === "earnings" ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {EARNINGS_CALENDAR_EVENTS.map((e) => (
                        <div
                          key={e.symbol}
                          className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 dark:text-slate-100">
                                {e.symbol}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                ({e.period})
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {e.company}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-semibold text-cyan-600 dark:text-cyan-400 font-tabular">
                              {e.date}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Est. EPS: {e.consensusEps}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {CORPORATE_ACTIONS_EVENTS.map((a, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                                {a.symbol}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  a.type === "DIVIDEND"
                                    ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                                    : a.type === "SPLIT"
                                    ? "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400"
                                    : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                                }`}
                              >
                                {a.type}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Ex-Date: {a.exDate}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                            {a.details}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-center">
              <span className="text-[10px] text-slate-400">
                Data synced live with Indian market calendar & exchange filings
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KITE-STYLE BOTTOM SECTION: Market Overview Chart + Portfolio Anchor        */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Market Overview Chart Widget (8 Cols) - Circled on Kite Image 2 */}
          <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
            {/* Header: Title + Index Switcher + Timeframe */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Market overview
                  </h2>
                </div>

                {/* Index Selector Dropdown / Pills */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                  {(["NIFTY 50", "SENSEX", "BANK NIFTY"] as OverviewIndex[]).map((idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedIndex(idx)}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        selectedIndex === idx
                          ? "bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                      }`}
                    >
                      {idx}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeframe Buttons */}
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                {(["1D", "1W", "1M", "1Y"] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      selectedTimeframe === tf
                        ? "bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 font-bold"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Price & Change Strip */}
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
                  {hoveredChartPoint
                    ? hoveredChartPoint.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                    : chartData.currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className={
                      chartData.change >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }
                  >
                    {chartData.change >= 0 ? "+" : ""}
                    {chartData.change.toFixed(2)} ({chartData.changePercent}%)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {hoveredChartPoint ? `at ${hoveredChartPoint.time}` : "Intraday Trend"}
                  </span>
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-500 font-mono hidden sm:block">
                <div>High: {chartData.max.toFixed(2)}</div>
                <div>Low: {chartData.min.toFixed(2)}</div>
              </div>
            </div>

            {/* SVG Interactive Trend Chart */}
            <div className="relative w-full h-[200px] select-none pt-2">
              {chartData.coords.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-900/10 dark:bg-slate-950/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <TrendingUp className="w-7 h-7 text-slate-400 dark:text-slate-600 mb-1.5 opacity-60" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Index Chart Unavailable</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Historical candle data for {selectedIndex} is not available</p>
                </div>
              ) : (
                <svg
                  viewBox="0 0 760 180"
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="overviewGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal guide lines */}
                  <line x1="0" y1="30" x2="760" y2="30" stroke="currentColor" className="text-slate-100 dark:text-slate-800/60" strokeDasharray="3 3" />
                  <line x1="0" y1="90" x2="760" y2="90" stroke="currentColor" className="text-slate-100 dark:text-slate-800/60" strokeDasharray="3 3" />
                  <line x1="0" y1="150" x2="760" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800/60" strokeDasharray="3 3" />

                  {/* Shaded Area */}
                  <path d={chartData.areaPath} fill="url(#overviewGradient)" />

                  {/* Main Line Curve */}
                  <path
                    d={chartData.linePath}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Interactive cursor points */}
                  {chartData.coords.map((c, i) => (
                    <circle
                      key={i}
                      cx={c.x}
                      cy={c.y}
                      r="4"
                      className="opacity-0 hover:opacity-100 fill-cyan-500 transition-opacity cursor-pointer"
                      onMouseEnter={() => setHoveredChartPoint({ price: c.pt.price, time: c.pt.time })}
                      onMouseLeave={() => setHoveredChartPoint(null)}
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>

          {/* RIGHT: Portfolio Positions / Kite Signature Anchor Widget (4 Cols) */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Positions & Holdings
                </span>
                <Link
                  href="/portfolio"
                  className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  View all →
                </Link>
              </div>

              {openPositions.length === 0 ? (
                /* Kite's Signature Empty Anchor State */
                <div className="py-8 text-center space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                    <Anchor className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      You don&apos;t have any positions yet
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Explore stocks or option contracts to place simulated orders with your ₹10L margin.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 py-2">
                  {openPositions.slice(0, 3).map((pos, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100">{pos.symbol}</span>
                        <div className="text-[10px] text-slate-400">
                          {pos.product} • Qty: {pos.quantity}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-bold font-tabular ${
                            (pos.unrealized_pnl_paise ?? 0) >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {formatPaise(pos.unrealized_pnl_paise ?? 0)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-tabular">
                          LTP: {formatPaise(pos.current_price_paise ?? 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <Link
                href="/stocks/RELIANCE"
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
              >
                <span>Start Investing / Paper Trading</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/orders"
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors text-center"
              >
                <span>View Order Execution Book</span>
              </Link>
            </div>
            </div>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
