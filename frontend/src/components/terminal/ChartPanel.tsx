"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { BarChart2, Activity } from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import { generateSyntheticCandles, INSTRUMENT_METADATA } from "@/lib/mockData";
import type { Candle, Quote } from "@/types";

type ChartPanelProps = {
  symbol: string;
  quote: Quote | null;
  apiUrl: string;
};

const TIMEFRAMES = ["1m", "5m", "15m", "1D"] as const;

export default function ChartPanel({ symbol, quote, apiUrl }: ChartPanelProps) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candlesSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeries = useRef<ISeriesApi<"Line"> | null>(null);

  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [showSMA, setShowSMA] = useState(true);

  // Initialize TradingView Chart
  useEffect(() => {
    if (!container.current) return;

    const instance = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0B0F19" },
        textColor: "#94A3B8",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.4)" },
        horzLines: { color: "rgba(30, 41, 59, 0.4)" },
      },
      crosshair: {
        vertLine: { color: "#38BDF8", width: 1, style: 3 },
        horzLine: { color: "#38BDF8", width: 1, style: 3 },
      },
      timeScale: {
        timeVisible: true,
        borderColor: "#1E293B",
      },
      rightPriceScale: {
        borderColor: "#1E293B",
      },
    });

    chart.current = instance;

    candlesSeries.current = instance.addSeries(CandlestickSeries, {
      upColor: "#10B981",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#EF4444",
    });

    smaSeries.current = instance.addSeries(LineSeries, {
      color: "#06B6D4",
      lineWidth: 2,
      priceLineVisible: false,
    });

    volumeSeries.current = instance.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "#1E293B",
    });

    instance.priceScale("").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const handleResize = () => {
      if (container.current) {
        instance.applyOptions({
          width: container.current.clientWidth,
          height: container.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      instance.remove();
      chart.current = null;
    };
  }, []);

  // Fetch or synthesize candle historical data
  useEffect(() => {
    let cancelled = false;

    fetch(`${apiUrl}/market/quotes/${symbol}/history?limit=150`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) {
          const items: Candle[] = body.data ?? [];
          if (items.length > 0) {
            setCandles(items);
          } else {
            // High-realism synthetic seed if Redis has no history
            const fallback = generateSyntheticCandles(symbol, quote?.price_paise, 120, timeframe);
            setCandles(fallback);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = generateSyntheticCandles(symbol, quote?.price_paise, 120, timeframe);
          setCandles(fallback);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, apiUrl, quote?.price_paise]);

  // Push candles data and calculate SMA
  useEffect(() => {
    if (!candlesSeries.current || !volumeSeries.current || !candles.length) return;

    candlesSeries.current.setData(
      candles.map((c) => ({
        time: c.timestamp as Time,
        open: c.open_paise / 100,
        high: c.high_paise / 100,
        low: c.low_paise / 100,
        close: c.close_paise / 100,
      }))
    );

    volumeSeries.current.setData(
      candles.map((c) => ({
        time: c.timestamp as Time,
        value: c.volume,
        color: c.close_paise >= c.open_paise ? "#064E3B" : "#7F1D1D",
      }))
    );

    // Calculate 20-period SMA
    if (smaSeries.current) {
      if (showSMA && candles.length >= 20) {
        const smaData = [];
        for (let i = 19; i < candles.length; i++) {
          let sum = 0;
          for (let j = i - 19; j <= i; j++) {
            sum += candles[j].close_paise / 100;
          }
          smaData.push({
            time: candles[i].timestamp as Time,
            value: sum / 20,
          });
        }
        smaSeries.current.setData(smaData);
        smaSeries.current.applyOptions({ visible: true });
      } else {
        smaSeries.current.applyOptions({ visible: false });
      }
    }

    chart.current?.timeScale().fitContent();
  }, [candles, showSMA]);

  // Update latest candlestick bar on incoming quote
  useEffect(() => {
    if (!quote || quote.symbol !== symbol || !candlesSeries.current || !candles.length) return;
    const priceRupees = quote.price_paise / 100;
    const last = candles[candles.length - 1];

    candlesSeries.current.update({
      time: last.timestamp as Time,
      open: last.open_paise / 100,
      high: Math.max(last.high_paise / 100, priceRupees),
      low: Math.min(last.low_paise / 100, priceRupees),
      close: priceRupees,
    });
  }, [quote, symbol, candles]);

  const meta = INSTRUMENT_METADATA[symbol] ?? {
    name: symbol,
    basePricePaise: 200000,
    dayChangePercent: 0,
  };

  const lastCandle = candles[candles.length - 1];
  const ltpPaise = quote?.price_paise ?? lastCandle?.close_paise ?? meta.basePricePaise;
  const highPaise = quote?.high_paise ?? lastCandle?.high_paise ?? Math.round(ltpPaise * 1.012);
  const lowPaise = quote?.low_paise ?? lastCandle?.low_paise ?? Math.round(ltpPaise * 0.988);
  const openPaise = quote?.open_paise ?? candles[0]?.open_paise ?? Math.round(ltpPaise * 0.995);

  const dayChangePaise = ltpPaise - openPaise;
  const dayChangePct = openPaise > 0 ? (dayChangePaise / openPaise) * 100 : (quote?.change_percent ?? meta.dayChangePercent);
  const isPositive = dayChangePaise >= 0;

  // Day range percentage (where LTP sits between Low and High)
  const dayRange = Math.max(1, highPaise - lowPaise);
  const dayRangePct = Math.min(100, Math.max(0, ((ltpPaise - lowPaise) / dayRange) * 100));

  return (
    <div className="flex-1 flex flex-col bg-slate-950/60 overflow-hidden relative">
      {/* Chart Control Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-900/40 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-white tracking-wide">{symbol}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">NSE</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{meta.name}</div>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1" />

          {/* Timeframe Buttons */}
          <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 rounded-md font-semibold text-[11px] transition-all ${
                  timeframe === tf
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Indicator Toggles */}
          <button
            onClick={() => setShowSMA(!showSMA)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border font-medium transition-all ${
              showSMA
                ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3 h-3 text-cyan-400" />
            <span>SMA 20</span>
          </button>
        </div>

        {/* Live OHLC & Day Change Header Bar */}
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white font-mono">{formatPaise(ltpPaise)}</span>
            <span
              className={`font-semibold font-mono flex items-center gap-0.5 ${
                isPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {isPositive ? "+" : ""}{formatPaise(dayChangePaise)} ({formatPercent(dayChangePct)})
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2.5 font-mono text-slate-400 border-l border-slate-800 pl-3">
            <span>O: <strong className="text-slate-200">{formatPaise(openPaise)}</strong></span>
            <span>H: <strong className="text-emerald-400">{formatPaise(highPaise)}</strong></span>
            <span>L: <strong className="text-rose-400">{formatPaise(lowPaise)}</strong></span>
          </div>

          {/* Mini Day Range Gauge */}
          <div className="hidden xl:flex flex-col gap-0.5 w-24">
            <div className="flex justify-between text-[9px] text-slate-400">
              <span>L</span>
              <span>Day Range</span>
              <span>H</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-300 rounded-full"
                style={{ width: `${dayRangePct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* TradingView Lightweight Charts Canvas Container */}
      <div ref={container} className="flex-1 w-full h-full relative" />
    </div>
  );
}
