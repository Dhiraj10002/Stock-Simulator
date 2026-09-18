"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Sparkles,
  Info,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { OptionChainResponse, OptionContract } from "@/types";

type OptionChainModalProps = {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  onSelectContract: (contract: OptionContract, side: "BUY" | "SELL") => void;
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
  onSelectContract,
  initialSymbol = "NIFTY",
}: OptionChainModalProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol);
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewGreeks, setViewGreeks] = useState<boolean>(true);

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
      // If initialSymbol matches one of the FNO symbols, use it, else default to NIFTY
      const validSym = SYMBOLS.some((s) => s.symbol === initialSymbol)
        ? initialSymbol
        : "NIFTY";
      setSelectedSymbol(validSym);
      void fetchOptionChain(validSym);
    }
  }, [isOpen, initialSymbol, fetchOptionChain]);

  const handleSymbolChange = (sym: string) => {
    setSelectedSymbol(sym);
    void fetchOptionChain(sym);
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-7xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Bar */}
        <div className="border-b border-slate-800/80 px-4 py-3 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600/30 to-indigo-600/30 border border-cyan-500/30 text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Option Chain (Greeks & Derivatives)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Black-Scholes Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Institutional dual-sided Call & Put ladders with real-time IV, Delta, Gamma, Theta, and Vega
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
        <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
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
                <span className="text-sm font-bold text-white">
                  {formatPaise(chain.spot_price_paise)}
                </span>
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

                  return (
                    <tr
                      key={row.strike_price_paise}
                      className={`transition-colors hover:bg-slate-850/60 ${
                        isATM
                          ? "bg-amber-500/10 font-medium"
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
                        ₹{callLTPRupees}
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
                        ₹{putLTPRupees}
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
              Click <strong className="text-emerald-400">B (Buy)</strong> or <strong className="text-rose-400">S (Sell)</strong> on any strike to immediately load the option contract into the Order Ticket.
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
