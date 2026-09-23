"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Sparkles,
  Info,
  ShieldCheck,
  AlertCircle,
  Zap,
  Play,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { useSymbolQuote } from "@/stores/market-store";
import type { OptionChainResponse, OptionContract } from "@/types";

type StrategyType = "NONE" | "BULL_CALL_SPREAD" | "BEAR_PUT_SPREAD" | "LONG_STRADDLE" | "SHORT_STRANGLE";

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

type OptionChainModalProps = {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  token?: string;
  onSelectContract: (contract: OptionContract, side: "BUY" | "SELL") => void;
  onStrategyExecuted?: () => void;
  initialSymbol?: string;
};

const SYMBOLS = [
  { symbol: "NIFTY", label: "NIFTY 50", lot: 50 },
  { symbol: "BANKNIFTY", label: "BANK NIFTY", lot: 15 },
  { symbol: "RELIANCE", label: "RELIANCE", lot: 250 },
  { symbol: "TCS", label: "TCS", lot: 175 },
  { symbol: "INFY", label: "INFOSYS", lot: 400 },
  { symbol: "HDFCBANK", label: "HDFC BANK", lot: 550 },
];

export default function OptionChainModal({
  isOpen,
  onClose,
  apiUrl,
  token,
  onSelectContract,
  onStrategyExecuted,
  initialSymbol = "NIFTY",
}: OptionChainModalProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol);
  const liveSpotQuote = useSymbolQuote(selectedSymbol);
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const spotPricePaise = liveSpotQuote?.price_paise ?? chain?.spot_price_paise;
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewGreeks, setViewGreeks] = useState<boolean>(true);

  // Strategy Builder State
  const [activeStrategy, setActiveStrategy] = useState<StrategyType>("NONE");
  const [strategyLots, setStrategyLots] = useState<number>(1);
  const [executingStrategy, setExecutingStrategy] = useState<boolean>(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const fetchOptionChain = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/fno/option-chain?symbol=${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setChain(json.data);
      } else {
        setError(json.message || "Failed to load option chain");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error fetching option chain");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        const validSym = SYMBOLS.some((s) => s.symbol === initialSymbol)
          ? initialSymbol
          : "NIFTY";
        setSelectedSymbol(validSym);
        setActiveStrategy("NONE");
        setExecutionMessage(null);
        setExecutionError(null);
        void fetchOptionChain(validSym);
      });
    }
  }, [isOpen, initialSymbol, fetchOptionChain]);

  const handleSymbolChange = (sym: string) => {
    setSelectedSymbol(sym);
    setActiveStrategy("NONE");
    setExecutionMessage(null);
    setExecutionError(null);
    void fetchOptionChain(sym);
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
      const leg1: StrategyLeg = { legNumber: 1, contract: atmRow.call, side: "BUY", label: "Buy ATM Call" };
      const leg2: StrategyLeg = { legNumber: 2, contract: otmRow.call, side: "SELL", label: "Sell OTM Call (+1 Step)" };

      const debitPerUnitPaise = leg1.contract.ltp_paise - leg2.contract.ltp_paise;
      const spreadWidthPaise = otmRow.strike_price_paise - atmRow.strike_price_paise;
      const maxProfitPerUnitPaise = Math.max(0, spreadWidthPaise - debitPerUnitPaise);
      const totalCostPaise = debitPerUnitPaise * lotSize * strategyLots;
      const maxProfitPaise = maxProfitPerUnitPaise * lotSize * strategyLots;
      const maxLossPaise = totalCostPaise;
      const breakevenRupees = (atmRow.strike_price_paise + debitPerUnitPaise) / 100;

      const rrRatio = maxLossPaise > 0 ? (maxProfitPaise / maxLossPaise).toFixed(2) : "N/A";

      return {
        type: activeStrategy,
        title: "Bull Call Spread",
        bias: "BULLISH",
        description: "Moderately bullish strategy: Capped risk and defined profit target with discounted entry premium.",
        legs: [leg1, leg2],
        isCredit: false,
        netPremiumPerUnitPaise: debitPerUnitPaise,
        totalCostPaise,
        maxProfitPaise,
        maxLossPaise,
        breakevens: [`>${breakevenRupees.toFixed(2)}`],
        riskReward: `1 : ${rrRatio}`,
      };
    }

    if (activeStrategy === "BEAR_PUT_SPREAD") {
      const otmIndex = Math.max(validAtmIndex - 1, 0);
      const otmRow = chain.strikes[otmIndex];
      const leg1: StrategyLeg = { legNumber: 1, contract: atmRow.put, side: "BUY", label: "Buy ATM Put" };
      const leg2: StrategyLeg = { legNumber: 2, contract: otmRow.put, side: "SELL", label: "Sell OTM Put (-1 Step)" };

      const debitPerUnitPaise = leg1.contract.ltp_paise - leg2.contract.ltp_paise;
      const spreadWidthPaise = atmRow.strike_price_paise - otmRow.strike_price_paise;
      const maxProfitPerUnitPaise = Math.max(0, spreadWidthPaise - debitPerUnitPaise);
      const totalCostPaise = debitPerUnitPaise * lotSize * strategyLots;
      const maxProfitPaise = maxProfitPerUnitPaise * lotSize * strategyLots;
      const maxLossPaise = totalCostPaise;
      const breakevenRupees = (atmRow.strike_price_paise - debitPerUnitPaise) / 100;

      const rrRatio = maxLossPaise > 0 ? (maxProfitPaise / maxLossPaise).toFixed(2) : "N/A";

      return {
        type: activeStrategy,
        title: "Bear Put Spread",
        bias: "BEARISH",
        description: "Moderately bearish strategy: Defined downside risk and reduced capital outlay against Put volatility.",
        legs: [leg1, leg2],
        isCredit: false,
        netPremiumPerUnitPaise: debitPerUnitPaise,
        totalCostPaise,
        maxProfitPaise,
        maxLossPaise,
        breakevens: [`<${breakevenRupees.toFixed(2)}`],
        riskReward: `1 : ${rrRatio}`,
      };
    }

    if (activeStrategy === "LONG_STRADDLE") {
      const leg1: StrategyLeg = { legNumber: 1, contract: atmRow.call, side: "BUY", label: "Buy ATM Call" };
      const leg2: StrategyLeg = { legNumber: 2, contract: atmRow.put, side: "BUY", label: "Buy ATM Put" };

      const totalPremiumPerUnitPaise = leg1.contract.ltp_paise + leg2.contract.ltp_paise;
      const totalCostPaise = totalPremiumPerUnitPaise * lotSize * strategyLots;
      const upperBreakevenRupees = (atmRow.strike_price_paise + totalPremiumPerUnitPaise) / 100;
      const lowerBreakevenRupees = (atmRow.strike_price_paise - totalPremiumPerUnitPaise) / 100;

      return {
        type: activeStrategy,
        title: "Long Straddle",
        bias: "VOLATILE",
        description: "Market breakout strategy: Profits from large directional movement in either direction (earnings, RBI policy).",
        legs: [leg1, leg2],
        isCredit: false,
        netPremiumPerUnitPaise: totalPremiumPerUnitPaise,
        totalCostPaise,
        maxProfitPaise: "UNLIMITED",
        maxLossPaise: totalCostPaise,
        breakevens: [`<${lowerBreakevenRupees.toFixed(2)}`, `>${upperBreakevenRupees.toFixed(2)}`],
        riskReward: "Unlimited upside",
      };
    }

    if (activeStrategy === "SHORT_STRANGLE") {
      const otmCallIndex = Math.min(validAtmIndex + 1, chain.strikes.length - 1);
      const otmPutIndex = Math.max(validAtmIndex - 1, 0);
      const otmCallRow = chain.strikes[otmCallIndex];
      const otmPutRow = chain.strikes[otmPutIndex];

      const leg1: StrategyLeg = { legNumber: 1, contract: otmCallRow.call, side: "SELL", label: "Sell OTM Call (+1 Step)" };
      const leg2: StrategyLeg = { legNumber: 2, contract: otmPutRow.put, side: "SELL", label: "Sell OTM Put (-1 Step)" };

      const creditPerUnitPaise = leg1.contract.ltp_paise + leg2.contract.ltp_paise;
      const maxProfitPaise = creditPerUnitPaise * lotSize * strategyLots;
      const upperBreakevenRupees = (otmCallRow.strike_price_paise + creditPerUnitPaise) / 100;
      const lowerBreakevenRupees = (otmPutRow.strike_price_paise - creditPerUnitPaise) / 100;

      return {
        type: activeStrategy,
        title: "Short Strangle",
        bias: "NEUTRAL",
        description: "High-probability rangebound strategy: Harvests accelerated theta decay as long as price remains within range.",
        legs: [leg1, leg2],
        isCredit: true,
        netPremiumPerUnitPaise: creditPerUnitPaise,
        totalCostPaise: maxProfitPaise,
        maxProfitPaise,
        maxLossPaise: "UNLIMITED",
        breakevens: [`<${lowerBreakevenRupees.toFixed(2)}`, `>${upperBreakevenRupees.toFixed(2)}`],
        riskReward: "High probability / Unlimited risk",
      };
    }

    return null;
  }, [chain, activeStrategy, strategyLots]);

  // Execute Strategy Basket (All legs sequentially)
  const handleExecuteStrategy = async () => {
    if (!strategyMetrics) return;
    if (!token) {
      setExecutionError("Authentication required. Please log in to deploy live option strategies.");
      return;
    }

    setExecutingStrategy(true);
    setExecutionError(null);
    setExecutionMessage("Validating strategy basket margin…");

    try {
      for (let i = 0; i < strategyMetrics.legs.length; i++) {
        const leg = strategyMetrics.legs[i];
        setExecutionMessage(`Submitting Leg ${i + 1} of ${strategyMetrics.legs.length}: ${leg.side} ${leg.contract.symbol}…`);

        const orderBody = {
          symbol: leg.contract.symbol,
          side: leg.side,
          type: "LIMIT",
          product: "FNO",
          quantity: leg.contract.lot_size * strategyLots,
          price_paise: leg.contract.ltp_paise,
        };

        const res = await fetch(`${apiUrl}/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(orderBody),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || `Leg ${i + 1} (${leg.contract.symbol}) execution rejected`);
        }
      }

      setExecutionMessage("Strategy deployed successfully! Basket filled into active positions.");
      onStrategyExecuted?.();
      setTimeout(() => {
        setExecutionMessage(null);
        setActiveStrategy("NONE");
        onClose();
      }, 1600);
    } catch (err: unknown) {
      setExecutionError(err instanceof Error ? err.message : "Strategy execution failed");
      setExecutionMessage(null);
    } finally {
      setExecutingStrategy(false);
    }
  };

  if (!isOpen) return null;

  const pcr = chain?.put_call_ratio ?? 1;
  const pcrSentiment =
    pcr >= 1.2
      ? { label: "BULLISH (Heavy Put Writing)", color: "text-emerald-400 bg-emerald-950/60 border-emerald-700/40" }
      : pcr <= 0.8
      ? { label: "BEARISH (Heavy Call Writing)", color: "text-rose-400 bg-rose-950/60 border-rose-700/40" }
      : { label: "NEUTRAL / BALANCED", color: "text-amber-400 bg-amber-950/60 border-amber-700/40" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-7xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        
        {/* Header Bar */}
        <div className="border-b border-slate-800/80 px-4 py-3 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600/30 to-indigo-600/30 border border-cyan-500/30 text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Option Chain & Strategy Desk
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Black-Scholes Greeks
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> Multi-Leg Presets
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Institutional dual-sided Call & Put ladders with real-time IV, Delta, Gamma, Theta, and multi-leg strategy execution
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewGreeks(!viewGreeks)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                viewGreeks
                  ? "bg-indigo-950/60 border-indigo-500/40 text-indigo-300"
                  : "bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white"
              }`}
            >
              {viewGreeks ? "Hide Greeks (Delta/Theta)" : "Show Greeks (Delta/Theta)"}
            </button>

            <button
              onClick={() => void fetchOptionChain(selectedSymbol)}
              disabled={loading}
              title="Refresh Chain"
              className="p-2 rounded-lg border border-slate-800 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg border border-slate-800 bg-slate-800/50 hover:bg-rose-950/40 hover:border-rose-800/40 text-slate-400 hover:text-rose-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Controls & Metrics Bar */}
        <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Symbol Selector Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {SYMBOLS.map((item) => (
              <button
                key={item.symbol}
                onClick={() => handleSymbolChange(item.symbol)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedSymbol === item.symbol
                    ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                    : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Underlier & Market Stats */}
          {chain && (
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-medium">Spot Price</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-white">
                    {formatPaise(spotPricePaise ?? chain.spot_price_paise)}
                  </span>
                  {liveSpotQuote?.change_percent !== undefined && (
                    <span
                      className={`text-[10px] font-semibold font-mono ${
                        liveSpotQuote.change_percent >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {liveSpotQuote.change_percent >= 0 ? "+" : ""}
                      {liveSpotQuote.change_percent.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-medium">Expiry</span>
                <span className="text-xs font-semibold text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30">
                  {chain.expiry_date}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-medium">Put-Call Ratio</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">{pcr.toFixed(2)}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${pcrSentiment.color}`}>
                    {pcrSentiment.label}
                  </span>
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-medium">Lot Size</span>
                <span className="text-xs font-bold text-slate-200">
                  {chain.lot_size} units
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Strategy Presets Bar */}
        <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Strategies:
            </span>

            <button
              onClick={() => setActiveStrategy(activeStrategy === "BULL_CALL_SPREAD" ? "NONE" : "BULL_CALL_SPREAD")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                activeStrategy === "BULL_CALL_SPREAD"
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20"
                  : "bg-slate-850 text-emerald-400 hover:bg-emerald-950/40 border-emerald-800/40"
              }`}
            >
              <TrendingUp className="w-3 h-3" /> Bull Call Spread
            </button>

            <button
              onClick={() => setActiveStrategy(activeStrategy === "BEAR_PUT_SPREAD" ? "NONE" : "BEAR_PUT_SPREAD")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                activeStrategy === "BEAR_PUT_SPREAD"
                  ? "bg-rose-500 text-slate-950 border-rose-400 shadow-md shadow-rose-500/20"
                  : "bg-slate-850 text-rose-400 hover:bg-rose-950/40 border-rose-800/40"
              }`}
            >
              <TrendingDown className="w-3 h-3" /> Bear Put Spread
            </button>

            <button
              onClick={() => setActiveStrategy(activeStrategy === "LONG_STRADDLE" ? "NONE" : "LONG_STRADDLE")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                activeStrategy === "LONG_STRADDLE"
                  ? "bg-purple-500 text-white border-purple-400 shadow-md shadow-purple-500/20"
                  : "bg-slate-850 text-purple-300 hover:bg-purple-950/40 border-purple-800/40"
              }`}
            >
              <Activity className="w-3 h-3" /> Long Straddle
            </button>

            <button
              onClick={() => setActiveStrategy(activeStrategy === "SHORT_STRANGLE" ? "NONE" : "SHORT_STRANGLE")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                activeStrategy === "SHORT_STRANGLE"
                  ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
                  : "bg-slate-850 text-amber-300 hover:bg-amber-950/40 border-amber-800/40"
              }`}
            >
              <ShieldCheck className="w-3 h-3" /> Short Strangle
            </button>

            {activeStrategy !== "NONE" && (
              <button
                onClick={() => setActiveStrategy("NONE")}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                Reset
              </button>
            )}
          </div>

          {activeStrategy !== "NONE" && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Lots:</span>
              <div className="flex items-center border border-slate-700 rounded-lg bg-slate-900 overflow-hidden">
                <button
                  onClick={() => setStrategyLots(Math.max(1, strategyLots - 1))}
                  className="px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 active:bg-slate-700"
                >
                  -
                </button>
                <span className="px-2.5 py-0.5 text-xs font-bold text-white font-mono">{strategyLots}</span>
                <button
                  onClick={() => setStrategyLots(strategyLots + 1)}
                  className="px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 active:bg-slate-700"
                >
                  +
                </button>
              </div>
              <span className="text-[10px] text-slate-500">
                ({chain ? chain.lot_size * strategyLots : 0} Qty)
              </span>
            </div>
          )}
        </div>

        {/* Strategy Payoff Card (When Strategy is Active) */}
        {strategyMetrics && (
          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border-b border-indigo-900/40">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white tracking-tight">
                    {strategyMetrics.title}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                      strategyMetrics.bias === "BULLISH"
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/50"
                        : strategyMetrics.bias === "BEARISH"
                        ? "bg-rose-950/80 text-rose-300 border-rose-700/50"
                        : strategyMetrics.bias === "VOLATILE"
                        ? "bg-purple-950/80 text-purple-300 border-purple-700/50"
                        : "bg-amber-950/80 text-amber-300 border-amber-700/50"
                    }`}
                  >
                    {strategyMetrics.bias}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 max-w-xl">
                  {strategyMetrics.description}
                </p>
                {/* Legs breakdown */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                  {strategyMetrics.legs.map((leg) => (
                    <span
                      key={leg.contract.symbol}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 font-mono text-[10px]"
                    >
                      <span
                        className={`font-black ${
                          leg.side === "BUY" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {leg.side}
                      </span>
                      <span className="text-slate-200">{leg.contract.symbol}</span>
                      <span className="text-slate-400">@ ₹{(leg.contract.ltp_paise / 100).toFixed(2)}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Payoff Grid & Execution CTA */}
              <div className="flex items-center gap-4">
                <div className="grid grid-cols-4 gap-3 text-right bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-medium">Net Flow</div>
                    <div className={`text-xs font-bold font-mono ${strategyMetrics.isCredit ? "text-emerald-400" : "text-slate-200"}`}>
                      {strategyMetrics.isCredit ? "+" : "-"}₹{((strategyMetrics.netPremiumPerUnitPaise * (chain?.lot_size || 50) * strategyLots) / 100).toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-medium">Max Profit</div>
                    <div className="text-xs font-bold text-emerald-400 font-mono">
                      {strategyMetrics.maxProfitPaise === "UNLIMITED"
                        ? "Unlimited"
                        : `₹${(strategyMetrics.maxProfitPaise / 100).toFixed(2)}`}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-medium">Max Loss</div>
                    <div className="text-xs font-bold text-rose-400 font-mono">
                      {strategyMetrics.maxLossPaise === "UNLIMITED"
                        ? "Unlimited"
                        : `₹${(strategyMetrics.maxLossPaise / 100).toFixed(2)}`}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-medium">Breakeven</div>
                    <div className="text-xs font-bold text-cyan-300 font-mono">
                      {strategyMetrics.breakevens.join(", ")}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => void handleExecuteStrategy()}
                    disabled={executingStrategy}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {executingStrategy ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Deploying Basket…</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Deploy Strategy ({strategyMetrics.legs.length} Legs)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Execution Messages & Toasts */}
            {executionMessage && (
              <div className="mt-2 text-xs text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 p-2 rounded-lg flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>{executionMessage}</span>
              </div>
            )}
            {executionError && (
              <div className="mt-2 text-xs text-rose-300 bg-rose-950/60 border border-rose-800/40 p-2 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>{executionError}</span>
              </div>
            )}
          </div>
        )}

        {/* Main Option Chain Table */}
        <div className="flex-1 overflow-auto bg-slate-950/40">
          {loading && !chain ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="text-xs">Calculating Black-Scholes Greeks and option chain ladder…</p>
            </div>
          ) : error ? (
            <div className="h-96 flex flex-col items-center justify-center gap-2 text-rose-400">
              <p className="text-sm font-semibold">{error}</p>
              <button
                onClick={() => void fetchOptionChain(selectedSymbol)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700"
              >
                Try Again
              </button>
            </div>
          ) : !chain || chain.strikes.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-xs text-slate-500">
              No strikes available for this instrument.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 select-none">
                <tr>
                  {/* CALLS HEADER */}
                  <th colSpan={viewGreeks ? 7 : 3} className="text-center py-2 bg-emerald-950/30 text-emerald-400 font-bold border-r border-slate-800">
                    CALLS (CE)
                  </th>
                  {/* STRIKE HEADER */}
                  <th className="text-center py-2 px-3 bg-slate-800 text-white font-bold border-r border-slate-800">
                    STRIKE
                  </th>
                  {/* PUTS HEADER */}
                  <th colSpan={viewGreeks ? 7 : 3} className="text-center py-2 bg-rose-950/30 text-rose-400 font-bold">
                    PUTS (PE)
                  </th>
                </tr>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                  {/* Call Columns */}
                  <th className="py-1.5 px-2 text-right">OI</th>
                  {viewGreeks && <th className="py-1.5 px-1.5 text-right">IV%</th>}
                  {viewGreeks && <th className="py-1.5 px-1.5 text-right">Delta Δ</th>}
                  {viewGreeks && <th className="py-1.5 px-1.5 text-right">Theta Θ</th>}
                  {viewGreeks && <th className="py-1.5 px-1.5 text-right">Gamma Γ</th>}
                  <th className="py-1.5 px-2.5 text-right font-bold text-emerald-400">LTP (₹)</th>
                  <th className="py-1.5 px-2 text-center border-r border-slate-800">Trade</th>

                  {/* Strike Column */}
                  <th className="py-1.5 px-3 text-center bg-slate-800/80 text-white font-bold border-r border-slate-800">
                    Strike (₹)
                  </th>

                  {/* Put Columns */}
                  <th className="py-1.5 px-2 text-center border-r border-slate-800/50">Trade</th>
                  <th className="py-1.5 px-2.5 text-left font-bold text-rose-400">LTP (₹)</th>
                  {viewGreeks && <th className="py-1.5 px-1.5 text-left">Delta Δ</th>}
                  {viewGreeks && <th className="py-1.5 px-1.5 text-left">Theta Θ</th>}
                  {viewGreeks && <th className="py-1.5 px-1.5 text-left">Gamma Γ</th>}
                  {viewGreeks && <th className="py-1.5 px-1.5 text-left">IV%</th>}
                  <th className="py-1.5 px-2 text-left">OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {chain.strikes.map((row) => {
                  const strikeRupees = row.strike_price_paise / 100;
                  const callLTPRupees = (row.call.ltp_paise / 100).toFixed(2);
                  const putLTPRupees = (row.put.ltp_paise / 100).toFixed(2);
                  const isATM = row.is_atm;

                  // Strategy Leg Highlighting
                  const callLeg = strategyMetrics?.legs.find(
                    (l) => l.contract.symbol === row.call.symbol
                  );
                  const putLeg = strategyMetrics?.legs.find(
                    (l) => l.contract.symbol === row.put.symbol
                  );

                  return (
                    <tr
                      key={row.strike_price_paise}
                      className={`transition-colors hover:bg-slate-850/60 ${
                        isATM
                          ? "bg-amber-500/10 font-medium"
                          : callLeg || putLeg
                          ? "bg-indigo-950/30"
                          : ""
                      }`}
                    >
                      {/* Call OI */}
                      <td className="py-2 px-2 text-right text-slate-300 text-[11px]">
                        {row.call.open_interest.toLocaleString()}
                      </td>
                      {/* Call IV */}
                      {viewGreeks && (
                        <td className="py-2 px-1.5 text-right text-slate-400 text-[10px]">
                          {row.call.iv.toFixed(1)}%
                        </td>
                      )}
                      {/* Call Delta */}
                      {viewGreeks && (
                        <td className="py-2 px-1.5 text-right text-emerald-400/90 text-[10px]">
                          +{row.call.delta.toFixed(3)}
                        </td>
                      )}
                      {/* Call Theta */}
                      {viewGreeks && (
                        <td className="py-2 px-1.5 text-right text-rose-400/80 text-[10px]">
                          {row.call.theta.toFixed(1)}
                        </td>
                      )}
                      {/* Call Gamma */}
                      {viewGreeks && (
                        <td className="py-2 px-1.5 text-right text-slate-400 text-[10px]">
                          {row.call.gamma.toFixed(5)}
                        </td>
                      )}
                      {/* Call LTP */}
                      <td className="py-2 px-2.5 text-right font-bold text-emerald-400 text-xs">
                        <div className="flex items-center justify-end gap-1.5">
                          {callLeg && (
                            <span
                              className={`text-[9px] font-black px-1 py-0.2 rounded border uppercase ${
                                callLeg.side === "BUY"
                                  ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                                  : "bg-rose-950 text-rose-300 border-rose-500"
                              }`}
                            >
                              {callLeg.side}
                            </span>
                          )}
                          <span>₹{callLTPRupees}</span>
                        </div>
                      </td>
                      {/* Call Actions */}
                      <td className="py-1 px-2 text-center border-r border-slate-800">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              onSelectContract(row.call, "BUY");
                              onClose();
                            }}
                            title={`Buy ${row.call.symbol} at ₹${callLTPRupees}`}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[10px] transition-transform active:scale-95"
                          >
                            B
                          </button>
                          <button
                            onClick={() => {
                              onSelectContract(row.call, "SELL");
                              onClose();
                            }}
                            title={`Sell ${row.call.symbol} at ₹${callLTPRupees}`}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white font-bold text-[10px] transition-colors"
                          >
                            S
                          </button>
                        </div>
                      </td>

                      {/* STRIKE PRICE */}
                      <td
                        className={`py-2 px-3 text-center border-r border-slate-800 font-bold text-xs ${
                          isATM
                            ? "bg-amber-500 text-slate-950 shadow-inner"
                            : "bg-slate-850/80 text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>{strikeRupees.toLocaleString("en-IN")}</span>
                          {isATM && (
                            <span className="text-[9px] uppercase px-1 py-0.2 bg-slate-950 text-amber-300 rounded font-black tracking-wider">
                              ATM
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Put Actions */}
                      <td className="py-1 px-2 text-center border-r border-slate-800/40">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              onSelectContract(row.put, "BUY");
                              onClose();
                            }}
                            title={`Buy ${row.put.symbol} at ₹${putLTPRupees}`}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[10px] transition-transform active:scale-95"
                          >
                            B
                          </button>
                          <button
                            onClick={() => {
                              onSelectContract(row.put, "SELL");
                              onClose();
                            }}
                            title={`Sell ${row.put.symbol} at ₹${putLTPRupees}`}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white font-bold text-[10px] transition-colors"
                          >
                            S
                          </button>
                        </div>
                      </td>
                      {/* Put LTP */}
                      <td className="py-2 px-2.5 text-left font-bold text-rose-400 text-xs">
                        <div className="flex items-center justify-start gap-1.5">
                          <span>₹{putLTPRupees}</span>
                          {putLeg && (
                            <span
                              className={`text-[9px] font-black px-1 py-0.2 rounded border uppercase ${
                                putLeg.side === "BUY"
                                  ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                                  : "bg-rose-950 text-rose-300 border-rose-500"
                              }`}
                            >
                              {putLeg.side}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Put Delta */}
                      {viewGreeks && (
                        <td className="py-2 px-1.5 text-left text-rose-400/90 text-[10px]">
                          {row.put.delta.toFixed(3)}
                        </td>
                      )}
                      {/* Put Theta */}
                      {viewGreeks && (
                        <td className="py-2 px-1.5 text-left text-rose-400/80 text-[10px]">
                          {row.put.theta.toFixed(1)}
                        </td>
                      )}
                      {/* Put Gamma */}
                      {viewGreeks && (
                        <td className="py-2 px-1.5 text-left text-slate-400 text-[10px]">
                          {row.put.gamma.toFixed(5)}
                        </td>
                      )}
                      {/* Put IV */}
                      {viewGreeks && (
                        <td className="py-2 px-1.5 text-left text-slate-400 text-[10px]">
                          {row.put.iv.toFixed(1)}%
                        </td>
                      )}
                      {/* Put OI */}
                      <td className="py-2 px-2 text-left text-slate-300 text-[11px]">
                        {row.put.open_interest.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Notes */}
        <div className="border-t border-slate-800 px-4 py-2 bg-slate-950 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Click <strong className="text-emerald-400">B (Buy)</strong> or <strong className="text-rose-400">S (Sell)</strong> on any strike to immediately load the option contract into the Order Ticket, or select a strategy preset above for one-click basket execution.
            </span>
          </div>
          <div className="text-slate-500 font-mono text-[10px]">
            Risk-Free Rate: 6.50% · Volatility Model: Skewed Lognormal Black-Scholes
          </div>
        </div>

      </div>
    </div>
  );
}
