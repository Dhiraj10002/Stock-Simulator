"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Layers, TrendingUp } from "lucide-react";
import { publicFetch } from "@/lib/api";
import {
  eligibleEquities,
  equityUnderlying,
  featuredEquities,
  nativePreviewCandles,
  rankedEquities,
} from "@/lib/fnoStockOverview";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import type { Candle, Instrument, Quote } from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 shadow-xs";
const bounded = <T,>(path: string, signal: AbortSignal) =>
  publicFetch<T>(path, AbortSignal.any([signal, AbortSignal.timeout(8000)]));

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface FnoStaticStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  isGain: boolean;
}

const DEFAULT_FEATURED_STOCKS = [
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    lotSize: 250,
    price: 1226.4,
    change: -17.5,
    changePercent: -1.41,
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
    lotSize: 550,
    price: 731.0,
    change: 18.0,
    changePercent: 2.52,
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
    name: "Tata Consultancy Servic...",
    lotSize: 175,
    price: 2105.0,
    change: -85.0,
    changePercent: -3.88,
    candles: [
      { open: 2190, high: 2195, low: 2170, close: 2175 },
      { open: 2175, high: 2180, low: 2150, close: 2155 },
      { open: 2155, high: 2160, low: 2125, close: 2130 },
      { open: 2130, high: 2135, low: 2095, close: 2100 },
      { open: 2100, high: 2115, low: 2090, close: 2105.0 },
    ],
  },
];

const DEFAULT_GAINERS: FnoStaticStock[] = [
  {
    symbol: "SUPREMEIND",
    name: "Supreme Industries Ltd",
    price: 3580.3,
    change: 235.9,
    changePercent: 7.05,
    volume: "4,69,754",
    isGain: true,
  },
  {
    symbol: "UNOMINDA",
    name: "UNO Minda Ltd",
    price: 1284.0,
    change: 79.0,
    changePercent: 6.56,
    volume: "12,77,954",
    isGain: true,
  },
  {
    symbol: "RVNL",
    name: "Rail Vikas Nigam Ltd",
    price: 214.29,
    change: 12.59,
    changePercent: 6.24,
    volume: "94,69,057",
    isGain: true,
  },
  {
    symbol: "ATHER",
    name: "Ather Energy Ltd",
    price: 1640.0,
    change: 90.0,
    changePercent: 5.81,
    volume: "50,10,015",
    isGain: true,
  },
  {
    symbol: "APLAPOLLO",
    name: "APL Apollo Tubes Ltd",
    price: 2270.1,
    change: 121.6,
    changePercent: 5.66,
    volume: "11,15,754",
    isGain: true,
  },
  {
    symbol: "TATAPOWER",
    name: "Tata Power Co Ltd",
    price: 442.1,
    change: 15.2,
    changePercent: 3.56,
    volume: "82,40,000",
    isGain: true,
  },
];

const DEFAULT_LOSERS: FnoStaticStock[] = [
  {
    symbol: "TATACHEM",
    name: "Tata Chemicals Ltd",
    price: 693.25,
    change: -86.1,
    changePercent: -11.04,
    volume: "68,14,200",
    isGain: false,
  },
  {
    symbol: "GODIGIT",
    name: "Go Digit General Insurance",
    price: 239.0,
    change: -16.2,
    changePercent: -6.46,
    volume: "35,22,100",
    isGain: false,
  },
  {
    symbol: "TATATECH",
    name: "Tata Technologies Ltd",
    price: 722.45,
    change: -36.2,
    changePercent: -4.78,
    volume: "42,80,900",
    isGain: false,
  },
  {
    symbol: "NIACL",
    name: "New India Assurance",
    price: 187.66,
    change: -9.4,
    changePercent: -4.77,
    volume: "24,15,000",
    isGain: false,
  },
  {
    symbol: "INFY",
    name: "Infosys Ltd",
    price: 1842.1,
    change: -42.3,
    changePercent: -2.24,
    volume: "32,15,000",
    isGain: false,
  },
  {
    symbol: "WIPRO",
    name: "Wipro Ltd",
    price: 512.4,
    change: -10.8,
    changePercent: -2.06,
    volume: "28,40,000",
    isGain: false,
  },
];

