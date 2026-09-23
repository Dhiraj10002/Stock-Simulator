"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import {
  BarChart2,
  Activity,
  Maximize2,
  Minimize2,
  RotateCcw,
  TrendingUp,
  Clock,
  CandlestickChart,
  Sliders,
  Layers,
  Crosshair,
} from "lucide-react";
import { formatPaise, formatPercent, getIndianMarketStatus } from "@/lib/format";
import { generateSyntheticCandles, INSTRUMENT_METADATA } from "@/lib/mockData";
import type { Candle, Quote } from "@/types";

type ChartPanelProps = {
  symbol: string;
  quote: Quote | null;
  apiUrl: string;
  targetPriceRupees?: number | null;
  stopLossPriceRupees?: number | null;
  entryPriceRupees?: number | null;
};

const TIMEFRAMES = ["1m", "5m", "15m", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type ChartType = "candles" | "area";

interface IndicatorPoint {
  time: Time;
  value: number;
}

interface BollingerPoint {
  time: Time;
  upper: number;
  middle: number;
  lower: number;
}

function calculateEMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close_paise / 100;
  }
  let prevEma = sum / period;
  const result: IndicatorPoint[] = [
    { time: candles[period - 1].timestamp as Time, value: Number(prevEma.toFixed(2)) },
  ];
  for (let i = period; i < candles.length; i++) {
    const close = candles[i].close_paise / 100;
    const currentEma = close * k + prevEma * (1 - k);
    result.push({ time: candles[i].timestamp as Time, value: Number(currentEma.toFixed(2)) });
    prevEma = currentEma;
  }
  return result;
}

function calculateSMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close_paise / 100;
    }
    result.push({
      time: candles[i].timestamp as Time,
      value: Number((sum / period).toFixed(2)),
    });
  }
  return result;
}

function calculateBollingerBands(
  candles: Candle[],
  period = 20,
  multiplier = 2
): { upper: IndicatorPoint[]; middle: IndicatorPoint[]; lower: IndicatorPoint[] } {
  if (candles.length < period) return { upper: [], middle: [], lower: [] };
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close_paise / 100;
    }
    const ma = sum / period;
    let sqDiffSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sqDiffSum += Math.pow(candles[j].close_paise / 100 - ma, 2);
    }
    const stdDev = Math.sqrt(sqDiffSum / period);
    const time = candles[i].timestamp as Time;

    upper.push({ time, value: Number((ma + multiplier * stdDev).toFixed(2)) });
    middle.push({ time, value: Number(ma.toFixed(2)) });
    lower.push({ time, value: Number((ma - multiplier * stdDev).toFixed(2)) });
  }

  return { upper, middle, lower };
}

function calculateVWAP(candles: Candle[]): IndicatorPoint[] {
  let cumulativeTPV = 0;
  let cumulativeVol = 0;
  const result: IndicatorPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tp = (c.high_paise + c.low_paise + c.close_paise) / 300;
    const vol = c.volume || 1;
    cumulativeTPV += tp * vol;
    cumulativeVol += vol;
    const vwap = cumulativeTPV / cumulativeVol;
    result.push({
      time: c.timestamp as Time,
      value: Number(vwap.toFixed(2)),
    });
  }

  return result;
}

function formatVolume(val: number): string {
  if (val >= 10000000) return `${(val / 10000000).toFixed(2)}Cr`;
  if (val >= 100000) return `${(val / 100000).toFixed(2)}L`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return val.toString();
}

