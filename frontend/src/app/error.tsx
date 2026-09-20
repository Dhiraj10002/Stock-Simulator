"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home, SlidersHorizontal } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Stock Simulator Error Boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 -right-32 w-80 h-80 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-32 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full text-center space-y-6 relative z-10">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 mx-auto flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">
            Market Feed Interruption
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Execution Interface Error
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            An unexpected error occurred during state reconciliation. Your account balance and open positions remain safely preserved in the ledger.
          </p>
        </div>

        {error.digest && (
          <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400">
            Error Digest: {error.digest}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs shadow-xl shadow-cyan-500/20 transition-all active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Re-establish Stream</span>
          </button>

          <Link
            href="/stocks/ITC"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <span>Explore Stocks</span>
          </Link>

          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs transition-colors"
          >
            <Home className="w-4 h-4 text-slate-400" />
            <span>Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
