"use client";

import React, { Component, Suspense, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, RotateCcw, ArrowLeft } from "lucide-react";
import StockDetailsPage from "@/components/stocks/StockDetailsPage";

class StockRouteErrorBoundary extends Component<
  { children: ReactNode; symbol: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; symbol: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("StockRouteErrorBoundary caught error for:", this.props.symbol, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full space-y-5 rounded-2xl border border-amber-500/30 bg-white dark:bg-slate-900 p-8 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-auto flex items-center justify-center text-amber-500">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Instrument Feed Reconnecting
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unable to synchronize market data for <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">{this.props.symbol}</span>. Your open positions and portfolio balance remain safely secured.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => this.setState({ hasError: false })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Stream</span>
              </button>
              <Link
                href="/stocks"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Explore Stocks</span>
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function StockDynamicContent() {
  const params = useParams();
  const rawSymbol = params?.symbol
    ? Array.isArray(params.symbol)
      ? params.symbol[0]
      : params.symbol
    : "ITC";
  const symbol = decodeURIComponent(rawSymbol);

  return (
    <StockRouteErrorBoundary key={symbol} symbol={symbol}>
      <StockDetailsPage initialSymbol={symbol} />
    </StockRouteErrorBoundary>
  );
}

export default function StockSymbolRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-teal-500 animate-pulse" />
        </div>
      }
    >
      <StockDynamicContent />
    </Suspense>
  );
}
