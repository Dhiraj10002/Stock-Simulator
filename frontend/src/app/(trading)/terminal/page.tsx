"use client";

import React, { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import TradingTerminalDesk from "@/components/trading/TradingTerminalDesk";
import { useTradingStore } from "@/stores/trading-store";

function TerminalPageContent() {
  const searchParams = useSearchParams();
  const setSelectedSymbol = useTradingStore((s) => s.setSelectedSymbol);

  useEffect(() => {
    const symbolParam = searchParams.get("symbol");
    if (symbolParam) {
      setSelectedSymbol(symbolParam.toUpperCase());
    }
  }, [searchParams, setSelectedSymbol]);

  return <TradingTerminalDesk />;
}

export default function TerminalRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
            <span className="text-xs font-mono text-cyan-400">Loading Trading Terminal...</span>
          </div>
        </div>
      }
    >
      <TerminalPageContent />
    </Suspense>
  );
}