function MiniCandlestickChart({
  candles,
}: {
  candles: CandleData[];
}) {
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
  const candleGap =
    candles.length > 1
      ? (w - padX * 2 - candles.length * candleW) / (candles.length - 1)
      : 0;

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
            <line
              x1={xCenter}
              y1={yHigh}
              x2={xCenter}
              y2={yLow}
              stroke={color}
              strokeWidth="1.2"
              strokeLinecap="round"
            />
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

function StockCandlesWrapper({
  symbol,
  fallbackCandles,
  active,
  now,
}: {
  symbol: string;
  fallbackCandles: CandleData[];
  active: boolean;
  now: number;
}) {
  const history = useQuery({
    queryKey: ["fno-equities", "daily-history", symbol],
    queryFn: async ({ signal }) => {
      const data = await bounded<
        (Candle & { source?: string; feed_mode?: string })[]
      >(
        `/market/quotes/${encodeURIComponent(symbol)}/history?interval=ONE_DAY&limit=5`,
        signal,
      );
      if (!Array.isArray(data)) throw new Error("Invalid archive response");
      return data;
    },
    enabled: active,
    refetchInterval: active ? 60000 : false,
    retry: false,
  });

  const bars = nativePreviewCandles(
    history.isError ? [] : history.data || [],
    now,
  );

  const candleList: CandleData[] =
    bars.length >= 3
      ? bars.map((b) => ({
          open: b.open_paise / 100,
          high: b.high_paise / 100,
          low: b.low_paise / 100,
          close: b.close_paise / 100,
        }))
      : fallbackCandles;

  return <MiniCandlestickChart candles={candleList} />;
}

export default function FnoStockOverview({
  active,
  futures,
  now,
  onChain,
}: {
  active: boolean;
  futures: Instrument[];
  now: number;
  sessionLive?: boolean;
  onTrade?: (underlying: string) => void;
  onChain?: (symbol: string) => void;
}) {
  const [fnoStockTab, setFnoStockTab] = useState<"GAINERS" | "LOSERS">("GAINERS");

  const catalog = useQuery({
    queryKey: ["fno-equities", "catalog"],
    queryFn: async ({ signal }) =>
      eligibleEquities(
        await bounded<unknown>("/instruments/derivative-stocks", signal),
      ),
    enabled: active,
    refetchInterval: active ? 60000 : false,
    retry: false,
  });

  const stocks = useMemo(
    () => (catalog.isError ? [] : catalog.data || []),
    [catalog.isError, catalog.data],
  );
  const symbols = useMemo(() => stocks.map((i) => i.symbol), [stocks]);
  const stream = useMultiSymbolQuotes(active ? symbols : []);

  const quotes = useQuery({
    queryKey: ["fno-equities", "quotes", symbols],
    queryFn: async ({ signal }) => {
      const chunks = Array.from(
        { length: Math.ceil(symbols.length / 100) },
        (_, i) => symbols.slice(i * 100, (i + 1) * 100),
      );
      const controller = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const result: Record<string, Quote> = {};
      for (let offset = 0; offset < chunks.length; offset += 3) {
        const batches = await Promise.all(
          chunks
            .slice(offset, offset + 3)
            .map((chunk) =>
              bounded<Record<string, Quote>>(
                `/market/quotes/batch?symbols=${encodeURIComponent(chunk.join(","))}`,
                controller,
              ),
            ),
        );
        for (const batch of batches) Object.assign(result, batch);
      }
      return result;
    },
    enabled: active && symbols.length > 0,
    refetchInterval: active ? 20000 : false,
    retry: false,
  });

  const displayQuotes = useMemo(() => {
    const map: Record<string, Quote | undefined> = {};
    for (const sym of symbols) {
      map[sym] = stream[sym] || quotes.data?.[sym];
    }
    return map;
  }, [symbols, stream, quotes.data]);

  const featured = useMemo(() => {
    return featuredEquities(stocks, quotes.data || {});
  }, [stocks, quotes.data]);

  const featuredList = useMemo(() => {
    return DEFAULT_FEATURED_STOCKS.map((fallback) => {
      const matched = featured.find(
        (f) =>
          equityUnderlying(f).toUpperCase() === fallback.symbol.toUpperCase(),
      );
      const liveQuote = matched
        ? displayQuotes[matched.symbol]
        : displayQuotes[fallback.symbol] || displayQuotes[`${fallback.symbol}-EQ`];

      const futMatch = futures.find(
        (fu) =>
          (fu.underlying || "").toUpperCase() === fallback.symbol.toUpperCase(),
      );

      const price = liveQuote && liveQuote.price_paise > 0
        ? liveQuote.price_paise / 100
        : fallback.price;

      const change = liveQuote?.change_paise !== undefined
        ? liveQuote.change_paise / 100
        : fallback.change;

      const changePercent = liveQuote?.change_percent !== undefined
        ? liveQuote.change_percent
        : fallback.changePercent;

      const lot = futMatch?.lot_size || fallback.lotSize;

      return {
        symbol: fallback.symbol,
        name: matched?.name || fallback.name,
        lotSize: lot,
        price,
        change,
        changePercent,
        candles: fallback.candles,
      };
    });
  }, [featured, displayQuotes, futures]);

  useTargetedSubscription(
    active
      ? featuredList.map((f) => f.symbol)
      : [],
  );

  const displayedStocks = useMemo(() => {
    const direction = fnoStockTab === "GAINERS" ? "gainers" : "losers";
    const ranked = rankedEquities(stocks, displayQuotes, direction);

    if (ranked.length >= 6) {
      return ranked.slice(0, 6).map((inst) => {
        const u = equityUnderlying(inst);
        const q = displayQuotes[inst.symbol];
        const isUp = (q?.change_percent ?? 0) >= 0;
        return {
          symbol: u,
          name: inst.name || u,
          price: (q?.price_paise ?? 0) / 100,
          change: (q?.change_paise ?? 0) / 100,
          changePercent: q?.change_percent ?? 0,
          volume:
            q?.volume && q.volume > 0
              ? q.volume.toLocaleString("en-IN")
              : "—",
          isGain: isUp,
        };
      });
    }

    return fnoStockTab === "GAINERS" ? DEFAULT_GAINERS : DEFAULT_LOSERS;
  }, [fnoStockTab, stocks, displayQuotes]);

  return (
    <div className="space-y-6">
      {/* 1. TOP 3 TRENDING STOCK CARDS (RELIANCE, HDFCBANK, TCS) */}
      <section aria-label="Featured F&O stocks" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {featuredList.map((stock) => {
          const isGain = stock.changePercent >= 0;
          return (
            <div
              key={stock.symbol}
              className={`${panel} p-4 flex flex-col justify-between hover:border-cyan-500/50 transition-all`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {stock.symbol}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Lot: {stock.lotSize}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[140px]">
                    {stock.name}
                  </div>
                </div>

                <div className="shrink-0 pt-0.5">
                  <StockCandlesWrapper
                    symbol={stock.symbol}
                    fallbackCandles={stock.candles}
                    active={active}
                    now={now}
                  />
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                <div>
                  <div className="text-base font-black font-tabular text-slate-900 dark:text-slate-100">
                    ₹{stock.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div
                    className={`text-xs font-bold font-tabular flex items-center gap-1 ${
                      isGain
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    <span>
                      {isGain ? "+" : ""}
                      {stock.change.toFixed(2)}
                    </span>
                    <span>
                      ({isGain ? "+" : ""}
                      {stock.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onChain?.(stock.symbol)}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                    title="View Option Chain"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Chain</span>
                  </button>
                  <Link
                    href={`/stocks/${stock.symbol}`}
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
      </section>

      {/* 2. F&O STOCKS TABLE (EXACTLY 6 STOCKS) */}
      <section
        aria-label="F&O stocks"
        className={`${panel} p-5 space-y-4`}
      >
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

          {/* Timeframe + Gainers/Losers Tabs */}
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

        {/* Clean 6-row Table without search or pagination */}
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
              {displayedStocks.map((stock) => {
                const isGain = stock.changePercent >= 0;
                const badge = stock.symbol.slice(0, 2).toUpperCase();
                return (
                  <tr
                    key={stock.symbol}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 font-bold text-xs flex items-center justify-center shrink-0">
                          {badge}
                        </span>
                        <div>
                          <div className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                            {stock.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {stock.symbol} • NSE
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-black font-tabular text-xs text-slate-900 dark:text-slate-100">
                      ₹{stock.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-3 text-right font-bold font-tabular text-xs">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          isGain
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {isGain ? "+" : ""}
                        {stock.change.toFixed(2)} ({isGain ? "+" : ""}
                        {stock.changePercent.toFixed(2)}%)
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
