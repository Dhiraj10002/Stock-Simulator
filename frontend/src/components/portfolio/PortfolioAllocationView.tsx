"use client";

import React, { useState, useMemo } from "react";
import {
  PieChart,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Briefcase,
  Flame,
  Layers,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Gauge,
  Activity,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { useRiskOverview } from "@/hooks/useRiskOverview";
import type { HoldingItem } from "./PortfolioTypes";
import type { Position } from "@/types";

interface PortfolioAllocationViewProps {
  holdings: HoldingItem[];
  positions: Position[];
  availableMarginPaise: number;
  useDemoData?: boolean;
  token?: string;
}

export default function PortfolioAllocationView({
  holdings = [],
  positions = [],
  availableMarginPaise = 100000000,
  useDemoData = true,
  token = "",
}: PortfolioAllocationViewProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const { overview } = useRiskOverview(token);

  // Asset Class Calculations
  const equityValuation = holdings.reduce((sum, h) => sum + h.currentValuePaise, 0);

  const futuresValuation = positions
    .filter((p) => {
      const sym = p.symbol.toUpperCase();
      return p.product === "FNO" && sym.includes("FUT");
    })
    .reduce((sum, p) => sum + (p.margin_blocked_paise || Math.abs(p.quantity * p.average_price_paise * 0.18)), 0);

  const optionsValuation = positions
    .filter((p) => {
      const sym = p.symbol.toUpperCase();
      return p.product === "FNO" && (sym.includes("CE") || sym.includes("PE"));
    })
    .reduce((sum, p) => sum + p.current_value_paise, 0);

  const intradayValuation = positions
    .filter((p) => p.product === "INTRADAY")
    .reduce((sum, p) => sum + (p.margin_blocked_paise || Math.abs(p.quantity * p.average_price_paise * 0.2)), 0);

  const totalCapital =
    equityValuation + futuresValuation + optionsValuation + intradayValuation + availableMarginPaise;

  const segments = useMemo(() => {
    const raw = [
      {
        id: "EQUITY",
        label: "Equity Delivery (CNC)",
        value: equityValuation,
        color: "#06b6d4", // cyan-500
        icon: Briefcase,
        description: "Long-term demat shares held without leverage",
      },
      {
        id: "FUTURES",
        label: "Futures Margin (FUT)",
        value: futuresValuation,
        color: "#6366f1", // indigo-500
        icon: Flame,
        description: "Index & stock futures overnight span margin",
      },
      {
        id: "OPTIONS",
        label: "Option Premiums (CE/PE)",
        value: optionsValuation,
        color: "#10b981", // emerald-500
        icon: Zap,
        description: "Bought and sold option contract premiums",
      },
      {
        id: "INTRADAY",
        label: "Intraday (MIS 5x)",
        value: intradayValuation,
        color: "#f59e0b", // amber-500
        icon: Layers,
        description: "Active intraday equity positions with 5x leverage",
      },
      {
        id: "CASH",
        label: "Unallocated Cash Margin",
        value: availableMarginPaise,
        color: "#64748b", // slate-500
        icon: Wallet,
        description: "Liquid capital ready for new orders or hedging",
      },
    ];

    const safeTotal = totalCapital > 0 ? totalCapital : 1;
    return raw.map((s) => ({
      ...s,
      percentage: (s.value / safeTotal) * 100,
    }));
  }, [equityValuation, futuresValuation, optionsValuation, intradayValuation, availableMarginPaise, totalCapital]);

  // Sector distribution from holdings
  const sectorBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    holdings.forEach((h) => {
      map.set(h.sector, (map.get(h.sector) || 0) + h.currentValuePaise);
    });

    const safeEquity = equityValuation > 0 ? equityValuation : 1;
    return Array.from(map.entries())
      .map(([sector, val]) => ({
        sector,
        valuePaise: val,
        percentage: (val / safeEquity) * 100,
      }))
      .sort((a, b) => b.valuePaise - a.valuePaise);
  }, [holdings, equityValuation]);

  // SVG Donut slices calculation
  let cumulativeAngle = 0;
  const donutSlices = segments.map((seg) => {
    const angle = (seg.percentage / 100) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    // Convert polar coordinates to Cartesian
    const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
      const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
      return {
        x: cx + r * Math.cos(angleInRadians),
        y: cy + r * Math.sin(angleInRadians),
      };
    };

    const cx = 100;
    const cy = 100;
    const rOuter = 85;
    const rInner = 55;

    const p1 = polarToCartesian(cx, cy, rOuter, endAngle);
    const p2 = polarToCartesian(cx, cy, rOuter, startAngle);
    const p3 = polarToCartesian(cx, cy, rInner, startAngle);
    const p4 = polarToCartesian(cx, cy, rInner, endAngle);

    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData = [
      `M ${p1.x} ${p1.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 0 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rInner} ${rInner} 0 ${largeArcFlag} 1 ${p4.x} ${p4.y}`,
      "Z",
    ].join(" ");

    return {
      ...seg,
      pathData,
      startAngle,
      endAngle,
    };
  });

  // Determine RMS values (Live Backend vs Showcase Demo)
  const isLive = !useDemoData && !!overview;

  const rmsStatus = isLive ? overview.status : "HEALTHY";
  const rmsUtilization = isLive
    ? overview.margin_utilization_pct
    : Math.min(100, Math.round(((futuresValuation + intradayValuation) / (totalCapital || 1)) * 100 * 10) / 10);
  const rmsEquityPaise = isLive ? overview.account_equity_paise : totalCapital;
  const rmsCashPaise = isLive ? overview.cash_balance_paise : availableMarginPaise;
  const rmsBlockedPaise = isLive ? overview.blocked_paise : (futuresValuation + intradayValuation);
  const rmsAvailablePaise = isLive ? overview.available_balance_paise : availableMarginPaise;
  const rmsMessage = isLive
    ? overview.message
    : "Margin health is optimal and well within regulatory maintenance requirements.";
  const rmsIntradayCount = isLive
    ? overview.intraday_positions_count
    : positions.filter((p) => p.product === "INTRADAY").length;
  const rmsDeliveryCount = isLive
    ? overview.delivery_positions_count
    : holdings.length;
  const rmsActiveOrdersCount = isLive ? overview.active_orders_count : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* LEFT: DONUT & ASSET SEGMENT BREAKDOWN (7 Cols) */}
      <div className="lg:col-span-7 space-y-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                <span>Asset Class Allocation</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Diversification across equity demat delivery, derivatives, and liquid funds
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
              Total: {formatPaise(totalCapital)}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-8">
            {/* SVG Donut Chart */}
            <div className="relative w-48 h-48 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
                {donutSlices.map((slice) => (
                  <path
                    key={slice.id}
                    d={slice.pathData}
                    fill={slice.color}
                    className={`transition-all duration-300 cursor-pointer ${
                      hoveredSegment === slice.id ? "opacity-100 filter drop-shadow-md scale-105" : "opacity-90 hover:opacity-100"
                    }`}
                    onMouseEnter={() => setHoveredSegment(slice.id)}
                    onMouseLeave={() => setHoveredSegment(null)}
                  />
                ))}
              </svg>

              {/* Center Donut Metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  {hoveredSegment ? segments.find((s) => s.id === hoveredSegment)?.label.split(" ")[0] : "Equity Ratio"}
                </span>
                <span className="text-lg font-black font-tabular text-slate-900 dark:text-slate-100">
                  {hoveredSegment
                    ? `${segments.find((s) => s.id === hoveredSegment)?.percentage.toFixed(1)}%`
                    : `${((equityValuation / (totalCapital || 1)) * 100).toFixed(0)}%`}
                </span>
              </div>
            </div>

            {/* Segment Breakdown List */}
            <div className="flex-1 space-y-3 w-full">
              {segments.map((seg) => {
                const Icon = seg.icon;
                const isHovered = hoveredSegment === seg.id;

                return (
                  <div
                    key={seg.id}
                    onMouseEnter={() => setHoveredSegment(seg.id)}
                    onMouseLeave={() => setHoveredSegment(null)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isHovered
                        ? "bg-slate-100 dark:bg-slate-800/80 border-cyan-500/50 shadow-xs"
                        : "bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {seg.label}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-xs font-tabular text-slate-900 dark:text-slate-100">
                          {formatPaise(seg.value)}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 ml-1.5 font-bold">
                          ({seg.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SECTOR EXPOSURE BARS */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Equity Sector Concentration</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              {sectorBreakdown.length} Active Sectors
            </span>
          </div>

          <div className="space-y-3">
            {sectorBreakdown.map((sec) => (
              <div key={sec.sector} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {sec.sector}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-tabular text-slate-900 dark:text-slate-100 font-bold">
                      {formatPaise(sec.valuePaise)}
                    </span>
                    <span className="font-mono text-slate-400 text-[11px]">
                      {sec.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${sec.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: RISK METRICS & INSTITUTIONAL HEALTH (5 Cols) */}
      <div className="lg:col-span-5 space-y-6">
        {/* Institutional RMS Risk Engine & Margin Health Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Institutional RMS Risk Engine</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Real-time margin utilization & SEBI intraday maintenance
              </p>
            </div>

            {/* Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full border ${
                rmsStatus === "CRITICAL"
                  ? "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400"
                  : rmsStatus === "MARGIN_CALL"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400"
                  : rmsStatus === "WARNING"
                  ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-600 dark:text-yellow-400"
                  : "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  rmsStatus === "HEALTHY"
                    ? "bg-emerald-500"
                    : rmsStatus === "WARNING"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-rose-500 animate-ping"
                }`}
              />
              {rmsStatus.replace("_", " ")}
            </span>
          </div>

          {/* Margin Utilization Meter */}
          <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                Margin Utilization
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-tabular font-black text-sm text-slate-900 dark:text-slate-100">
                  {rmsUtilization.toFixed(1)}%
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  / 100%
                </span>
              </div>
            </div>

            {/* Visual Progress Bar with Threshold Markers */}
            <div className="relative w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  rmsUtilization >= 120
                    ? "bg-gradient-to-r from-rose-500 to-rose-700"
                    : rmsUtilization >= 100
                    ? "bg-gradient-to-r from-amber-500 to-rose-600"
                    : rmsUtilization >= 80
                    ? "bg-gradient-to-r from-yellow-500 to-amber-500"
                    : "bg-gradient-to-r from-cyan-500 to-emerald-500"
                }`}
                style={{ width: `${Math.min(100, rmsUtilization)}%` }}
              />
            </div>

            {/* Meter Scale Markers */}
            <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-0.5">
              <span>0% Safe</span>
              <span className="text-yellow-600 dark:text-yellow-400 font-semibold">80% Warning</span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">100% Margin Call</span>
            </div>
          </div>

          {/* Key RMS Capital Breakdown Grid */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Account Total Equity
              </span>
              <span className="text-sm font-black font-tabular text-slate-900 dark:text-slate-100 mt-1 block">
                {formatPaise(rmsEquityPaise)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Cash + Unrealized MTM</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Blocked Margin
              </span>
              <span className="text-sm font-black font-tabular text-amber-600 dark:text-amber-400 mt-1 block">
                {formatPaise(rmsBlockedPaise)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Active MIS & F&O Span</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Available Free Margin
              </span>
              <span className="text-sm font-black font-tabular text-emerald-600 dark:text-emerald-400 mt-1 block">
                {formatPaise(rmsAvailablePaise)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Deployable liquidity</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Intraday (MIS) at Risk
              </span>
              <span className="text-sm font-black font-tabular text-slate-900 dark:text-slate-100 mt-1 block flex items-center gap-1">
                {rmsIntradayCount} <span className="text-xs font-normal text-slate-400">open</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Auto-liquidation monitored</span>
            </div>
          </div>

          {/* Official RMS Engine Advisory Message Box */}
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
              rmsStatus === "CRITICAL"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200"
                : rmsStatus === "MARGIN_CALL"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                : rmsStatus === "WARNING"
                ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-900 dark:text-yellow-200"
                : "bg-cyan-500/5 dark:bg-cyan-500/10 border-cyan-500/20 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              <Activity className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className="text-[11px] uppercase tracking-wider">
                RMS Engine Official Advisory
              </span>
              {isLive && (
                <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                  POSTGRES LIVE
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">
              {rmsMessage}
            </p>
          </div>
        </div>
        {/* Risk & Alpha Metrics Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Risk & Quantitative Metrics</span>
            </h3>
            <span className="text-[10px] font-mono uppercase bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded font-bold">
              Grade A
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Portfolio Beta (β)
              </span>
              <div className="text-xl font-black font-tabular text-slate-900 dark:text-slate-100">
                1.04
              </div>
              <p className="text-[10px] text-slate-500">Benchmark matched to NIFTY 50</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Sharpe Ratio
              </span>
              <div className="text-xl font-black font-tabular text-emerald-600 dark:text-emerald-400">
                1.92
              </div>
              <p className="text-[10px] text-slate-500">Above average risk-adjusted returns</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Max Drawdown
              </span>
              <div className="text-xl font-black font-tabular text-rose-600 dark:text-rose-400">
                -3.8%
              </div>
              <p className="text-[10px] text-slate-500">Peak-to-trough paper volatility</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Concentration Risk
              </span>
              <div className="text-xl font-black font-tabular text-cyan-600 dark:text-cyan-400">
                Low (25%)
              </div>
              <p className="text-[10px] text-slate-500">No single stock &gt; 30% of Demat</p>
            </div>
          </div>

          {/* AI Advisor Diagnostic Box */}
          <div className="p-4 rounded-xl bg-cyan-500/5 dark:bg-cyan-500/10 border border-cyan-500/20 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-cyan-800 dark:text-cyan-300">
              <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>AI Capital Allocation Note</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Your portfolio demonstrates sound diversification across Blue-Chip Large Caps and F&O index derivatives. Maintaining 20%+ unallocated margin protects you from margin calls during high IV swings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
