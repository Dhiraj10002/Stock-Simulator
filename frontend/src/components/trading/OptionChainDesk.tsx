"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTerminalStore } from "@/stores/terminal-store";
import { useSymbolQuote } from "@/stores/market-store";
import { formatPaise, formatNumber } from "@/lib/format";
import {
  RefreshCw,
  Layers,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Play,
  Info,
  Flame,
} from "lucide-react";
import type { OptionChainResponse, OptionContract, ApiResponse } from "@/types";

type StrategyType =
  | "NONE"
  | "BULL_CALL_SPREAD"
  | "BEAR_PUT_SPREAD"
  | "LONG_STRADDLE"
  | "SHORT_STRANGLE"
  | "IRON_CONDOR";

type StrategyLeg = {
  legNumber: number;
  contract: OptionContract;
  side: "BUY" | "SELL";
  label: string;
};

type StrategyMetrics = {
  type: StrategyType;
  title: string;
  bias: "BULLISH" | "BEARISH" | "VOLATILE" | "NEUTRAL";
  description: string;
  legs: StrategyLeg[];
  isCredit: boolean;
  netPremiumPerUnitPaise: number;
  totalCostPaise: number;
  maxProfitPaise: number | "UNLIMITED";
  maxLossPaise: number | "UNLIMITED";
  breakevens: string[];
  riskReward: string;
};

const UNDERLYINGS = [
  { symbol: "NIFTY", label: "NIFTY 50", lot: 50 },
  { symbol: "BANKNIFTY", label: "BANK NIFTY", lot: 15 },
  { symbol: "FINNIFTY", label: "FIN NIFTY", lot: 25 },
  { symbol: "RELIANCE", label: "RELIANCE", lot: 250 },
  { symbol: "TCS", label: "TCS", lot: 175 },
  { symbol: "INFY", label: "INFOSYS", lot: 400 },
];

interface OptionChainDeskProps {
  initialUnderlying?: string;
}

