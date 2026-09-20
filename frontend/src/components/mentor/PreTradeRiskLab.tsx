"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTerminalStore } from "@/stores/terminal-store";
import { formatPaise, formatPercent } from "@/lib/format";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Zap,
  SlidersHorizontal,
  ArrowRight,
  TrendingUp,
  Play,
  RotateCcw,
  Sparkles,
  Search,
  Check,
} from "lucide-react";
import type { PreTradeCheckResponse, ApiResponse } from "@/types";

interface MarketInstrument {
  symbol: string;
  name: string;
  priceRupees: number;
  category: "NIFTY 50" | "High Growth & Trending" | "PSU & Defence" | "Indices & F&O";
}

const EXTENDED_INSTRUMENTS: MarketInstrument[] = [
  // NIFTY 50 Bluechips
  { symbol: "RELIANCE", name: "Reliance Industries", priceRupees: 2985.5, category: "NIFTY 50" },
  { symbol: "TCS", name: "Tata Consultancy Services", priceRupees: 4210.0, category: "NIFTY 50" },
  { symbol: "INFY", name: "Infosys Ltd", priceRupees: 1785.2, category: "NIFTY 50" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", priceRupees: 1642.5, category: "NIFTY 50" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", priceRupees: 1215.3, category: "NIFTY 50" },
  { symbol: "SBIN", name: "State Bank of India", priceRupees: 785.0, category: "NIFTY 50" },
  { symbol: "ITC", name: "ITC Ltd", priceRupees: 492.5, category: "NIFTY 50" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", priceRupees: 1564.0, category: "NIFTY 50" },
  { symbol: "LT", name: "Larsen & Toubro Ltd", priceRupees: 3620.0, category: "NIFTY 50" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", priceRupees: 2840.0, category: "NIFTY 50" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", priceRupees: 1790.0, category: "NIFTY 50" },
  { symbol: "AXISBANK", name: "Axis Bank Ltd", priceRupees: 1180.0, category: "NIFTY 50" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", priceRupees: 12450.0, category: "NIFTY 50" },
  { symbol: "SUNPHARMA", name: "Sun Pharma Industries", priceRupees: 1840.0, category: "NIFTY 50" },
  { symbol: "TITAN", name: "Titan Company Ltd", priceRupees: 3450.0, category: "NIFTY 50" },
  { symbol: "WIPRO", name: "Wipro Ltd", priceRupees: 528.0, category: "NIFTY 50" },

  // High Growth & Trending
  { symbol: "ZOMATO", name: "Zomato Ltd (Eternal)", priceRupees: 282.4, category: "High Growth & Trending" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", priceRupees: 985.2, category: "High Growth & Trending" },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd", priceRupees: 152.8, category: "High Growth & Trending" },
  { symbol: "TRENT", name: "Trent Ltd (Westside & Zudio)", priceRupees: 7140.0, category: "High Growth & Trending" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", priceRupees: 7120.0, category: "High Growth & Trending" },
  { symbol: "ADANIENT", name: "Adani Enterprises", priceRupees: 2980.0, category: "High Growth & Trending" },
  { symbol: "SUZLON", name: "Suzlon Energy Ltd", priceRupees: 74.5, category: "High Growth & Trending" },

  // PSU & Defence
  { symbol: "BEL", name: "Bharat Electronics Ltd", priceRupees: 292.0, category: "PSU & Defence" },
  { symbol: "HAL", name: "Hindustan Aeronautics", priceRupees: 4450.0, category: "PSU & Defence" },
  { symbol: "POWERGRID", name: "Power Grid Corp", priceRupees: 325.0, category: "PSU & Defence" },
  { symbol: "NTPC", name: "NTPC Ltd", priceRupees: 395.0, category: "PSU & Defence" },
  { symbol: "COALINDIA", name: "Coal India Ltd", priceRupees: 485.0, category: "PSU & Defence" },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp", priceRupees: 295.0, category: "PSU & Defence" },

  // Indices & Derivatives
  { symbol: "NIFTY", name: "Nifty 50 Index", priceRupees: 25378.0, category: "Indices & F&O" },
  { symbol: "BANKNIFTY", name: "Bank Nifty Index", priceRupees: 52450.0, category: "Indices & F&O" },
];

export default function PreTradeRiskLab({
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1",
  token,
}: {
  apiUrl?: string;
  token?: string;
}) {
  const router = useRouter();
  const setSelectedSymbol = useTerminalStore((s) => s.setSelectedSymbol);

  // Form State
  const [symbol, setSymbol] = useState("RELIANCE");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<"DELIVERY" | "INTRADAY" | "FNO">("INTRADAY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL" | "SL-M">("LIMIT");
  const [quantity, setQuantity] = useState(50);
  const [priceRupees, setPriceRupees] = useState(2985.5);
  const [targetRupees, setTargetRupees] = useState(3065.0);
  const [stopLossRupees, setStopLossRupees] = useState(2945.0);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered instruments for live search
  const filteredInstruments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return EXTENDED_INSTRUMENTS;
    return EXTENDED_INSTRUMENTS.filter(
      (inst) => inst.symbol.toLowerCase().includes(q) || inst.name.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Simulation Results
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<PreTradeCheckResponse | null>(() => {
    return {
      risk_level: "SAFE",
      risk_score: 88,
      required_margin_paise: 2985500, // ₹29,855.00
      available_balance_paise: 100000000,
      margin_impact_pct: 2.98,
      concentration_impact_pct: 2.98,
      risk_reward_ratio: 1.96,
      warnings: [
        "Ensure stop-loss trigger order is placed concurrently to prevent overnight slippage.",
      ],
      advice:
        "Favorable asymmetric edge (1 : 1.96). Margin requirement is conservative (under 5% of available funds), giving your trade adequate breathing room without risking margin liquidation.",
    };
  });
  const [simError, setSimError] = useState<string | null>(null);

  // Apply a Stock Selection
  const handleSelectStock = (stockSymbol: string, stockPrice?: number) => {
    setSymbol(stockSymbol.toUpperCase());
    setIsSearchOpen(false);
    setSearchQuery("");

    const matched = EXTENDED_INSTRUMENTS.find((inst) => inst.symbol === stockSymbol.toUpperCase());
    const price = stockPrice ?? matched?.priceRupees ?? priceRupees;

    setPriceRupees(price);
    setTargetRupees(Number((price * 1.025).toFixed(1)));
    setStopLossRupees(Number((price * 0.985).toFixed(1)));
  };

  // Apply Preset Setup
  const handleApplyPreset = (preset: "conservative" | "aggressive" | "fno") => {
    if (preset === "conservative") {
      handleSelectStock("RELIANCE", 2985.5);
      setSide("BUY");
      setProduct("DELIVERY");
      setQuantity(25);
      setTargetRupees(3100.0);
      setStopLossRupees(2935.0);
    } else if (preset === "aggressive") {
      handleSelectStock("TATAMOTORS", 985.2);
      setSide("BUY");
      setProduct("INTRADAY");
      setQuantity(150);
      setTargetRupees(1015.0);
      setStopLossRupees(970.0);
    } else {
      handleSelectStock("NIFTY", 25378.0);
      setSide("BUY");
      setProduct("FNO");
      setQuantity(50);
      setTargetRupees(25550.0);
      setStopLossRupees(25280.0);
    }
  };

  // Run Simulation
  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimError(null);

    const calculateClientRisk = (): PreTradeCheckResponse => {
      const isBuy = side === "BUY";
      const riskPerShare = isBuy ? (priceRupees - stopLossRupees) : (stopLossRupees - priceRupees);
      const rewardPerShare = isBuy ? (targetRupees - priceRupees) : (priceRupees - targetRupees);

      const absRisk = Math.abs(riskPerShare) || 1;
      const absReward = Math.abs(rewardPerShare) || 1;
      const rr = Number((absReward / absRisk).toFixed(2));

      const targetMovePct = priceRupees > 0 ? (absReward / priceRupees) * 100 : 0;
      const stopMovePct = priceRupees > 0 ? (absRisk / priceRupees) * 100 : 0;

      let marginMultiplier = 1;
      if (product === "INTRADAY") marginMultiplier = 0.2; // 5x leverage
      else if (product === "FNO") marginMultiplier = 0.15; // derivative margin

      const totalVal = priceRupees * quantity;
      const requiredMarginPaise = Math.round(totalVal * marginMultiplier * 100);
      const availablePaise = 100000000;
      const marginImpactPct = Number(((requiredMarginPaise / availablePaise) * 100).toFixed(2));

      let score = 85;
      const warnings: string[] = [];
      let circuitBreached = false;
      let fantasySetup = false;

      // 1. Direction Consistency
      if (stopLossRupees > 0 && riskPerShare <= 0) {
        warnings.push(`Invalid Stop-Loss: On a ${side} order, stop-loss price must be defensively ${isBuy ? "below" : "above"} your entry (₹${priceRupees.toFixed(2)}).`);
        score -= 40;
      }
      if (targetRupees > 0 && rewardPerShare <= 0) {
        warnings.push(`Invalid Target: On a ${side} order, target price must be favorably ${isBuy ? "above" : "below"} your entry (₹${priceRupees.toFixed(2)}).`);
        score -= 40;
      }

      // 2. Circuit Limits & Realistic Volatility Bands
      if (product === "INTRADAY" && targetMovePct > 20) {
        circuitBreached = true;
        warnings.push(`🚨 Circuit Limit Breach (+${targetMovePct.toFixed(1)}%): Exceeds NSE maximum daily price band (10%–20%). Intraday price cannot physically reach ₹${targetRupees.toFixed(2)} in a single session.`);
        score -= 65;
      } else if (product === "INTRADAY" && targetMovePct > 8) {
        warnings.push(`⚠️ Aggressive Intraday Target (+${targetMovePct.toFixed(1)}%): Standard daily volatility (ATR) for ${symbol} is 1.2%–2.5%. A move > 8% intraday is statistically rare (< 0.5% of sessions).`);
        score -= 25;
      } else if (targetMovePct > 40) {
        warnings.push(`⚠️ Unrealistic Horizon (+${targetMovePct.toFixed(1)}%): Target requires multi-quarter momentum. Disconnected from normal swing setups.`);
        score -= 25;
      }

      // 3. Risk-to-Reward & Wishful Thinking Bias
      if (circuitBreached || (rr > 8.0 && targetMovePct > 8)) {
        fantasySetup = true;
        warnings.push(`⚠️ Wishful Thinking Bias (1:${rr}): Setting an astronomical target (+${targetMovePct.toFixed(1)}%) against a narrow stop (${stopMovePct.toFixed(1)}%) has near-zero execution probability. Market noise will trigger the stop-loss before reaching the target.`);
        score = Math.min(score, 28);
      } else if (rr >= 1.8 && rr <= 4.5) {
        score += 10;
      } else if (rr >= 1.5) {
        score += 5;
      } else if (rr < 1.0) {
        score -= 25;
        warnings.push("Sub-optimal Risk-to-Reward ratio (< 1:1.0). Potential loss exceeds projected target gain.");
      } else {
        score -= 10;
        warnings.push("Marginal Risk-to-Reward ratio (< 1:1.5). Long term mathematical expectancy is negative.");
      }

      // 4. Capital & Order Execution
      if (marginImpactPct > 30) {
        score -= 20;
        warnings.push("High capital concentration: Order commits over 30% of your total account margin.");
      } else if (marginImpactPct > 15) {
        score -= 5;
        warnings.push("Moderate leverage: Monitor position closely during peak market volatility (14:30 – 15:30 IST).");
      }

      if (orderType === "MARKET") {
        score -= 5;
        warnings.push("Market order selected: Susceptible to bid-ask spread slippage on fast candles. Prefer Limit orders.");
      }

      const clampedScore = Math.min(99, Math.max(15, score));
      const riskLevel: "SAFE" | "MODERATE" | "HIGH_RISK" =
        (circuitBreached || clampedScore < 55) ? "HIGH_RISK" : clampedScore >= 75 ? "SAFE" : "MODERATE";

      let advice = "Disciplined setup with positive mathematical expectancy.";
      if (circuitBreached) {
        advice = `Critical Reality Check: An intraday target of ₹${targetRupees.toFixed(2)} (+${targetMovePct.toFixed(1)}%) on ${symbol} breaches Indian exchange daily circuit limits (10%–20%). Nifty 50 stocks trade within an average daily range (ATR) of 1.2%–2.5%. A disciplined intraday target for ${symbol} would be around ₹${(priceRupees * 1.018).toFixed(1)} (1.8% gain) with your ₹${stopLossRupees} stop-loss.`;
      } else if (fantasySetup) {
        advice = `Payoff Asymmetry Trap: While 1 : ${rr} looks attractive on paper, the probability of reaching a +${targetMovePct.toFixed(1)}% target before hitting a -${stopMovePct.toFixed(1)}% stop is statistically less than 0.5%. Recalibrate your target closer to market pivot levels.`;
      } else if (riskLevel === "SAFE") {
        advice = `Excellent trade symmetry for ${symbol}. Defined stop-loss caps risk effectively with a healthy 1 : ${rr} reward potential. Margin commitment (${marginImpactPct}%) is well within institutional safety limits.`;
      } else if (riskLevel === "MODERATE") {
        advice = `Acceptable setup for ${symbol}, but consider tightening your stop-loss or adjusting your target to align with institutional support/resistance levels.`;
      } else {
        advice = `Hazardous setup detected for ${symbol}. The parameters violate risk discipline or market volatility bands. Institutional guidance recommends reducing position size or recalibrating invalidation level.`;
      }

      return {
        risk_level: riskLevel,
        risk_score: clampedScore,
        required_margin_paise: requiredMarginPaise,
        available_balance_paise: availablePaise,
        margin_impact_pct: marginImpactPct,
        concentration_impact_pct: marginImpactPct,
        risk_reward_ratio: rr,
        warnings,
        advice,
      };
    };

    try {
      if (token) {
        const payload = {
          symbol,
          side,
          product,
          type: orderType,
          quantity,
          price_paise: Math.round(priceRupees * 100),
          target_paise: targetRupees > 0 ? Math.round(targetRupees * 100) : undefined,
          stop_loss_paise: stopLossRupees > 0 ? Math.round(stopLossRupees * 100) : undefined,
        };

        const res = await fetch(`${apiUrl}/ai/pretrade-check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const json: ApiResponse<PreTradeCheckResponse> = await res.json();
        if (res.ok && json.success && json.data) {
          setResult(json.data);
          return;
        }
      }

      // Seamless client-side simulation
      setTimeout(() => {
        setResult(calculateClientRisk());
      }, 350);
    } catch {
      setResult(calculateClientRisk());
    } finally {
      setSimulating(false);
    }
  };

  const handleLaunchInTerminal = () => {
    setSelectedSymbol(symbol);
    router.push(`/stocks/${encodeURIComponent(symbol)}`);
  };

  return (
    <div className="space-y-6 text-xs max-w-5xl mx-auto">
      {/* Top Banner & Presets Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-50 via-white to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm transition-all">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 shadow-sm shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-slate-100 tracking-tight">
                Pre-Trade Risk & Margin Simulation Lab
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                Any NSE/BSE Counter
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Simulate hypothetical order tickets, margin commitments, and risk-reward symmetry for any stock or index before executing.
            </p>
          </div>
        </div>

        {/* Preset Setup Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0">
            Presets:
          </span>
          <button
            type="button"
            onClick={() => handleApplyPreset("conservative")}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-orange-950/40 hover:from-orange-100 hover:to-amber-100 text-orange-950 dark:text-orange-200 text-xs font-bold border border-orange-300/90 dark:border-orange-700/60 shadow-sm shadow-orange-500/10 transition-all shrink-0 hover:scale-[1.02] active:scale-95"
          >
            Swing CNC (1:2.5)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset("aggressive")}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-orange-950/40 hover:from-orange-100 hover:to-amber-100 text-orange-950 dark:text-orange-200 text-xs font-bold border border-orange-300/90 dark:border-orange-700/60 shadow-sm shadow-orange-500/10 transition-all shrink-0 hover:scale-[1.02] active:scale-95"
          >
            MIS Scalp (1:1.5)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset("fno")}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-orange-950/40 hover:from-orange-100 hover:to-amber-100 text-orange-950 dark:text-orange-200 text-xs font-bold border border-orange-300/90 dark:border-orange-700/60 shadow-sm shadow-orange-500/10 transition-all shrink-0 hover:scale-[1.02] active:scale-95"
          >
            F&O Index Setup
          </button>
        </div>
      </div>

      {/* Grid: Left Form Setup + Right Simulation Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (5 cols): Parameter Inputs */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              Hypothetical Ticket
            </span>
            <button
              type="button"
              onClick={() => handleApplyPreset("conservative")}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 flex items-center gap-1 font-semibold transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          {/* Quick Stock Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Quick Pick Counters:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {["RELIANCE", "TCS", "ITC", "ZOMATO", "HDFCBANK", "TATAMOTORS", "NIFTY"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSelectStock(s)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                    symbol === s
                      ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm scale-105"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSimulate} className="space-y-4 text-xs">
            {/* Search & Custom Stock Input */}
            <div ref={searchContainerRef} className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  Instrument Symbol or Search
                </label>
                <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono font-bold">
                  Active: {symbol}
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search any stock or type custom ticker (e.g., ITC, ZOMATO, TATASTEEL)..."
                  value={searchQuery}
                  onFocus={() => setIsSearchOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium placeholder-slate-400 focus:outline-none focus:border-cyan-500 shadow-sm text-xs"
                />
              </div>

              {/* Live Search Results Popup */}
              {isSearchOpen && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto p-1.5 divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-150">
                  {/* Custom Ticker Button if not in list */}
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => handleSelectStock(searchQuery.trim())}
                      className="w-full text-left p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 font-bold flex items-center justify-between transition-colors mb-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Analyze Custom Symbol: <strong>{searchQuery.trim().toUpperCase()}</strong>
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-200 dark:bg-cyan-800 text-cyan-900 dark:text-cyan-100">
                        Custom
                      </span>
                    </button>
                  )}

                  {filteredInstruments.map((inst) => (
                    <button
                      key={inst.symbol}
                      type="button"
                      onClick={() => handleSelectStock(inst.symbol, inst.priceRupees)}
                      className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between text-xs transition-colors ${
                        symbol === inst.symbol
                          ? "bg-slate-100 dark:bg-slate-800/80 font-bold"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {inst.symbol}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate max-w-[200px]">
                          {inst.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block">
                          ₹{inst.priceRupees.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-slate-400 block">
                          {inst.category}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Grouped Select Dropdown (30+ Counters) */}
              <div className="pt-1">
                <select
                  value={symbol}
                  onChange={(e) => handleSelectStock(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:border-cyan-500 shadow-sm text-xs cursor-pointer"
                >
                  <optgroup label="🌟 NIFTY 50 Bluechips">
                    {EXTENDED_INSTRUMENTS.filter((i) => i.category === "NIFTY 50").map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.symbol} — {inst.name} (₹{inst.priceRupees})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🚀 High Growth & Trending">
                    {EXTENDED_INSTRUMENTS.filter((i) => i.category === "High Growth & Trending").map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.symbol} — {inst.name} (₹{inst.priceRupees})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🛡️ PSU & Defence">
                    {EXTENDED_INSTRUMENTS.filter((i) => i.category === "PSU & Defence").map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.symbol} — {inst.name} (₹{inst.priceRupees})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="📊 Major Indices & F&O">
                    {EXTENDED_INSTRUMENTS.filter((i) => i.category === "Indices & F&O").map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.symbol} — {inst.name} (₹{inst.priceRupees})
                      </option>
                    ))}
                  </optgroup>
                  {!EXTENDED_INSTRUMENTS.some((i) => i.symbol === symbol) && (
                    <option value={symbol}>
                      {symbol} (Custom User Instrument)
                    </option>
                  )}
                </select>
              </div>
            </div>

            {/* Side & Product Selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Order Side</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSide("BUY")}
                    className={`py-1.5 rounded-lg font-bold text-xs transition-all ${
                      side === "BUY"
                        ? "bg-emerald-500 text-slate-950 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide("SELL")}
                    className={`py-1.5 rounded-lg font-bold text-xs transition-all ${
                      side === "SELL"
                        ? "bg-rose-500 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Product</label>
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value as "DELIVERY" | "INTRADAY" | "FNO")}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-cyan-500 shadow-sm"
                >
                  <option value="DELIVERY">CNC (Delivery)</option>
                  <option value="INTRADAY">MIS (Intraday 5x)</option>
                  <option value="FNO">F&O (Derivatives)</option>
                </select>
              </div>
            </div>

            {/* Quantity & Order Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Quantity (Units)</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:border-cyan-500 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Order Type</label>
                <select
                  value={orderType}
                  onChange={(e) =>
                    setOrderType(e.target.value as "MARKET" | "LIMIT" | "SL" | "SL-M")
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-cyan-500 shadow-sm"
                >
                  <option value="LIMIT">LIMIT</option>
                  <option value="MARKET">MARKET</option>
                  <option value="SL">STOP LOSS (SL)</option>
                  <option value="SL-M">SL-MARKET</option>
                </select>
              </div>
            </div>

            {/* Entry Price */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                Entry Price (₹)
              </label>
              <input
                type="number"
                step={0.05}
                value={priceRupees}
                onChange={(e) => setPriceRupees(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:border-cyan-500 shadow-sm"
              />
            </div>

            {/* Bracket Risk Safeguards: Target & Stop-Loss */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Target Price (₹)
                </label>
                <input
                  type="number"
                  step={0.05}
                  value={targetRupees}
                  onChange={(e) => setTargetRupees(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-emerald-300 dark:border-emerald-800/80 rounded-xl px-3.5 py-2.5 text-emerald-700 dark:text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  Stop-Loss Price (₹)
                </label>
                <input
                  type="number"
                  step={0.05}
                  value={stopLossRupees}
                  onChange={(e) => setStopLossRupees(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-rose-300 dark:border-rose-800/80 rounded-xl px-3.5 py-2.5 text-rose-700 dark:text-rose-300 font-mono font-bold focus:outline-none focus:border-rose-500 shadow-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={simulating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{simulating ? `Auditing Risk for ${symbol}…` : `Run Risk Check on ${symbol}`}</span>
            </button>
          </form>
        </div>

        {/* Right (7 cols): Simulation Output & Behavioral Audit */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Pre-Execution AI Audit: <strong>{symbol}</strong>
              </span>
              {result && (
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                    result.risk_level === "SAFE"
                      ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                      : result.risk_level === "MODERATE"
                      ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                      : "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700"
                  }`}
                >
                  {result.risk_level}
                </span>
              )}
            </div>

            {simError && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 mt-4 shadow-sm">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{simError}</span>
              </div>
            )}

            {!result && !simError && (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto shadow-inner">
                  <ShieldCheck className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  Awaiting Simulation Parameters
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Select or search any stock on the left and click <strong>Run Risk Check</strong> to audit margin commitment and payoff symmetry.
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-4 mt-4">
                {/* Score & Ratio Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Safety Score */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                      Discipline Safety Score
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-black font-tabular text-slate-900 dark:text-slate-100">
                        {result.risk_score ?? 88}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">/ 100</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          (result.risk_score ?? 88) >= 75
                            ? "bg-emerald-500"
                            : (result.risk_score ?? 88) >= 55
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        }`}
                        style={{ width: `${result.risk_score ?? 88}%` }}
                      />
                    </div>
                  </div>

                  {/* Risk : Reward Ratio */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                      Risk : Reward (R:R)
                    </span>
                    <div className={`text-2xl font-black font-tabular ${
                      (result.risk_score ?? 88) <= 45 || (result.risk_reward_ratio && result.risk_reward_ratio > 8)
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-cyan-600 dark:text-cyan-300"
                    }`}>
                      {result.risk_reward_ratio ? `1 : ${result.risk_reward_ratio.toFixed(2)}` : "—"}
                    </div>
                    <span className={`text-[10px] font-medium ${
                      (result.risk_score ?? 88) <= 45 || (result.risk_reward_ratio && result.risk_reward_ratio > 8)
                        ? "text-rose-600 dark:text-rose-400 font-bold"
                        : "text-slate-500 dark:text-slate-400"
                    }`}>
                      {(result.risk_score ?? 88) <= 45 || (result.risk_reward_ratio && result.risk_reward_ratio > 8)
                        ? "⚠️ Fantasy Setup / Low Probability"
                        : result.risk_reward_ratio && result.risk_reward_ratio >= 1.8 && result.risk_reward_ratio <= 5.0
                        ? "Favorable asymmetric edge"
                        : result.risk_reward_ratio && result.risk_reward_ratio < 1.0
                        ? "Negative expectancy"
                        : "Sub-optimal payoff profile"}
                    </span>
                  </div>

                  {/* Margin Impact % */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-sm">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                      Margin Commitment
                    </span>
                    <div className="text-2xl font-black font-tabular text-slate-900 dark:text-slate-100">
                      {formatPercent(result.margin_impact_pct)}
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium font-mono">
                      Req: {formatPaise(result.required_margin_paise)}
                    </span>
                  </div>
                </div>

                {/* Critical Circuit Breaches (Red) */}
                {result.warnings && result.warnings.some((w) => w.startsWith("🚨")) && (
                  <div className="p-4 rounded-2xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 space-y-2 shadow-sm">
                    <span className="text-[11px] font-bold text-rose-900 dark:text-rose-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      Critical Exchange Circuit Limit Violation
                    </span>
                    <ul className="space-y-1.5 text-xs text-rose-950 dark:text-rose-200 list-disc list-inside font-semibold">
                      {result.warnings.filter((w) => w.startsWith("🚨")).map((w, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {w.replace(/^🚨\s*/, "")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Behavioral & Strategy Warnings (Amber) */}
                {result.warnings && result.warnings.some((w) => !w.startsWith("🚨")) && (
                  <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/50 space-y-2 shadow-sm">
                    <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      Risk Advisory & Behavioral Warnings ({result.warnings.filter((w) => !w.startsWith("🚨")).length})
                    </span>
                    <ul className="space-y-1.5 text-xs text-amber-950 dark:text-amber-200 list-disc list-inside font-medium">
                      {result.warnings.filter((w) => !w.startsWith("🚨")).map((w, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI Advice Card */}
                {result.advice && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/40 dark:to-blue-950/40 border border-cyan-200 dark:border-cyan-800/60 space-y-1.5 shadow-sm">
                    <span className="text-[11px] font-bold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      AI Mentor Coaching Note
                    </span>
                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed italic">
                      &ldquo;{result.advice}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Footer: Launch Setup into Terminal */}
          {result && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Simulated setup: <strong>{quantity} Qty</strong> of <strong>{symbol}</strong>
              </span>
              <button
                type="button"
                onClick={handleLaunchInTerminal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-[1.02]"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Open {symbol} Stock Terminal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