export default function ChartPanel({
  symbol,
  quote,
  apiUrl,
  targetPriceRupees,
  stopLossPriceRupees,
  entryPriceRupees,
}: ChartPanelProps) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);

  // Series references
  const candlesSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const areaSeries = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Series = useRef<ISeriesApi<"Line"> | null>(null);
  const sma50Series = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerSeries = useRef<ISeriesApi<"Line"> | null>(null);

  // Visual Order Price Line references
  const targetLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const entryLineRef = useRef<IPriceLine | null>(null);

  // Configuration state
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [dataSource, setDataSource] = useState<"LIVE" | "SYNTHETIC">("LIVE");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Indicators toggle state
  const [showEMA9, setShowEMA9] = useState(false);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);

  // Interactive Crosshair HUD state
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);

  // Bar Countdown Timer state
  const [candleCountdown, setCandleCountdown] = useState<string>("");

  // Ticking candle bar close countdown
  useEffect(() => {
    const updateCountdown = () => {
      const market = getIndianMarketStatus();
      if (!market.isOpen) {
        setCandleCountdown("CLOSED");
        return;
      }

      const now = new Date();
      const nowSec = Math.floor(now.getTime() / 1000);
      let remSec = 0;

      if (timeframe === "1m") {
        remSec = 60 - (nowSec % 60);
      } else if (timeframe === "5m") {
        remSec = 300 - (nowSec % 300);
      } else if (timeframe === "15m") {
        remSec = 900 - (nowSec % 900);
      } else {
        // 1D timeframe countdown to Indian market close at 15:30 IST (UTC 10:00)
        const istMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
        const closeMinutes = 15 * 60 + 30; // 930
        if (istMinutes < closeMinutes) {
          remSec = (closeMinutes - istMinutes) * 60 - now.getUTCSeconds();
        } else {
          remSec = 0;
        }
      }

      const m = Math.floor(remSec / 60);
      const s = remSec % 60;
      const pad = (n: number) => n.toString().padStart(2, "0");
      setCandleCountdown(`${pad(m)}:${pad(s)}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [timeframe]);

  // Handle Fullscreen Esc key binding
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Trigger chart resize when toggling fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (container.current && chart.current) {
        chart.current.applyOptions({
          width: container.current.clientWidth,
          height: container.current.clientHeight,
        });
        chart.current.timeScale().fitContent();
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

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
        vertLines: { color: "rgba(30, 41, 59, 0.35)" },
        horzLines: { color: "rgba(30, 41, 59, 0.35)" },
      },
      crosshair: {
        vertLine: { color: "#38BDF8", width: 1, style: 3 },
        horzLine: { color: "#38BDF8", width: 1, style: 3 },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#1E293B",
      },
      rightPriceScale: {
        borderColor: "#1E293B",
      },
    });

    chart.current = instance;

    // 1. Candlestick Series
    candlesSeries.current = instance.addSeries(CandlestickSeries, {
      upColor: "#10B981",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#EF4444",
    });

    // 2. Area Series (smooth TradingView style)
    areaSeries.current = instance.addSeries(AreaSeries, {
      topColor: "rgba(6, 182, 212, 0.35)",
      bottomColor: "rgba(6, 182, 212, 0.01)",
      lineColor: "#06B6D4",
      lineWidth: 2,
      priceLineVisible: false,
      visible: false,
    });

    // 3. Volume Histogram
    volumeSeries.current = instance.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "#1E293B",
    });

    instance.priceScale("").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // 4. Indicators Series
    ema9Series.current = instance.addSeries(LineSeries, {
      color: "#F59E0B", // Amber
      lineWidth: 2,
      priceLineVisible: false,
      title: "EMA 9",
    });

    ema21Series.current = instance.addSeries(LineSeries, {
      color: "#06B6D4", // Cyan
      lineWidth: 2,
      priceLineVisible: false,
      title: "EMA 21",
    });

    sma50Series.current = instance.addSeries(LineSeries, {
      color: "#3B82F6", // Blue
      lineWidth: 2,
      priceLineVisible: false,
      title: "SMA 50",
    });

    vwapSeries.current = instance.addSeries(LineSeries, {
      color: "#EC4899", // Pink
      lineWidth: 2,
      priceLineVisible: false,
      title: "VWAP",
    });

    bbUpperSeries.current = instance.addSeries(LineSeries, {
      color: "#A855F7", // Purple
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      title: "BB Upper",
    });

    bbMiddleSeries.current = instance.addSeries(LineSeries, {
      color: "#818CF8", // Indigo
      lineWidth: 1,
      priceLineVisible: false,
      title: "BB Middle",
    });

    bbLowerSeries.current = instance.addSeries(LineSeries, {
      color: "#A855F7", // Purple
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      title: "BB Lower",
    });

    // Crosshair move subscriber for interactive HUD
    instance.subscribeCrosshairMove((param) => {
      if (param.time) {
        setHoveredTimestamp(Number(param.time));
      } else {
        setHoveredTimestamp(null);
      }
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
            setDataSource("LIVE");
          } else {
            const fallback = generateSyntheticCandles(symbol, quote?.price_paise, 120, timeframe);
            setCandles(fallback);
            setDataSource("SYNTHETIC");
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = generateSyntheticCandles(symbol, quote?.price_paise, 120, timeframe);
          setCandles(fallback);
          setDataSource("SYNTHETIC");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, apiUrl, quote?.price_paise]);

  // Precompute indicator values for candle array
  const indicatorMaps = useMemo(() => {
    if (!candles.length) {
      return {
        ema9Map: new Map<number, number>(),
        ema21Map: new Map<number, number>(),
        sma50Map: new Map<number, number>(),
        vwapMap: new Map<number, number>(),
        bbMap: new Map<number, { upper: number; middle: number; lower: number }>(),
      };
    }

    const ema9 = calculateEMA(candles, 9);
    const ema21 = calculateEMA(candles, 21);
    const sma50 = calculateSMA(candles, 50);
    const vwap = calculateVWAP(candles);
    const bb = calculateBollingerBands(candles, 20, 2);

    const ema9Map = new Map<number, number>();
    ema9.forEach((p) => ema9Map.set(Number(p.time), p.value));

    const ema21Map = new Map<number, number>();
    ema21.forEach((p) => ema21Map.set(Number(p.time), p.value));

    const sma50Map = new Map<number, number>();
    sma50.forEach((p) => sma50Map.set(Number(p.time), p.value));

    const vwapMap = new Map<number, number>();
    vwap.forEach((p) => vwapMap.set(Number(p.time), p.value));

    const bbMap = new Map<number, { upper: number; middle: number; lower: number }>();
    for (let i = 0; i < bb.upper.length; i++) {
      bbMap.set(Number(bb.upper[i].time), {
        upper: bb.upper[i].value,
        middle: bb.middle[i].value,
        lower: bb.lower[i].value,
      });
    }

    return { ema9, ema21, sma50, vwap, bb, ema9Map, ema21Map, sma50Map, vwapMap, bbMap };
  }, [candles]);

  // Map candles by timestamp for instantaneous crosshair HUD lookup
  const candlesMap = useMemo(() => {
    const map = new Map<number, Candle>();
    candles.forEach((c) => map.set(c.timestamp, c));
    return map;
  }, [candles]);

  // Toggle chart series visibility between Candlestick and Area
  useEffect(() => {
    if (candlesSeries.current && areaSeries.current) {
      candlesSeries.current.applyOptions({ visible: chartType === "candles" });
      areaSeries.current.applyOptions({ visible: chartType === "area" });
    }
  }, [chartType]);

  // Push candles, area, and indicators data to chart series
  useEffect(() => {
    if (!candlesSeries.current || !areaSeries.current || !volumeSeries.current || !candles.length) return;

    // 1. Candlestick Series Data
    const formattedCandles = candles.map((c) => ({
      time: c.timestamp as Time,
      open: c.open_paise / 100,
      high: c.high_paise / 100,
      low: c.low_paise / 100,
      close: c.close_paise / 100,
    }));
    candlesSeries.current.setData(formattedCandles);

    // 2. Area Series Data
    const areaData = candles.map((c) => ({
      time: c.timestamp as Time,
      value: c.close_paise / 100,
    }));
    areaSeries.current.setData(areaData);

    // 3. Volume Series Data
    volumeSeries.current.setData(
      candles.map((c) => ({
        time: c.timestamp as Time,
        value: c.volume,
        color: c.close_paise >= c.open_paise ? "rgba(16, 185, 129, 0.45)" : "rgba(239, 68, 68, 0.45)",
      }))
    );

    // 4. EMA 9
    if (ema9Series.current && indicatorMaps.ema9) {
      ema9Series.current.setData(indicatorMaps.ema9);
      ema9Series.current.applyOptions({ visible: showEMA9 });
    }

    // 5. EMA 21
    if (ema21Series.current && indicatorMaps.ema21) {
      ema21Series.current.setData(indicatorMaps.ema21);
      ema21Series.current.applyOptions({ visible: showEMA21 });
    }

    // 6. SMA 50
    if (sma50Series.current && indicatorMaps.sma50) {
      sma50Series.current.setData(indicatorMaps.sma50);
      sma50Series.current.applyOptions({ visible: showSMA50 });
    }

    // 7. VWAP
    if (vwapSeries.current && indicatorMaps.vwap) {
      vwapSeries.current.setData(indicatorMaps.vwap);
      vwapSeries.current.applyOptions({ visible: showVWAP });
    }

    // 8. Bollinger Bands
    if (bbUpperSeries.current && bbMiddleSeries.current && bbLowerSeries.current && indicatorMaps.bb) {
      bbUpperSeries.current.setData(indicatorMaps.bb.upper);
      bbMiddleSeries.current.setData(indicatorMaps.bb.middle);
      bbLowerSeries.current.setData(indicatorMaps.bb.lower);

      bbUpperSeries.current.applyOptions({ visible: showBollinger });
      bbMiddleSeries.current.applyOptions({ visible: showBollinger });
      bbLowerSeries.current.applyOptions({ visible: showBollinger });
    }

    chart.current?.timeScale().fitContent();
  }, [
    candles,
    indicatorMaps,
    showEMA9,
    showEMA21,
    showSMA50,
    showVWAP,
    showBollinger,
  ]);

  // Update latest candlestick & area point on incoming live quote
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

    if (areaSeries.current) {
      areaSeries.current.update({
        time: last.timestamp as Time,
        value: priceRupees,
      });
    }
  }, [quote, symbol, candles]);

  // Fit content callback
  const handleFitContent = useCallback(() => {
    chart.current?.timeScale().fitContent();
  }, []);

  // Manage Interactive Visual Order Price Lines (Target, Stop-Loss, Position Entry)
  useEffect(() => {
    const series = candlesSeries.current;
    if (!series) return;

    // 1. Target Price Line
    if (targetLineRef.current) {
      series.removePriceLine(targetLineRef.current);
      targetLineRef.current = null;
    }
    if (targetPriceRupees && targetPriceRupees > 0) {
      targetLineRef.current = series.createPriceLine({
        price: targetPriceRupees,
        color: "#10B981",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TARGET ₹${targetPriceRupees.toFixed(2)}`,
      });
    }

    // 2. Stop-Loss Price Line
    if (slLineRef.current) {
      series.removePriceLine(slLineRef.current);
      slLineRef.current = null;
    }
    if (stopLossPriceRupees && stopLossPriceRupees > 0) {
      slLineRef.current = series.createPriceLine({
        price: stopLossPriceRupees,
        color: "#EF4444",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SL ₹${stopLossPriceRupees.toFixed(2)}`,
      });
    }

    // 3. Position Entry Price Line
    if (entryLineRef.current) {
      series.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (entryPriceRupees && entryPriceRupees > 0) {
      entryLineRef.current = series.createPriceLine({
        price: entryPriceRupees,
        color: "#38BDF8",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `AVG ENTRY ₹${entryPriceRupees.toFixed(2)}`,
      });
    }

    return () => {
      if (series) {
        if (targetLineRef.current) {
          series.removePriceLine(targetLineRef.current);
          targetLineRef.current = null;
        }
        if (slLineRef.current) {
          series.removePriceLine(slLineRef.current);
          slLineRef.current = null;
        }
        if (entryLineRef.current) {
          series.removePriceLine(entryLineRef.current);
          entryLineRef.current = null;
        }
      }
    };
  }, [symbol, targetPriceRupees, stopLossPriceRupees, entryPriceRupees]);

  const meta = INSTRUMENT_METADATA[symbol] ?? {
    name: symbol,
    basePricePaise: 200000,
    dayChangePercent: 0,
  };

  const lastCandle = candles[candles.length - 1];
  const activeCandle = hoveredTimestamp ? candlesMap.get(hoveredTimestamp) ?? lastCandle : lastCandle;

  const ltpPaise = quote?.price_paise ?? lastCandle?.close_paise ?? meta.basePricePaise;
  const highPaise = quote?.high_paise ?? lastCandle?.high_paise ?? Math.round(ltpPaise * 1.012);
  const lowPaise = quote?.low_paise ?? lastCandle?.low_paise ?? Math.round(ltpPaise * 0.988);
  const openPaise = quote?.open_paise ?? candles[0]?.open_paise ?? Math.round(ltpPaise * 0.995);

  const dayChangePaise = ltpPaise - openPaise;
  const dayChangePct =
    openPaise > 0 ? (dayChangePaise / openPaise) * 100 : quote?.change_percent ?? meta.dayChangePercent;
  const isPositive = dayChangePaise >= 0;

  // Day range percentage
  const dayRange = Math.max(1, highPaise - lowPaise);
  const dayRangePct = Math.min(100, Math.max(0, ((ltpPaise - lowPaise) / dayRange) * 100));

  // Current active bar indicator values for HUD
  const activeTimestamp = activeCandle ? activeCandle.timestamp : null;
  const activeEMA9 = activeTimestamp ? indicatorMaps.ema9Map.get(activeTimestamp) : undefined;
  const activeEMA21 = activeTimestamp ? indicatorMaps.ema21Map.get(activeTimestamp) : undefined;
  const activeSMA50 = activeTimestamp ? indicatorMaps.sma50Map.get(activeTimestamp) : undefined;
  const activeVWAP = activeTimestamp ? indicatorMaps.vwapMap.get(activeTimestamp) : undefined;
  const activeBB = activeTimestamp ? indicatorMaps.bbMap.get(activeTimestamp) : undefined;

  // Active bar change calculation
  const candleChangePaise = activeCandle ? activeCandle.close_paise - activeCandle.open_paise : 0;
  const candleChangePct =
    activeCandle && activeCandle.open_paise > 0
      ? (candleChangePaise / activeCandle.open_paise) * 100
      : 0;

  return (
    <div
      className={`flex flex-col bg-slate-950/60 overflow-hidden relative ${
        isFullscreen ? "fixed inset-0 z-50 bg-[#0B0F19] p-3 shadow-2xl" : "flex-1 w-full h-full"
      }`}
    >
      {/* Chart Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-900/40 text-xs gap-2">
        {/* Left: Symbol Info, Timeframes, Chart Type */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-white tracking-wide">{symbol}</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                  NSE
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-medium flex items-center gap-1 ${
                    dataSource === "LIVE"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}
                  title={
                    dataSource === "LIVE"
                      ? "Streaming live market history data"
                      : "Simulated market history ticks"
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      dataSource === "LIVE" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                    }`}
                  />
                  {dataSource === "LIVE" ? "LIVE" : "SIM"}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 truncate max-w-[130px]">{meta.name}</div>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

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

          {/* Live Bar Countdown / Closed Badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono ${
              candleCountdown === "CLOSED"
                ? "bg-amber-950/50 border-amber-500/30 text-amber-300"
                : "bg-slate-900 border-slate-800 text-slate-300"
            }`}
            title={
              candleCountdown === "CLOSED"
                ? "Market Closed (Session ended 15:30 IST)"
                : `Time remaining until ${timeframe} bar closes`
            }
          >
            <Clock
              className={`w-3 h-3 ${
                candleCountdown === "CLOSED" ? "text-amber-400" : "text-cyan-400 animate-pulse"
              }`}
            />
            <span>{candleCountdown}</span>
          </div>

          {/* Chart Type Switcher: Candles vs Area */}
          <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setChartType("candles")}
              className={`p-1 rounded-md transition-all ${
                chartType === "candles"
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Candlestick Chart"
            >
              <CandlestickChart className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChartType("area")}
              className={`p-1 rounded-md transition-all ${
                chartType === "area"
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Area Mountain Chart"
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          {/* Technical Indicators Toggle Pills */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setShowEMA9(!showEMA9)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                showEMA9
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-sm"
                  : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
              EMA 9
            </button>

            <button
              onClick={() => setShowEMA21(!showEMA21)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                showEMA21
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-sm"
                  : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4]" />
              EMA 21
            </button>

            <button
              onClick={() => setShowSMA50(!showSMA50)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                showSMA50
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-sm"
                  : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
              SMA 50
            </button>

            <button
              onClick={() => setShowVWAP(!showVWAP)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                showVWAP
                  ? "bg-pink-500/20 border-pink-500/40 text-pink-300 shadow-sm"
                  : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#EC4899]" />
              VWAP
            </button>

            <button
              onClick={() => setShowBollinger(!showBollinger)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                showBollinger
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300 shadow-sm"
                  : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
              BB 20
            </button>
          </div>

          {/* Active Visual Order Levels Badges */}
          {(targetPriceRupees || stopLossPriceRupees || entryPriceRupees) && (
            <div className="hidden xl:flex items-center gap-1 border-l border-slate-800 pl-1.5 font-mono text-[10px]">
              {targetPriceRupees && targetPriceRupees > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold">
                  TGT: ₹{targetPriceRupees.toFixed(2)}
                </span>
              )}
              {stopLossPriceRupees && stopLossPriceRupees > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 font-bold">
                  SL: ₹{stopLossPriceRupees.toFixed(2)}
                </span>
              )}
              {entryPriceRupees && entryPriceRupees > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-sky-950/60 border border-sky-500/40 text-sky-300 font-bold">
                  AVG: ₹{entryPriceRupees.toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Live Quote, Range, Fit Zoom & Fullscreen Buttons */}
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white font-mono">{formatPaise(ltpPaise)}</span>
            <span
              className={`font-semibold font-mono flex items-center gap-0.5 ${
                isPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {isPositive ? "+" : ""}
              {formatPaise(dayChangePaise)} ({formatPercent(dayChangePct)})
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 font-mono text-slate-400 border-l border-slate-800 pl-2.5">
            <span>
              O: <strong className="text-slate-200">{formatPaise(openPaise)}</strong>
            </span>
            <span>
              H: <strong className="text-emerald-400">{formatPaise(highPaise)}</strong>
            </span>
            <span>
              L: <strong className="text-rose-400">{formatPaise(lowPaise)}</strong>
            </span>
          </div>

          {/* Mini Day Range Gauge */}
          <div className="hidden xl:flex flex-col gap-0.5 w-20">
            <div className="flex justify-between text-[8px] text-slate-500">
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

          <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
            {/* Reset Zoom / Fit Content */}
            <button
              onClick={handleFitContent}
              className="p-1.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-all"
              title="Reset Zoom / Fit Content"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-all"
              title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen Chart"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Crosshair Glassmorphic HUD Ribbon */}
      <div className="absolute top-12 left-4 z-10 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-slate-300 shadow-xl">
        {activeCandle && (
          <>
            <div className="text-slate-400 font-medium">
              {new Date(activeCandle.timestamp * 1000).toLocaleString("en-IN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">O:</span>
              <span className="text-slate-200">₹{(activeCandle.open_paise / 100).toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">H:</span>
              <span className="text-emerald-400">₹{(activeCandle.high_paise / 100).toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">L:</span>
              <span className="text-rose-400">₹{(activeCandle.low_paise / 100).toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">C:</span>
              <span className={candleChangePaise >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                ₹{(activeCandle.close_paise / 100).toFixed(2)}
              </span>
            </div>

            <div className={`font-semibold ${candleChangePaise >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {candleChangePaise >= 0 ? "+" : ""}
              ₹{(candleChangePaise / 100).toFixed(2)} ({formatPercent(candleChangePct)})
            </div>

            <div className="flex items-center gap-1 border-l border-slate-800 pl-2 text-slate-400">
              <span className="text-slate-500">Vol:</span>
              <span>{formatVolume(activeCandle.volume)}</span>
            </div>
          </>
        )}

        {/* Dynamic Indicator Values at hovered bar */}
        {showEMA9 && activeEMA9 !== undefined && (
          <div className="flex items-center gap-1 border-l border-slate-800 pl-2 text-[#F59E0B]">
            <span className="text-[9px] opacity-70">EMA9:</span>
            <span>₹{activeEMA9.toFixed(2)}</span>
          </div>
        )}

        {showEMA21 && activeEMA21 !== undefined && (
          <div className="flex items-center gap-1 border-l border-slate-800 pl-2 text-[#06B6D4]">
            <span className="text-[9px] opacity-70">EMA21:</span>
            <span>₹{activeEMA21.toFixed(2)}</span>
          </div>
        )}

        {showSMA50 && activeSMA50 !== undefined && (
          <div className="flex items-center gap-1 border-l border-slate-800 pl-2 text-[#3B82F6]">
            <span className="text-[9px] opacity-70">SMA50:</span>
            <span>₹{activeSMA50.toFixed(2)}</span>
          </div>
        )}

        {showVWAP && activeVWAP !== undefined && (
          <div className="flex items-center gap-1 border-l border-slate-800 pl-2 text-[#EC4899]">
            <span className="text-[9px] opacity-70">VWAP:</span>
            <span>₹{activeVWAP.toFixed(2)}</span>
          </div>
        )}

        {showBollinger && activeBB && (
          <div className="flex items-center gap-1 border-l border-slate-800 pl-2 text-[#A855F7]">
            <span className="text-[9px] opacity-70">BB(20):</span>
            <span>
              [₹{activeBB.upper.toFixed(1)}, ₹{activeBB.middle.toFixed(1)}, ₹{activeBB.lower.toFixed(1)}]
            </span>
          </div>
        )}
      </div>

      {/* TradingView Lightweight Charts Canvas Container */}
      <div ref={container} className="flex-1 w-full h-full relative" />
    </div>
  );
}