export default function OptionChainDesk({ initialUnderlying = "NIFTY" }: OptionChainDeskProps) {
  const router = useRouter();
  const setSelectedSymbol = useTerminalStore((s) => s.setSelectedSymbol);

  const [selectedUnderlying, setSelectedUnderlying] = useState(initialUnderlying);
  const liveSpotQuote = useSymbolQuote(selectedUnderlying);
  const [prevInitialUnderlying, setPrevInitialUnderlying] = useState(initialUnderlying);
  if (initialUnderlying !== prevInitialUnderlying) {
    setPrevInitialUnderlying(initialUnderlying);
    setSelectedUnderlying(initialUnderlying);
  }

  // Strategy Builder State
  const [activeStrategy, setActiveStrategy] = useState<StrategyType>("NONE");
  const [strategyLots, setStrategyLots] = useState<number>(1);
  const [executingStrategy, setExecutingStrategy] = useState<boolean>(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const [token] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token") || "";
    }
    return "";
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  // Fetch Option Chain via TanStack Query
  const {
    data: chain,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery<OptionChainResponse | null>({
    queryKey: ["option-chain", selectedUnderlying],
    queryFn: async () => {
      const res = await fetch(
        `${apiUrl}/fno/option-chain?symbol=${encodeURIComponent(selectedUnderlying)}`
      );
      const json: ApiResponse<OptionChainResponse> = await res.json();
      if (res.ok && json.success && json.data) {
        return json.data;
      }
      throw new Error(json.message || "Failed to load option chain data");
    },
    refetchInterval: 10000,
  });

  const error = queryError instanceof Error ? queryError.message : null;

  const handleUnderlyingChange = (sym: string) => {
    setSelectedUnderlying(sym);
    setActiveStrategy("NONE");
    setExecutionMessage(null);
    setExecutionError(null);
  };

  // Route single contract to trade terminal
  const handleSelectContract = (contract: OptionContract, _side: "BUY" | "SELL") => {
    setSelectedSymbol(contract.symbol);
    router.push(`/stocks/${encodeURIComponent(contract.symbol)}`);
  };

  // Compute Strategy Definition & Payoffs
  const strategyMetrics: StrategyMetrics | null = useMemo(() => {
    if (!chain || !chain.strikes || chain.strikes.length === 0 || activeStrategy === "NONE") {
      return null;
    }

    const atmIndex = chain.strikes.findIndex((s) => s.is_atm);
    const validAtmIndex = atmIndex >= 0 ? atmIndex : Math.floor(chain.strikes.length / 2);
    const atmRow = chain.strikes[validAtmIndex];
    const lotSize = chain.lot_size;

    if (activeStrategy === "BULL_CALL_SPREAD") {
      const otmIndex = Math.min(validAtmIndex + 1, chain.strikes.length - 1);
      const otmRow = chain.strikes[otmIndex];

      const buyLeg: StrategyLeg = {
        legNumber: 1,
        contract: atmRow.call,
        side: "BUY",
        label: `Buy ATM ${formatPaise(atmRow.strike_price_paise)} CE`,
      };
      const sellLeg: StrategyLeg = {
        legNumber: 2,
        contract: otmRow.call,
        side: "SELL",
        label: `Sell OTM ${formatPaise(otmRow.strike_price_paise)} CE`,
      };

      const netDebitPerUnit = buyLeg.contract.ltp_paise - sellLeg.contract.ltp_paise;
      const strikeSpread = otmRow.strike_price_paise - atmRow.strike_price_paise;
      const maxProfitPerUnit = Math.max(0, strikeSpread - netDebitPerUnit);
      const totalCost = netDebitPerUnit * lotSize * strategyLots;
      const maxProfitTotal = maxProfitPerUnit * lotSize * strategyLots;
      const maxLossTotal = totalCost;
      const breakeven = (atmRow.strike_price_paise + netDebitPerUnit) / 100;

      return {
        type: "BULL_CALL_SPREAD",
        title: "Bull Call Spread",
        bias: "BULLISH",
        description: "Moderately bullish strategy with capped downside risk and capped upside reward.",
        legs: [buyLeg, sellLeg],
        isCredit: false,
        netPremiumPerUnitPaise: netDebitPerUnit,
        totalCostPaise: totalCost,
        maxProfitPaise: maxProfitTotal,
        maxLossPaise: maxLossTotal,
        breakevens: [`₹${formatNumber(breakeven, 2)}`],
        riskReward: `1 : ${(maxProfitTotal / Math.max(1, maxLossTotal)).toFixed(2)}`,
      };
    }

    if (activeStrategy === "BEAR_PUT_SPREAD") {
      const otmIndex = Math.max(validAtmIndex - 1, 0);
      const otmRow = chain.strikes[otmIndex];

      const buyLeg: StrategyLeg = {
        legNumber: 1,
        contract: atmRow.put,
        side: "BUY",
        label: `Buy ATM ${formatPaise(atmRow.strike_price_paise)} PE`,
      };
      const sellLeg: StrategyLeg = {
        legNumber: 2,
        contract: otmRow.put,
        side: "SELL",
        label: `Sell OTM ${formatPaise(otmRow.strike_price_paise)} PE`,
      };

      const netDebitPerUnit = buyLeg.contract.ltp_paise - sellLeg.contract.ltp_paise;
      const strikeSpread = atmRow.strike_price_paise - otmRow.strike_price_paise;
      const maxProfitPerUnit = Math.max(0, strikeSpread - netDebitPerUnit);
      const totalCost = netDebitPerUnit * lotSize * strategyLots;
      const maxProfitTotal = maxProfitPerUnit * lotSize * strategyLots;
      const maxLossTotal = totalCost;
      const breakeven = (atmRow.strike_price_paise - netDebitPerUnit) / 100;

      return {
        type: "BEAR_PUT_SPREAD",
        title: "Bear Put Spread",
        bias: "BEARISH",
        description: "Moderately bearish strategy utilizing puts with protected downside and defined risk.",
        legs: [buyLeg, sellLeg],
        isCredit: false,
        netPremiumPerUnitPaise: netDebitPerUnit,
        totalCostPaise: totalCost,
        maxProfitPaise: maxProfitTotal,
        maxLossPaise: maxLossTotal,
        breakevens: [`₹${formatNumber(breakeven, 2)}`],
        riskReward: `1 : ${(maxProfitTotal / Math.max(1, maxLossTotal)).toFixed(2)}`,
      };
    }

    if (activeStrategy === "LONG_STRADDLE") {
      const buyCall: StrategyLeg = {
        legNumber: 1,
        contract: atmRow.call,
        side: "BUY",
        label: `Buy ATM ${formatPaise(atmRow.strike_price_paise)} CE`,
      };
      const buyPut: StrategyLeg = {
        legNumber: 2,
        contract: atmRow.put,
        side: "BUY",
        label: `Buy ATM ${formatPaise(atmRow.strike_price_paise)} PE`,
      };

      const netDebitPerUnit = buyCall.contract.ltp_paise + buyPut.contract.ltp_paise;
      const totalCost = netDebitPerUnit * lotSize * strategyLots;
      const upperBe = (atmRow.strike_price_paise + netDebitPerUnit) / 100;
      const lowerBe = (atmRow.strike_price_paise - netDebitPerUnit) / 100;

      return {
        type: "LONG_STRADDLE",
        title: "Long Straddle",
        bias: "VOLATILE",
        description: "Direction-neutral setup designed to profit from sharp breakout expansions in either direction.",
        legs: [buyCall, buyPut],
        isCredit: false,
        netPremiumPerUnitPaise: netDebitPerUnit,
        totalCostPaise: totalCost,
        maxProfitPaise: "UNLIMITED",
        maxLossPaise: totalCost,
        breakevens: [`₹${formatNumber(lowerBe, 2)}`, `₹${formatNumber(upperBe, 2)}`],
        riskReward: "Unlimited Upside / Defined Risk",
      };
    }

    if (activeStrategy === "SHORT_STRANGLE") {
      const otmCallIndex = Math.min(validAtmIndex + 1, chain.strikes.length - 1);
      const otmPutIndex = Math.max(validAtmIndex - 1, 0);

      const sellCall: StrategyLeg = {
        legNumber: 1,
        contract: chain.strikes[otmCallIndex].call,
        side: "SELL",
        label: `Sell OTM ${formatPaise(chain.strikes[otmCallIndex].strike_price_paise)} CE`,
      };
      const sellPut: StrategyLeg = {
        legNumber: 2,
        contract: chain.strikes[otmPutIndex].put,
        side: "SELL",
        label: `Sell OTM ${formatPaise(chain.strikes[otmPutIndex].strike_price_paise)} PE`,
      };

      const netCreditPerUnit = sellCall.contract.ltp_paise + sellPut.contract.ltp_paise;
      const totalCredit = netCreditPerUnit * lotSize * strategyLots;
      const upperBe = (chain.strikes[otmCallIndex].strike_price_paise + netCreditPerUnit) / 100;
      const lowerBe = (chain.strikes[otmPutIndex].strike_price_paise - netCreditPerUnit) / 100;

      return {
        type: "SHORT_STRANGLE",
        title: "Short Strangle",
        bias: "NEUTRAL",
        description: "Non-directional premium-collection strategy profiting from theta decay in rangebound markets.",
        legs: [sellCall, sellPut],
        isCredit: true,
        netPremiumPerUnitPaise: netCreditPerUnit,
        totalCostPaise: totalCredit,
        maxProfitPaise: totalCredit,
        maxLossPaise: "UNLIMITED",
        breakevens: [`₹${formatNumber(lowerBe, 2)}`, `₹${formatNumber(upperBe, 2)}`],
        riskReward: "Defined Inflow / Unlimited Tail Risk",
      };
    }

    return null;
  }, [chain, activeStrategy, strategyLots]);

  // Execute multi-leg strategy orders
  const handleExecuteStrategy = async () => {
    if (!strategyMetrics || !token) {
      setExecutionError("Authentication token missing or invalid strategy configuration.");
      return;
    }

    setExecutingStrategy(true);
    setExecutionMessage(null);
    setExecutionError(null);

    try {
      const orderPromises = strategyMetrics.legs.map((leg) => {
        const qty = (chain?.lot_size ?? 50) * strategyLots;
        return fetch(`${apiUrl}/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            symbol: leg.contract.symbol,
            side: leg.side,
            type: "MARKET",
            product: "FNO",
            quantity: qty,
          }),
        });
      });

      const responses = await Promise.all(orderPromises);
      const allOk = responses.every((r) => r.ok);

      if (allOk) {
        setExecutionMessage(
          `Successfully executed all ${strategyMetrics.legs.length} legs for ${strategyMetrics.title} (${strategyLots} lot)!`
        );
        setActiveStrategy("NONE");
      } else {
        setExecutionError("One or more strategy legs failed during order dispatch.");
      }
    } catch (err: unknown) {
      setExecutionError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecutingStrategy(false);
    }
  };

  // Max Pain Calculation
  const maxPainStrike = useMemo(() => {
    if (!chain || !chain.strikes || chain.strikes.length === 0) return null;
    let minLoss = Infinity;
    let bestStrike = chain.strikes[0].strike_price_paise;

    chain.strikes.forEach((candidate) => {
      const target = candidate.strike_price_paise;
      let totalLoss = 0;

      chain.strikes.forEach((s) => {
        // Call loss if spot finishes at target
        if (target > s.strike_price_paise) {
          totalLoss += (target - s.strike_price_paise) * s.call.open_interest;
        }
        // Put loss if spot finishes at target
        if (target < s.strike_price_paise) {
          totalLoss += (s.strike_price_paise - target) * s.put.open_interest;
        }
      });

      if (totalLoss < minLoss) {
        minLoss = totalLoss;
        bestStrike = target;
      }
    });

    return bestStrike;
  }, [chain]);

  const pcr = chain?.put_call_ratio ?? 1;
  const pcrSentiment =
    pcr > 1.2
      ? { label: "Bullish (Oversold Puts)", color: "text-emerald-400 bg-emerald-950/60 border-emerald-800/40" }
      : pcr < 0.8
      ? { label: "Bearish (Call Writing)", color: "text-rose-400 bg-rose-950/60 border-rose-800/40" }
      : { label: "Neutral / Balanced", color: "text-cyan-400 bg-cyan-950/60 border-cyan-800/40" };

  return (
    <div className="space-y-6">
      {/* Top Controls: Underlyings, Spot Banner & Expiry */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-xl">
        {/* Underlying Selector Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
          {UNDERLYINGS.map((u) => {
            const isSelected = u.symbol === selectedUnderlying;
            return (
              <button
                key={u.symbol}
                onClick={() => handleUnderlyingChange(u.symbol)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  isSelected
                    ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 scale-105"
                    : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700"
                }`}
              >
                <span>{u.label}</span>
                <span className="text-[10px] ml-1 opacity-70 font-mono">({u.lot})</span>
              </button>
            );
          })}
        </div>

        {/* Spot Metrics & Refresh */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Spot:</span>
            <span className="text-base font-extrabold font-tabular text-slate-100">
              {liveSpotQuote?.price_paise
                ? formatPaise(liveSpotQuote.price_paise)
                : chain
                ? formatPaise(chain.spot_price_paise)
                : "Loading..."}
            </span>
            {liveSpotQuote?.change_percent !== undefined && (
              <span
                className={`text-xs font-semibold font-mono ${
                  liveSpotQuote.change_percent >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {liveSpotQuote.change_percent >= 0 ? "+" : ""}
                {liveSpotQuote.change_percent.toFixed(2)}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Expiry:</span>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
              {chain?.expiry_date || "Current Weekly"}
            </span>
          </div>

          <button
            onClick={() => void refetch()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-cyan-400 transition-colors"
            title="Refresh Option Chain"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Derivative Market Stats Strip (PCR, Max Pain, Total OI) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Put Call Ratio (PCR) */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            Put-Call Ratio (PCR)
          </span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black font-tabular text-slate-100">
              {pcr.toFixed(2)}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${pcrSentiment.color}`}
            >
              {pcrSentiment.label}
            </span>
          </div>
          <span className="text-[10px] text-slate-500">Total Put OI / Total Call OI</span>
        </div>

        {/* Max Pain Strike */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Max Pain Strike
          </span>
          <div className="text-2xl font-black font-tabular text-cyan-300">
            {maxPainStrike ? formatPaise(maxPainStrike) : "—"}
          </div>
          <span className="text-[10px] text-slate-500">Theoretical least-loss expiry level</span>
        </div>

        {/* Total Call Open Interest */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-rose-400">
            Total Call OI (Resistance)
          </span>
          <div className="text-2xl font-bold font-tabular text-slate-100">
            {chain?.total_call_oi?.toLocaleString("en-IN") ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Cumulative Call contracts outstanding</span>
        </div>

        {/* Total Put Open Interest */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-emerald-400">
            Total Put OI (Support)
          </span>
          <div className="text-2xl font-bold font-tabular text-slate-100">
            {chain?.total_put_oi?.toLocaleString("en-IN") ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Cumulative Put contracts outstanding</span>
        </div>
      </div>

      {/* Multi-Leg Strategy Builder Presets Bar */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
              Multi-Leg Options Strategy Presets
            </h3>
          </div>

          {/* Strategy Preset Selector Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "NONE", label: "Single Leg" },
              { id: "BULL_CALL_SPREAD", label: "Bull Call Spread" },
              { id: "BEAR_PUT_SPREAD", label: "Bear Put Spread" },
              { id: "LONG_STRADDLE", label: "Long Straddle" },
              { id: "SHORT_STRANGLE", label: "Short Strangle" },
            ].map((strat) => (
              <button
                key={strat.id}
                onClick={() => {
                  setActiveStrategy(strat.id as StrategyType);
                  setExecutionMessage(null);
                  setExecutionError(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  activeStrategy === strat.id
                    ? "bg-cyan-500 text-slate-950 shadow-sm"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                }`}
              >
                {strat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Strategy Detail & Execution Card */}
        {strategyMetrics && (
          <div className="mt-3 p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-3 animate-in fade-in duration-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-cyan-400">{strategyMetrics.title}</h4>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.2 rounded uppercase ${
                      strategyMetrics.bias === "BULLISH"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                        : strategyMetrics.bias === "BEARISH"
                        ? "bg-rose-950 text-rose-400 border border-rose-800/40"
                        : "bg-cyan-950 text-cyan-400 border border-cyan-800/40"
                    }`}
                  >
                    {strategyMetrics.bias}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{strategyMetrics.description}</p>
              </div>

              {/* Lot Adjuster & Execute */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
                  <span className="text-[11px] text-slate-400 font-semibold">Lots:</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={strategyLots}
                    onChange={(e) => setStrategyLots(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 bg-transparent text-xs font-bold text-white text-center focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleExecuteStrategy}
                  disabled={executingStrategy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {executingStrategy ? "Dispatching Legs…" : `Execute Strategy (${strategyLots} Lot)`}
                  </span>
                </button>
              </div>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">
                  Net {strategyMetrics.isCredit ? "Credit" : "Debit"}
                </span>
                <div className="text-sm font-bold font-tabular text-slate-100 mt-0.5">
                  {formatPaise(strategyMetrics.totalCostPaise)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Max Profit</span>
                <div className="text-sm font-bold font-tabular text-emerald-400 mt-0.5">
                  {strategyMetrics.maxProfitPaise === "UNLIMITED"
                    ? "Unlimited"
                    : formatPaise(strategyMetrics.maxProfitPaise)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Max Loss</span>
                <div className="text-sm font-bold font-tabular text-rose-400 mt-0.5">
                  {strategyMetrics.maxLossPaise === "UNLIMITED"
                    ? "Unlimited"
                    : formatPaise(strategyMetrics.maxLossPaise)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Breakeven(s)</span>
                <div className="text-xs font-bold font-tabular text-cyan-300 mt-0.5">
                  {strategyMetrics.breakevens.join(" | ")}
                </div>
              </div>
            </div>

            {/* Attached Strategy Legs */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
              {strategyMetrics.legs.map((leg) => (
                <span
                  key={leg.legNumber}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300"
                >
                  <span
                    className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                      leg.side === "BUY"
                        ? "bg-emerald-950 text-emerald-400"
                        : "bg-rose-950 text-rose-400"
                    }`}
                  >
                    {leg.side}
                  </span>
                  <span className="font-semibold">{leg.label}</span>
                  <span className="font-mono text-slate-400 font-tabular">
                    @{formatPaise(leg.contract.ltp_paise)}
                  </span>
                </span>
              ))}
            </div>

            {executionMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{executionMessage}</span>
              </div>
            )}

            {executionError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{executionError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Option Chain Strike Ladder Desk */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden shadow-2xl">
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-slate-100">
              {selectedUnderlying} Strike Ladder & Greek Analytics
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Yellow row = At-The-Money (ATM) · Green tint = In-The-Money (ITM)
          </span>
        </div>

        {loading ? (
          <div className="p-20 text-center text-slate-500 space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs">Streaming real-time strikes & Greeks…</p>
          </div>
        ) : error ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto stroke-[1.5]" />
            <p className="text-sm font-bold text-rose-400">{error}</p>
            <p className="text-xs text-slate-500">Ensure the backend F&O service is running.</p>
          </div>
        ) : !chain || chain.strikes.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <Info className="w-8 h-8 text-slate-600 mx-auto mb-2 stroke-[1.5]" />
            <p className="text-sm">No option contracts available for this underlying.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/90 text-center select-none">
                  {/* Calls Header */}
                  <th colSpan={6} className="py-2.5 px-2 bg-emerald-950/20 text-emerald-400 border-r border-slate-800">
                    CALLS (CE)
                  </th>
                  {/* Strike Header */}
                  <th className="py-2.5 px-4 bg-slate-950 font-black text-slate-200">
                    STRIKE
                  </th>
                  {/* Puts Header */}
                  <th colSpan={6} className="py-2.5 px-2 bg-rose-950/20 text-rose-400 border-l border-slate-800">
                    PUTS (PE)
                  </th>
                </tr>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/60 font-mono">
                  {/* Call Subheaders */}
                  <th className="py-2 px-3 text-right">OI</th>
                  <th className="py-2 px-2 text-right">IV%</th>
                  <th className="py-2 px-2 text-right">Delta</th>
                  <th className="py-2 px-2 text-right">Theta</th>
                  <th className="py-2 px-3 text-right">Call LTP</th>
                  <th className="py-2 px-3 text-center border-r border-slate-800">Action</th>

                  {/* Strike Subheader */}
                  <th className="py-2 px-4 text-center bg-slate-950 font-sans font-bold text-slate-300">
                    Price (₹)
                  </th>

                  {/* Put Subheaders */}
                  <th className="py-2 px-3 text-center border-l border-slate-800">Action</th>
                  <th className="py-2 px-3 text-left">Put LTP</th>
                  <th className="py-2 px-2 text-left">Delta</th>
                  <th className="py-2 px-2 text-left">Theta</th>
                  <th className="py-2 px-2 text-left">IV%</th>
                  <th className="py-2 px-3 text-left">OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-medium text-[11px]">
                {chain.strikes.map((row) => {
                  const isAtm = row.is_atm;
                  const isCallItm = row.strike_price_paise < chain.spot_price_paise;
                  const isPutItm = row.strike_price_paise > chain.spot_price_paise;

                  return (
                    <tr
                      key={row.strike_price_paise}
                      className={`transition-colors ${
                        isAtm
                          ? "bg-amber-500/10 border-y-2 border-amber-500/40"
                          : "hover:bg-slate-800/30"
                      }`}
                    >
                      {/* Call OI */}
                      <td
                        className={`py-2 px-3 text-right font-mono text-slate-400 ${
                          isCallItm ? "bg-emerald-950/15" : ""
                        }`}
                      >
                        {row.call.open_interest.toLocaleString("en-IN")}
                      </td>

                      {/* Call IV */}
                      <td
                        className={`py-2 px-2 text-right font-mono text-slate-400 ${
                          isCallItm ? "bg-emerald-950/15" : ""
                        }`}
                      >
                        {row.call.iv.toFixed(1)}%
                      </td>

                      {/* Call Delta */}
                      <td
                        className={`py-2 px-2 text-right font-mono text-slate-300 ${
                          isCallItm ? "bg-emerald-950/15 font-semibold text-emerald-400" : ""
                        }`}
                      >
                        {row.call.delta.toFixed(2)}
                      </td>

                      {/* Call Theta */}
                      <td
                        className={`py-2 px-2 text-right font-mono text-slate-500 ${
                          isCallItm ? "bg-emerald-950/15" : ""
                        }`}
                      >
                        {row.call.theta.toFixed(1)}
                      </td>

                      {/* Call LTP */}
                      <td
                        className={`py-2 px-3 text-right font-bold font-tabular text-slate-100 ${
                          isCallItm ? "bg-emerald-950/20 text-emerald-300 font-extrabold" : ""
                        }`}
                      >
                        {formatPaise(row.call.ltp_paise)}
                      </td>

                      {/* Call Fast Action */}
                      <td
                        className={`py-1.5 px-3 text-center border-r border-slate-800 ${
                          isCallItm ? "bg-emerald-950/15" : ""
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSelectContract(row.call, "BUY")}
                            className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 text-[10px] font-bold border border-emerald-500/30 transition-all"
                            title="Buy Call"
                          >
                            B
                          </button>
                          <button
                            onClick={() => handleSelectContract(row.call, "SELL")}
                            className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-slate-950 text-[10px] font-bold border border-rose-500/30 transition-all"
                            title="Sell Call"
                          >
                            S
                          </button>
                        </div>
                      </td>

                      {/* Strike Price (Center) */}
                      <td className="py-2 px-4 text-center bg-slate-950 font-bold font-tabular text-slate-100">
                        <div className="flex items-center justify-center gap-1">
                          <span>{formatPaise(row.strike_price_paise)}</span>
                          {isAtm && (
                            <span className="text-[9px] font-black px-1 rounded bg-amber-500 text-slate-950 uppercase">
                              ATM
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Put Fast Action */}
                      <td
                        className={`py-1.5 px-3 text-center border-l border-slate-800 ${
                          isPutItm ? "bg-rose-950/15" : ""
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSelectContract(row.put, "BUY")}
                            className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 text-[10px] font-bold border border-emerald-500/30 transition-all"
                            title="Buy Put"
                          >
                            B
                          </button>
                          <button
                            onClick={() => handleSelectContract(row.put, "SELL")}
                            className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-slate-950 text-[10px] font-bold border border-rose-500/30 transition-all"
                            title="Sell Put"
                          >
                            S
                          </button>
                        </div>
                      </td>

                      {/* Put LTP */}
                      <td
                        className={`py-2 px-3 text-left font-bold font-tabular text-slate-100 ${
                          isPutItm ? "bg-rose-950/20 text-rose-300 font-extrabold" : ""
                        }`}
                      >
                        {formatPaise(row.put.ltp_paise)}
                      </td>

                      {/* Put Delta */}
                      <td
                        className={`py-2 px-2 text-left font-mono text-slate-300 ${
                          isPutItm ? "bg-rose-950/15 font-semibold text-rose-400" : ""
                        }`}
                      >
                        {row.put.delta.toFixed(2)}
                      </td>

                      {/* Put Theta */}
                      <td
                        className={`py-2 px-2 text-left font-mono text-slate-500 ${
                          isPutItm ? "bg-rose-950/15" : ""
                        }`}
                      >
                        {row.put.theta.toFixed(1)}
                      </td>

                      {/* Put IV */}
                      <td
                        className={`py-2 px-2 text-left font-mono text-slate-400 ${
                          isPutItm ? "bg-rose-950/15" : ""
                        }`}
                      >
                        {row.put.iv.toFixed(1)}%
                      </td>

                      {/* Put OI */}
                      <td
                        className={`py-2 px-3 text-left font-mono text-slate-400 ${
                          isPutItm ? "bg-rose-950/15" : ""
                        }`}
                      >
                        {row.put.open_interest.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
