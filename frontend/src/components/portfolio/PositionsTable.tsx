"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowRightLeft,
  Zap,
  Briefcase,
  Flame,
  AlertTriangle,
} from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import { useMarketStore } from "@/stores/market-store";
import { resolveCanonicalSymbol } from "@/lib/alias";
import type { Position } from "@/types";

type SegmentFilter = "ALL" | "DELIVERY" | "INTRADAY" | "FNO";

type PositionsTableProps = {
  positions: Position[];
  onSquareOff: (position: Position) => void;
  onSquareOffAllMIS?: () => void;
};

function resolvePositionProduct(pos: Position): "DELIVERY" | "INTRADAY" | "FNO" {
  if (pos.product === "DELIVERY" || pos.product === "INTRADAY" || pos.product === "FNO") {
    return pos.product;
  }
  const upper = (pos.symbol || "").toUpperCase();
  if (
    upper.includes("CE") ||
    upper.includes("PE") ||
    upper.includes("FUT") ||
    upper.includes("OPT")
  ) {
    return "FNO";
  }
  return "DELIVERY";
}

export default function PositionsTable({
  positions = [],
  onSquareOff,
  onSquareOffAllMIS,
}: PositionsTableProps) {
  const [activeSegment, setActiveSegment] = useState<SegmentFilter>("ALL");
  const [squaringOff, setSquaringOff] = useState<string | null>(null);
  const [bulkClosing, setBulkClosing] = useState(false);

  const quotes = useMarketStore((s) => s.quotes);

  // Normalize positions and reprice from live quote stream if available
  const normalizedPositions = useMemo(() => {
    return positions.map((p) => {
      const prod = resolvePositionProduct(p);
      const canonical = resolveCanonicalSymbol(p.symbol);
      const liveQuote = quotes[p.symbol] || quotes[canonical];

      let currentPricePaise = p.current_price_paise;
      let quoteStatus = p.quote_status || (p.current_price_paise > 0 ? "FRESH" : "UNAVAILABLE");
      let isAvailable = p.is_quote_available ?? (p.current_price_paise > 0);
      const isStale = p.is_quote_stale ?? false;

      if (liveQuote && liveQuote.price_paise > 0) {
        currentPricePaise = liveQuote.price_paise;
        isAvailable = true;
        quoteStatus = "FRESH";
      }

      const qty = p.quantity;
      const avg = p.average_price_paise;
      let currentValuePaise = p.current_value_paise;
      let unrealizedPnlPaise = p.unrealized_pnl_paise;

      if (isAvailable && currentPricePaise > 0) {
        currentValuePaise = Math.abs(qty) * currentPricePaise;
        if (qty < 0) {
          // Short position: gains when market price drops below average entry
          unrealizedPnlPaise = (avg - currentPricePaise) * Math.abs(qty);
        } else {
          // Long position: gains when market price rises above average entry
          unrealizedPnlPaise = (currentPricePaise - avg) * qty;
        }
      }

      return {
        ...p,
        product: prod,
        current_price_paise: currentPricePaise,
        current_value_paise: currentValuePaise,
        unrealized_pnl_paise: unrealizedPnlPaise,
        quote_status: quoteStatus,
        is_quote_available: isAvailable,
        is_quote_stale: isStale,
      };
    });
  }, [positions, quotes]);

  // Filter positions by segment
  const filteredPositions = useMemo(() => {
    if (activeSegment === "ALL") return normalizedPositions;
    return normalizedPositions.filter((p) => p.product === activeSegment);
  }, [normalizedPositions, activeSegment]);

  // Segment KPI aggregations
  const segmentStats = useMemo(() => {
    let invested = 0;
    let current = 0;
    let pnl = 0;

    filteredPositions.forEach((pos) => {
      const posInvested =
        pos.invested_value_paise || pos.average_price_paise * Math.abs(pos.quantity);
      invested += posInvested;
      if (pos.is_quote_available !== false && pos.quote_status !== "UNAVAILABLE") {
        current += pos.current_value_paise || (pos.current_price_paise * Math.abs(pos.quantity));
        pnl += pos.unrealized_pnl_paise;
      }
    });

    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPercent };
  }, [filteredPositions]);

  const handleSquareOffSingle = async (pos: Position) => {
    setSquaringOff(pos.uuid);
    try {
      await onSquareOff(pos);
    } finally {
      setSquaringOff(null);
    }
  };

  const handleBulkSquareOffSegment = async () => {
    if (filteredPositions.length === 0) return;
    if (activeSegment === "INTRADAY" && onSquareOffAllMIS) {
      onSquareOffAllMIS();
      return;
    }

    setBulkClosing(true);
    try {
      for (const pos of filteredPositions) {
        if (pos.quantity !== 0) {
          await onSquareOff(pos);
        }
      }
    } finally {
      setBulkClosing(false);
    }
  };

  const hasMIS = normalizedPositions.some((p) => p.product === "INTRADAY" && p.quantity !== 0);

  const segmentCounts = useMemo(() => {
    return {
      ALL: normalizedPositions.length,
      DELIVERY: normalizedPositions.filter((p) => p.product === "DELIVERY").length,
      INTRADAY: normalizedPositions.filter((p) => p.product === "INTRADAY").length,
      FNO: normalizedPositions.filter((p) => p.product === "FNO").length,
    };
  }, [normalizedPositions]);

  if (!positions || positions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 min-h-[220px] bg-white dark:bg-slate-950/60">
        <Layers className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2 stroke-[1.5]" />
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-300">No Active Positions</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mt-1">
          Execute a Delivery (CNC), Intraday (MIS), or F&O contract order from the right ticket to track live P&L.
        </p>
      </div>
    );
  }

  const isSegmentProfit = segmentStats.pnl >= 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-950/60 font-sans text-slate-900 dark:text-slate-100">
      {/* Segment Header & Filter Strip */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2.5 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800/80 gap-2 shrink-0">
        {/* Segment Tabs */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: "ALL", label: "ALL", icon: Layers },
              { id: "DELIVERY", label: "CNC Delivery", icon: Briefcase },
              { id: "INTRADAY", label: "MIS Intraday", icon: Zap },
              { id: "FNO", label: "F&O Derivatives", icon: Flame },
            ] as const
          ).map((tab) => {
            const isActive = activeSegment === tab.id;
            const count = segmentCounts[tab.id];
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSegment(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-cyan-600 text-white dark:bg-slate-800 dark:text-cyan-300 border border-cyan-700 dark:border-slate-700 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive
                      ? "bg-cyan-700/80 text-white dark:bg-cyan-950 dark:text-cyan-300"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Live Segment KPI Badge & Bulk Square-Off Trigger */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2.5 text-xs bg-white dark:bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 font-mono font-tabular shadow-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Inv: <strong className="text-slate-800 dark:text-slate-200 font-bold">{formatPaise(segmentStats.invested)}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Val: <strong className="text-slate-800 dark:text-slate-200 font-bold">{formatPaise(segmentStats.current)}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span
              className={`font-bold flex items-center gap-1 ${
                isSegmentProfit
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {isSegmentProfit ? "+" : ""}
              {formatPaise(segmentStats.pnl)} ({formatPercent(segmentStats.pnlPercent)})
            </span>
          </div>

          {/* Bulk Segment Square-Off Button */}
          {filteredPositions.length > 0 && (
            <button
              onClick={handleBulkSquareOffSegment}
              disabled={bulkClosing}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border disabled:opacity-50 cursor-pointer shadow-xs ${
                activeSegment === "INTRADAY"
                  ? "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300"
                  : "bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-300"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {bulkClosing
                ? "Closing..."
                : activeSegment === "ALL"
                ? "Square Off All"
                : `Exit All ${activeSegment}`}
            </button>
          )}
        </div>
      </div>

      {/* Intraday MIS Alert banner if applicable */}
      {hasMIS && activeSegment === "INTRADAY" && onSquareOffAllMIS && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-500/20 text-xs shrink-0">
          <span className="text-amber-800 dark:text-amber-300 flex items-center gap-1.5 font-medium text-[11px]">
            <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Intraday MIS positions will be auto squared-off at 15:20 IST.
          </span>
          <button
            onClick={onSquareOffAllMIS}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-xs cursor-pointer"
          >
            Auto Square-Off MIS
          </button>
        </div>
      )}

      {/* Table Body */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-900/50">
              <th className="py-3 px-3">Instrument</th>
              <th className="py-3 px-2.5">Product</th>
              <th className="py-3 px-2.5 text-right">Qty</th>
              <th className="py-3 px-2.5 text-right">Avg Price</th>
              <th className="py-3 px-2.5 text-right">LTP</th>
              <th className="py-3 px-2.5 text-right">Current Value</th>
              <th className="py-3 px-3 text-right">P&L</th>
              <th className="py-3 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 font-mono font-tabular">
            {filteredPositions.map((pos, idx) => {
              const isLong = pos.quantity > 0;
              const pnlPaise = pos.unrealized_pnl_paise ?? 0;
              const isProfit = pnlPaise >= 0;
              const investedPaise =
                pos.invested_value_paise || pos.average_price_paise * Math.abs(pos.quantity);
              const pnlPercent = investedPaise > 0 ? (pnlPaise / investedPaise) * 100 : 0;

              return (
                <tr
                  key={pos.uuid || `pos-${pos.symbol}-${pos.product}-${idx}`}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors group"
                >
                  {/* Symbol & Direction */}
                  <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 font-sans">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isLong ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                    <span className="truncate max-w-[160px] font-bold tracking-tight">{pos.symbol}</span>
                  </td>

                  {/* Product Badge */}
                  <td className="py-3 px-2.5 font-sans">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                        pos.product === "INTRADAY"
                          ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300"
                          : pos.product === "FNO"
                          ? "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300"
                          : "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-300"
                      }`}
                    >
                      {pos.product === "INTRADAY" ? "MIS" : pos.product === "FNO" ? "F&O" : "CNC"}
                    </span>
                  </td>

                  {/* Quantity */}
                  <td
                    className={`py-3 px-2.5 text-right font-bold font-tabular ${
                      isLong ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {isLong ? `+${pos.quantity}` : pos.quantity}
                  </td>

                  {/* Average Buy Price */}
                  <td className="py-3 px-2.5 text-right text-slate-600 dark:text-slate-300 font-medium">
                    {formatPaise(pos.average_price_paise)}
                  </td>

                  {/* Current Market Price */}
                  <td className="py-3 px-2.5 text-right font-bold">
                    {pos.quote_status === "UNAVAILABLE" || pos.is_quote_available === false ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
                        UNAVAILABLE
                      </span>
                    ) : (
                      <span className="text-slate-900 dark:text-slate-100 inline-flex items-center justify-end gap-1">
                        {formatPaise(pos.current_price_paise)}
                        {pos.quote_status === "STALE" || pos.is_quote_stale ? (
                          <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                            STALE
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>

                  {/* Current Value */}
                  <td className="py-3 px-2.5 text-right text-slate-700 dark:text-slate-300 font-semibold">
                    {pos.quote_status === "UNAVAILABLE" || pos.is_quote_available === false ? (
                      <span className="text-slate-400 dark:text-slate-500 text-xs font-mono">—</span>
                    ) : (
                      formatPaise(pos.current_value_paise)
                    )}
                  </td>

                  {/* Unrealized P&L */}
                  <td className="py-3 px-3 text-right">
                    {pos.quote_status === "UNAVAILABLE" || pos.is_quote_available === false ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        UNAVAILABLE
                      </span>
                    ) : (
                      <>
                        <div
                          className={`font-black text-xs flex items-center justify-end gap-1 font-tabular ${
                            isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isProfit ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isProfit ? "+" : ""}
                            {formatPaise(pnlPaise)}
                          </span>
                        </div>
                        <div
                          className={`text-[10px] font-bold ${
                            isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isProfit ? "+" : ""}
                          {formatPercent(pnlPercent)}
                        </div>
                      </>
                    )}
                  </td>

                  {/* One-Click Square-Off Action */}
                  <td className="py-3 px-3 text-center font-sans">
                    <button
                      onClick={() => handleSquareOffSingle(pos)}
                      disabled={squaringOff === pos.uuid}
                      className="px-3 py-1 rounded-lg border border-rose-200 dark:border-rose-800/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-white text-[11px] font-bold transition-all flex items-center gap-1 mx-auto disabled:opacity-50 active:scale-95 cursor-pointer shadow-xs"
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                      {squaringOff === pos.uuid ? "Closing…" : "Exit"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
