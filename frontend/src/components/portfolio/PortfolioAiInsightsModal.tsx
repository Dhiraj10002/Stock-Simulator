"use client";

import React from "react";
import {
  Sparkles,
  X,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Layers,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

interface PortfolioAiInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  holdingsCount: number;
  totalValuationRupees: number;
  pnlPercent: number;
}

export default function PortfolioAiInsightsModal({
  isOpen,
  onClose,
  holdingsCount,
  totalValuationRupees,
  pnlPercent,
}: PortfolioAiInsightsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-cyan-500/10 via-slate-50 dark:via-slate-950/60 to-indigo-500/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>AI Portfolio Health Audit</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-bold">
                  v2.4 Live
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Institutional risk diagnostics & allocation optimizer
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Score Ribbon */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Overall Portfolio Score
            </span>
            <div className="text-3xl font-black font-tabular text-slate-900 dark:text-slate-100 flex items-baseline gap-1.5">
              <span>9.2</span>
              <span className="text-xs font-normal text-slate-400">/ 10</span>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Optimal Risk-Return</span>
            </span>
            <div className="text-[10px] text-slate-400 mt-1">
              Based on {holdingsCount} assets • MTM ROI: {pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Insights & Bullet Points */}
        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
          <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Well-Balanced Large-Cap Core</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pl-5.5">
              Capital is cleanly anchored in India&apos;s leading blue-chips (Reliance, TCS, HDFC Bank) providing low drawdowns and strong liquidity during high market volatility.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 dark:text-indigo-300">
              <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Hedging Through Index Derivatives</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pl-5.5">
              Holding active Nifty Futures and Call options provides dynamic upside participation while maintaining defined downside buffers.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>IT Sector Sizing Watch</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pl-5.5">
              Combined weight in TCS & INFY exceeds 34% of Demat equity. Consider allocating upcoming capital increments into Pharma or FMCG for defensiveness.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Powered by Deep Quant Risk Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
