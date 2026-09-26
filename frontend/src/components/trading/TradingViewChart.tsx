"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  AreaSeries,
  LineSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  Time,
} from "lightweight-charts";
import {
  CandlestickChart,
  AreaChart,
  TrendingUp,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  RefreshCw,
  BarChart3,
  Eye,
  EyeOff,
  Radio,
} from "lucide-react";
import { Candle, Quote } from "@/types";
import {
  formatHistoricalCandles,
  calculateVWAP,
  calculateEMA,
  calculateSMA,
  applyLiveTick,
  FormattedCandle,
} from "@/lib/chartUtils";

export type ChartType = "candle" | "area" | "line";

export interface IndicatorSettings {
  vwap: boolean;
  ema9: boolean;
  ema21: boolean;
  sma50: boolean;
  volume: boolean;
}

interface TradingViewChartProps {
  symbol: string;
  historicalCandles?: Candle[];
  liveQuote?: Quote | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  height?: number;
  className?: string;
  defaultTimeframe?: string;
  onTimeframeChange?: (tf: string) => void;
}

export default function TradingViewChart({
  symbol,
  historicalCandles = [],
  liveQuote,
  isLoading = false,
  onRefresh,
  height = 360,
  className = "",
  defaultTimeframe = "1m",
  onTimeframeChange,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Series references
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area", Time> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);
  const sma50SeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);

  // Chart configuration state
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [timeframe, setTimeframe] = useState<string>(defaultTimeframe);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [indicators, setIndicators] = useState<IndicatorSettings>({
    vwap: false,
    ema9: true,
    ema21: true,
    sma50: false,
    volume: true,
  });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState<boolean>(false);

  // Crosshair legend values
  const [legend, setLegend] = useState<{
    time?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    color?: string;
  } | null>(null);

  // Latest live candle tracking
  const lastCandleRef = useRef<{
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  const [latestBar, setLatestBar] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // Dark mode detection
  const isDarkMode = useCallback(() => {
    if (typeof window === "undefined") return true;
    return (
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }, []);

  // Theme color tokens
  const themeColors = useMemo(() => {
    const dark = isDarkMode();
    return {
      bg: dark ? "#090d16" : "#ffffff",
      text: dark ? "#94a3b8" : "#475569",
      grid: dark ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.6)",
      border: dark ? "#1e293b" : "#e2e8f0",
      upColor: "#10b981", // Emerald 500
      downColor: "#ef4444", // Rose 500
      accentColor: "#06b6d4", // Cyan 500
      crosshair: dark ? "#475569" : "#94a3b8",
    };
  }, [isDarkMode]);

  // Format historical candles for lightweight-charts
  const formattedData = useMemo(() => {
    const raw = formatHistoricalCandles(historicalCandles);
    return raw.map((c) => ({
      ...c,
      time: c.time as UTCTimestamp,
    }));
  }, [historicalCandles]);

  // Indicator Calculations
  const calculatedIndicators = useMemo(() => {
    if (formattedData.length === 0) return { vwap: [], ema9: [], ema21: [], sma50: [] };

    const raw = formattedData as FormattedCandle[];
    const toSeries = (pts: { time: number; value: number }[]) =>
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));

    return {
      vwap: toSeries(calculateVWAP(raw)),
      ema9: toSeries(calculateEMA(raw, 9)),
      ema21: toSeries(calculateEMA(raw, 21)),
      sma50: toSeries(calculateSMA(raw, 50)),
    };
  }, [formattedData]);

  // ---------------------------------------------------------------------------
  // Initialize Chart Instance
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean previous instance if exists
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: isFullscreen ? window.innerHeight - 80 : height,
      layout: {
        background: { type: ColorType.Solid, color: themeColors.bg },
        textColor: themeColors.text,
        fontSize: 11,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      },
      grid: {
        vertLines: { color: themeColors.grid },
        horzLines: { color: themeColors.grid },
      },
      crosshair: {
        vertLine: {
          color: themeColors.crosshair,
          width: 1,
          style: 3, // Dashed
          labelBackgroundColor: "#0891b2",
        },
        horzLine: {
          color: themeColors.crosshair,
          width: 1,
          style: 3,
          labelBackgroundColor: "#0891b2",
        },
      },
      timeScale: {
        borderColor: themeColors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: themeColors.border,
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: themeColors.upColor,
      downColor: themeColors.downColor,
      borderUpColor: themeColors.upColor,
      borderDownColor: themeColors.downColor,
      wickUpColor: themeColors.upColor,
      wickDownColor: themeColors.downColor,
      visible: chartType === "candle",
    });
    candleSeriesRef.current = candleSeries;

    // 2. Area Series (for Area chart mode)
    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: "rgba(6, 182, 212, 0.4)",
      bottomColor: "rgba(6, 182, 212, 0.0)",
      lineColor: themeColors.accentColor,
      lineWidth: 2,
      visible: chartType === "area",
    });
    areaSeriesRef.current = areaSeries;

    // 3. Line Series (for Line chart mode)
    const lineSeries = chart.addSeries(LineSeries, {
      color: themeColors.accentColor,
      lineWidth: 2,
      visible: chartType === "line",
    });
    lineSeriesRef.current = lineSeries;

    // 4. Volume Histogram (Bottom Pane)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "", // Separate overlay pane
      visible: indicators.volume,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.75, // Bottom 25% of chart height
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // 5. Technical Overlays (VWAP, EMA9, EMA21, SMA50)
    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b", // Amber 500
      lineWidth: 1,
      title: "VWAP",
      visible: indicators.vwap,
    });
    vwapSeriesRef.current = vwapSeries;

    const ema9Series = chart.addSeries(LineSeries, {
      color: "#3b82f6", // Blue 500
      lineWidth: 1,
      title: "EMA 9",
      visible: indicators.ema9,
    });
    ema9SeriesRef.current = ema9Series;

    const ema21Series = chart.addSeries(LineSeries, {
      color: "#ec4899", // Pink 500
      lineWidth: 1,
      title: "EMA 21",
      visible: indicators.ema21,
    });
    ema21SeriesRef.current = ema21Series;

    const sma50Series = chart.addSeries(LineSeries, {
      color: "#8b5cf6", // Purple 500
      lineWidth: 1,
      title: "SMA 50",
      visible: indicators.sma50,
    });
    sma50SeriesRef.current = sma50Series;

    // Crosshair move listener for interactive legend
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setLegend(null);
        return;
      }

      const candleData = param.seriesData.get(candleSeries) as {
        open?: number;
        high?: number;
        low?: number;
        close?: number;
      } | undefined;

      const volData = param.seriesData.get(volumeSeries) as {
        value?: number;
      } | undefined;

      if (candleData && candleData.close !== undefined) {
        const isUp = (candleData.close || 0) >= (candleData.open || 0);
        let timeStr = "";
        if (typeof param.time === "number") {
          const d = new Date(param.time * 1000);
          timeStr = d.toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
          });
        }

        setLegend({
          time: timeStr,
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value,
          color: isUp ? themeColors.upColor : themeColors.downColor,
        });
      }
    });

    // ResizeObserver for responsive adaptation
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !chartRef.current) return;
      const { width, height: h } = entries[0].contentRect;
      chartRef.current.applyOptions({
        width: Math.max(width, 200),
        height: isFullscreen ? window.innerHeight - 80 : (h > 0 ? h : height),
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeColors, height, isFullscreen]);

  // ---------------------------------------------------------------------------
  // Load Historical Data into Series
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!chartRef.current || formattedData.length === 0) return;

    // 1. Candlestick Data
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData(
        formattedData.map((d) => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );
    }

    // 2. Area Data
    if (areaSeriesRef.current) {
      areaSeriesRef.current.setData(
        formattedData.map((d) => ({
          time: d.time,
          value: d.close,
        }))
      );
    }

    // 3. Line Data
    if (lineSeriesRef.current) {
      lineSeriesRef.current.setData(
        formattedData.map((d) => ({
          time: d.time,
          value: d.close,
        }))
      );
    }

    // 4. Volume Data with green/red bar colors
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(
        formattedData.map((d) => ({
          time: d.time,
          value: d.volume,
          color:
            d.close >= d.open
              ? "rgba(16, 185, 129, 0.4)" // Soft emerald
              : "rgba(239, 68, 68, 0.4)", // Soft rose
        }))
      );
    }

    // 5. Technical Overlays
    if (vwapSeriesRef.current) {
      vwapSeriesRef.current.setData(calculatedIndicators.vwap);
    }
    if (ema9SeriesRef.current) {
      ema9SeriesRef.current.setData(calculatedIndicators.ema9);
    }
    if (ema21SeriesRef.current) {
      ema21SeriesRef.current.setData(calculatedIndicators.ema21);
    }
    if (sma50SeriesRef.current) {
      sma50SeriesRef.current.setData(calculatedIndicators.sma50);
    }

    // Track latest candle for live updates
    const last = formattedData[formattedData.length - 1];
    lastCandleRef.current = { ...last };
    setLatestBar({
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
    });

    // Auto-fit content to view
    chartRef.current.timeScale().fitContent();
  }, [formattedData, calculatedIndicators]);

  // ---------------------------------------------------------------------------
  // Real-Time Live Tick Streaming into Active Candle Bar
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!liveQuote || liveQuote.price_paise <= 0 || !chartRef.current) return;

    const { candle: updatedCandle } = applyLiveTick(
      lastCandleRef.current
        ? {
            time: lastCandleRef.current.time as number,
            open: lastCandleRef.current.open,
            high: lastCandleRef.current.high,
            low: lastCandleRef.current.low,
            close: lastCandleRef.current.close,
            volume: lastCandleRef.current.volume,
          }
        : null,
      liveQuote.price_paise,
      Math.floor(Date.now() / 1000)
    );

    const barForSeries = {
      ...updatedCandle,
      time: updatedCandle.time as UTCTimestamp,
    };

    lastCandleRef.current = barForSeries;
    setLatestBar({
      open: updatedCandle.open,
      high: updatedCandle.high,
      low: updatedCandle.low,
      close: updatedCandle.close,
      volume: updatedCandle.volume,
    });

    if (candleSeriesRef.current && chartType === "candle") {
      candleSeriesRef.current.update(barForSeries);
    }
    if (areaSeriesRef.current && chartType === "area") {
      areaSeriesRef.current.update({ time: barForSeries.time, value: barForSeries.close });
    }
    if (lineSeriesRef.current && chartType === "line") {
      lineSeriesRef.current.update({ time: barForSeries.time, value: barForSeries.close });
    }
    if (volumeSeriesRef.current && indicators.volume) {
      volumeSeriesRef.current.update({
        time: barForSeries.time,
        value: barForSeries.volume,
        color:
          barForSeries.close >= barForSeries.open
            ? "rgba(16, 185, 129, 0.4)"
            : "rgba(239, 68, 68, 0.4)",
      });
    }
  }, [liveQuote, chartType, indicators.volume]);

  // ---------------------------------------------------------------------------
  // Dynamic Visibility Updates for Chart Type & Indicators
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({ visible: chartType === "candle" });
    }
    if (areaSeriesRef.current) {
      areaSeriesRef.current.applyOptions({ visible: chartType === "area" });
    }
    if (lineSeriesRef.current) {
      lineSeriesRef.current.applyOptions({ visible: chartType === "line" });
    }
  }, [chartType]);

  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: indicators.volume });
    }
    if (vwapSeriesRef.current) {
      vwapSeriesRef.current.applyOptions({ visible: indicators.vwap });
    }
    if (ema9SeriesRef.current) {
      ema9SeriesRef.current.applyOptions({ visible: indicators.ema9 });
    }
    if (ema21SeriesRef.current) {
      ema21SeriesRef.current.applyOptions({ visible: indicators.ema21 });
    }
    if (sma50SeriesRef.current) {
      sma50SeriesRef.current.applyOptions({ visible: indicators.sma50 });
    }
  }, [indicators]);

  const toggleIndicator = (name: keyof IndicatorSettings) => {
    setIndicators((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleTimeframeSelect = (tf: string) => {
    setTimeframe(tf);
    if (onTimeframeChange) {
      onTimeframeChange(tf);
    }
  };

  const hasData = formattedData.length > 0;
  const currentPriceDisplay =
    liveQuote?.price_paise && liveQuote.price_paise > 0
      ? (liveQuote.price_paise / 100).toFixed(2)
      : formattedData.length > 0
      ? formattedData[formattedData.length - 1].close.toFixed(2)
      : null;

  return (
    <div
      className={`flex flex-col bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all relative ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none bg-slate-950 p-4" : ""
      } ${className}`}
    >
      {/* ===================================================================== */}
      {/* TOP CONTROLS TOOLBAR                                                  */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80 text-xs">
        {/* Left: Symbol & Live Status & Timeframe */}
        <div className="flex items-center gap-2">
          {/* Symbol & Price Chip */}
          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
            <span className="font-mono text-cyan-600 dark:text-cyan-400 font-black tracking-wide">
              {symbol}
            </span>
            {currentPriceDisplay && (
              <span className="font-mono text-[13px] font-black tabular-nums">
                ₹{currentPriceDisplay}
              </span>
            )}
          </div>

          {/* Live Tick Stream Badge */}
          {liveQuote && liveQuote.price_paise > 0 ? (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 text-[10px] font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 text-[10px] font-mono">
              <Radio className="w-2.5 h-2.5 opacity-60" />
              <span>SYNTH</span>
            </div>
          )}

          {/* Divider */}
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

          {/* Timeframe Pills */}
          <div className="flex items-center gap-0.5 bg-slate-200/60 dark:bg-slate-800/80 p-0.5 rounded-lg font-mono">
            {["1m", "5m", "15m", "1H", "1D"].map((tf) => (
              <button
                key={tf}
                onClick={() => handleTimeframeSelect(tf)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  timeframe === tf
                    ? "bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Chart Type & Indicators & Actions */}
        <div className="flex items-center gap-1.5">
          {/* Chart Type Toggle */}
          <div className="flex items-center gap-0.5 bg-slate-200/60 dark:bg-slate-800/80 p-0.5 rounded-lg">
            <button
              onClick={() => setChartType("candle")}
              title="Candlestick Chart"
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                chartType === "candle"
                  ? "bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <CandlestickChart className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChartType("area")}
              title="Area Gradient Chart"
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                chartType === "area"
                  ? "bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <AreaChart className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChartType("line")}
              title="Line Chart"
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                chartType === "line"
                  ? "bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Indicators Dropdown Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowIndicatorMenu((prev) => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                showIndicatorMenu || Object.values(indicators).some(Boolean)
                  ? "bg-cyan-50 dark:bg-cyan-950/50 border-cyan-300 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-300"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <SlidersHorizontal className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              <span>Studies</span>
            </button>

            {/* Indicators Popover */}
            {showIndicatorMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-30 space-y-1 text-xs">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  Technical Overlays
                </div>
                {[
                  { key: "volume", label: "Volume (Bars)", color: "#10b981" },
                  { key: "ema9", label: "EMA 9 (Fast)", color: "#3b82f6" },
                  { key: "ema21", label: "EMA 21 (Medium)", color: "#ec4899" },
                  { key: "vwap", label: "VWAP (Day Session)", color: "#f59e0b" },
                  { key: "sma50", label: "SMA 50 (Trend)", color: "#8b5cf6" },
                ].map((ind) => (
                  <button
                    key={ind.key}
                    onClick={() => toggleIndicator(ind.key as keyof IndicatorSettings)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer text-left"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: ind.color }}
                      />
                      <span>{ind.label}</span>
                    </span>
                    {indicators[ind.key as keyof IndicatorSettings] ? (
                      <Eye className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset / Fit Content Button */}
          <button
            onClick={() => {
              if (chartRef.current) {
                chartRef.current.timeScale().fitContent();
              }
            }}
            title="Fit Chart Scale"
            className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* FLOATING CROSSHAIR / TICK LEGEND                                      */}
      {/* ===================================================================== */}
      <div className="px-4 py-1.5 bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800/40 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono">
        {legend ? (
          <>
            <span className="text-slate-400">Time: <span className="text-slate-800 dark:text-slate-200">{legend.time}</span></span>
            <span className="text-slate-400">O: <span className="font-bold" style={{ color: legend.color }}>₹{legend.open?.toFixed(2)}</span></span>
            <span className="text-slate-400">H: <span className="font-bold" style={{ color: legend.color }}>₹{legend.high?.toFixed(2)}</span></span>
            <span className="text-slate-400">L: <span className="font-bold" style={{ color: legend.color }}>₹{legend.low?.toFixed(2)}</span></span>
            <span className="text-slate-400">C: <span className="font-bold" style={{ color: legend.color }}>₹{legend.close?.toFixed(2)}</span></span>
            {legend.volume !== undefined && (
              <span className="text-slate-400">Vol: <span className="text-slate-700 dark:text-slate-300">{legend.volume.toLocaleString("en-IN")}</span></span>
            )}
          </>
        ) : latestBar ? (
          <>
            <span className="text-slate-400">Latest Bar:</span>
            <span className="text-slate-400">O: <span className="text-slate-700 dark:text-slate-300">₹{latestBar.open.toFixed(2)}</span></span>
            <span className="text-slate-400">H: <span className="text-emerald-600 dark:text-emerald-400">₹{latestBar.high.toFixed(2)}</span></span>
            <span className="text-slate-400">L: <span className="text-rose-600 dark:text-rose-400">₹{latestBar.low.toFixed(2)}</span></span>
            <span className="text-slate-400">C: <span className="font-bold text-cyan-600 dark:text-cyan-400">₹{latestBar.close.toFixed(2)}</span></span>
            <span className="text-slate-400">Vol: <span className="text-slate-700 dark:text-slate-300">{latestBar.volume.toLocaleString("en-IN")}</span></span>
          </>
        ) : (
          <span className="text-slate-400 text-[10px]">Move crosshair over candles for OHLC metrics</span>
        )}
      </div>

      {/* ===================================================================== */}
      {/* CANVAS CHART CONTAINER & EXPLICIT UNAVAILABLE STATE                   */}
      {/* ===================================================================== */}
      <div className="relative w-full flex-1 min-h-[300px]" style={{ height: isFullscreen ? "calc(100vh - 80px)" : `${height}px` }}>
        {/* Canvas DOM node */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Graceful Missing History / Awaiting Data State (NO FAKE CANDLES) */}
        {!hasData && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-xs text-center p-6 space-y-3 z-10">
            <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 shadow-lg">
              <BarChart3 className="w-8 h-8 text-cyan-400 opacity-80" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-100">
                Historical Candle Data Unavailable
              </h4>
              <p className="text-xs text-slate-400 max-w-sm">
                No archived 1-minute candles found for <span className="font-mono text-cyan-400 font-bold">{symbol}</span>.
                The live session bar will begin plotting as real tick updates stream in.
              </p>
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry Feed Ingestion</span>
              </button>
            )}
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-xs z-10 text-cyan-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs font-mono font-medium text-slate-300">Streaming 1-minute OHLC archive…</span>
          </div>
        )}
      </div>
    </div>
  );
}
