"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import type { PreTradeCheckResponse, ApiResponse } from "@/types";

const POPULAR_INSTRUMENTS = [
  { symbol: "RELIANCE", name: "Reliance Industries", priceRupees: 2985.5 },
  { symbol: "TCS", name: "Tata Consultancy Services", priceRupees: 3890.0 },
  { symbol: "INFY", name: "Infosys Ltd", priceRupees: 1612.4 },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", priceRupees: 1642.5 },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", priceRupees: 985.2 },
  { symbol: "SBIN", name: "State Bank of India", priceRupees: 812.3 },
  { symbol: "NIFTY", name: "Nifty 50 Index", priceRupees: 25378.4 },
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
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<"DELIVERY" | "INTRADAY" | "FNO">("INTRADAY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL" | "SL-M">("LIMIT");
  const [quantity, setQuantity] = useState(50);
  const [priceRupees, setPriceRupees] = useState(2985.5);
  const [targetRupees, setTargetRupees] = useState(3045.0);
  const [stopLossRupees, setStopLossRupees] = useState(2955.0);

  // Simulation Results
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<PreTradeCheckResponse | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Apply Preset Setup
  const handleApplyPreset = (preset: "conservative" | "aggressive" | "fno") => {
    if (preset === "conservative") {
      setSymbol("RELIANCE");
      setSide("BUY");
      setProduct("DELIVERY");
      setQuantity(25);
      setPriceRupees(2985.5);
      setTargetRupees(3100.0);
      setStopLossRupees(2935.0);
    } else if (preset === "aggressive") {
      setSymbol("TATAMOTORS");
      setSide("BUY");
      setProduct("INTRADAY");
      setQuantity(150);
      setPriceRupees(985.2);
      setTargetRupees(1005.0);
      setStopLossRupees(972.0);
    } else {
      setSymbol("NIFTY");
      setSide("BUY");
      setProduct("FNO");
      setQuantity(50);
      setPriceRupees(25378.0);
      setTargetRupees(25550.0);
      setStopLossRupees(25280.0);
    }
    setResult(null);
  };

  // Run Simulation via API
  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setSimError("Authentication token missing. Please open the terminal first.");
      return;
    }

    setSimulating(true);
    setSimError(null);

    try {
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
      } else {
        setSimError(json.message || "Failed to analyze trade risk.");
      }
    } catch (err: unknown) {
      setSimError(err instanceof Error ? err.message : "Error executing pre-trade check");
    } finally {
      setSimulating(false);
    }
  };

  // 1-Click Launch Setup in Terminal
  const handleLaunchInTerminal = () => {
    setSelectedSymbol(symbol);
    router.push("/trade");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Presets Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Interactive Pre-Trade Risk Simulation Lab
            </h3>
            <p className="text-xs text-slate-400">
              Test risk-to-reward symmetry, margin allocation, and behavioral bias before execution.
            </p>
          </div>
        </div>

        {/* Preset Setup Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Presets:
          </span>
          <button
            type="button"
            onClick={() => handleApplyPreset("conservative")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 shrink-0"
          >
            Swing CNC (1:2.5)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset("aggressive")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 shrink-0"
          >
            MIS Scalp (1:1.5)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset("fno")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 shrink-0"
          >
            F&O Index Setup
          </button>
        </div>
      </div>

      {/* Grid: Left Form Setup + Right Simulation Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (5 cols): Parameter Inputs */}
        <div className="lg:col-span-5 rounded-2xl bg-slate-900/60 border border-slate-800 p-5 shadow-xl space-y-4">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider pb-2 border-b border-slate-800 flex items-center justify-between">
            <span>Trade Parameters</span>
            <button
              type="button"
              onClick={() => handleApplyPreset("conservative")}
              className="text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-1 font-normal"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </h4>

          <form onSubmit={handleSimulate} className="space-y-3.5 text-xs">
            {/* Instrument Symbol */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Instrument Counter
              </label>
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  const match = POPULAR_INSTRUMENTS.find((p) => p.symbol === e.target.value);
                  if (match) {
                    setPriceRupees(match.priceRupees);
                    setTargetRupees(Number((match.priceRupees * 1.02).toFixed(1)));
                    setStopLossRupees(Number((match.priceRupees * 0.99).toFixed(1)));
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none focus:border-cyan-500"
              >
                {POPULAR_INSTRUMENTS.map((inst) => (
                  <option key={inst.symbol} value={inst.symbol}>
                    {inst.symbol} — {inst.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Side & Product Selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Order Side</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSide("BUY")}
                    className={`py-1 rounded-lg font-bold text-xs transition-colors ${
                      side === "BUY"
                        ? "bg-emerald-500 text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide("SELL")}
                    className={`py-1 rounded-lg font-bold text-xs transition-colors ${
                      side === "SELL"
                        ? "bg-rose-500 text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Product</label>
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value as "DELIVERY" | "INTRADAY" | "FNO")}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:outline-none focus:border-cyan-500"
                >
                  <option value="DELIVERY">CNC (Delivery)</option>
                  <option value="INTRADAY">MIS (Intraday 5x)</option>
                  <option value="FNO">F&O (Derivatives)</option>
                </select>
              </div>
            </div>

            {/* Quantity & Order Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Order Type</label>
                <select
                  value={orderType}
                  onChange={(e) =>
                    setOrderType(e.target.value as "MARKET" | "LIMIT" | "SL" | "SL-M")
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:outline-none focus:border-cyan-500"
                >
                  <option value="LIMIT">LIMIT</option>
                  <option value="MARKET">MARKET</option>
                  <option value="SL">STOP LOSS (SL)</option>
                  <option value="SL-M">SL-MARKET</option>
                </select>
              </div>
            </div>

            {/* Entry Price */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">
                Entry Price (₹)
              </label>
              <input
                type="number"
                step={0.05}
                value={priceRupees}
                onChange={(e) => setPriceRupees(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Bracket Risk Safeguards: Target & Stop-Loss */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Target Price (₹)
                </label>
                <input
                  type="number"
                  step={0.05}
                  value={targetRupees}
                  onChange={(e) => setTargetRupees(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  Stop-Loss Price (₹)
                </label>
                <input
                  type="number"
                  step={0.05}
                  value={stopLossRupees}
                  onChange={(e) => setStopLossRupees(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-rose-300 font-mono font-bold focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={simulating}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{simulating ? "Simulating AI Risk Models…" : "Run Risk Check"}</span>
            </button>
          </form>
        </div>

        {/* Right (7 cols): Simulation Output & Behavioral Audit */}
        <div className="lg:col-span-7 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Pre-Execution AI Audit Scorecard
              </span>
              {result && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded border uppercase ${
                    result.risk_level === "SAFE"
                      ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                      : result.risk_level === "MODERATE"
                      ? "bg-amber-950 text-amber-400 border-amber-800"
                      : "bg-rose-950 text-rose-400 border-rose-800"
                  }`}
                >
                  {result.risk_level}
                </span>
              )}
            </div>

            {simError && (
              <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 mt-4">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{simError}</span>
              </div>
            )}

            {!result && !simError && (
              <div className="py-20 text-center text-slate-500 space-y-3">
                <div className="w-14 h-14 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
                  <ShieldCheck className="w-7 h-7 text-cyan-400" />
                </div>
                <h4 className="font-bold text-slate-200 text-sm">Awaiting Simulation Parameters</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Configure your hypothetical order ticket on the left and click <strong>Run Risk Check</strong> to compute institutional margin obligation, risk-reward symmetry, and behavioral hazards.
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-5 mt-4">
                {/* Score & Ratio Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Safety Score */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      Discipline Safety Score
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-black font-tabular text-slate-100">
                        {result.risk_score ?? 85}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">/ 100</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (result.risk_score ?? 85) >= 75
                            ? "bg-emerald-400"
                            : (result.risk_score ?? 85) >= 50
                            ? "bg-amber-400"
                            : "bg-rose-400"
                        }`}
                        style={{ width: `${result.risk_score ?? 85}%` }}
                      />
                    </div>
                  </div>

                  {/* Risk : Reward Ratio */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      Risk : Reward (R:R)
                    </span>
                    <div className="text-2xl font-black font-tabular text-cyan-300">
                      {result.risk_reward_ratio
                        ? `1 : ${result.risk_reward_ratio.toFixed(2)}`
                        : "—"}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {result.risk_reward_ratio && result.risk_reward_ratio >= 2.0
                        ? "Favorable asymmetric edge"
                        : "Sub-optimal payoff profile"}
                    </span>
                  </div>

                  {/* Margin Impact % */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      Margin Commitment
                    </span>
                    <div className="text-2xl font-black font-tabular text-slate-200">
                      {formatPercent(result.margin_impact_pct)}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Req: {formatPaise(result.required_margin_paise)}
                    </span>
                  </div>
                </div>

                {/* Warnings List */}
                {result.warnings && result.warnings.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/40 space-y-2">
                    <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Behavioral & Risk Warnings ({result.warnings.length})
                    </span>
                    <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                      {result.warnings.map((w, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI Advice Card */}
                {result.advice && (
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-1.5">
                    <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5" />
                      AI Mentor Coaching Note
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed italic">
                      &ldquo;{result.advice}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Footer: Launch Setup into Terminal */}
          {result && (
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Ready to trade {quantity} qty of {symbol}?
              </span>
              <button
                type="button"
                onClick={handleLaunchInTerminal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all hover:scale-105"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Open in Trading Terminal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
