"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { INSTRUMENT_METADATA } from "@/lib/mockData";
import { formatPaise, formatPercent } from "@/lib/format";
import { useTerminalStore } from "@/stores/terminal-store";
import { useUIStore } from "@/stores/ui-store";

export default function SearchModal() {
  const router = useRouter();
  const { isSearchPaletteOpen, setSearchPaletteOpen } = useUIStore();
  const setSelectedSymbol = useTerminalStore((s) => s.setSelectedSymbol);
  const [query, setQuery] = useState("");

  const handleClose = useCallback(() => {
    setQuery("");
    setSearchPaletteOpen(false);
  }, [setSearchPaletteOpen]);

  const handleSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    handleClose();
    router.push("/trade");
  };

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isSearchPaletteOpen) {
          handleClose();
        } else {
          setQuery("");
          setSearchPaletteOpen(true);
        }
      } else if (e.key === "Escape" && isSearchPaletteOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchPaletteOpen, setSearchPaletteOpen, handleClose]);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    const all = Object.values(INSTRUMENT_METADATA);
    if (!q) return all.slice(0, 8);
    return all.filter(
      (item) =>
        item.symbol.toUpperCase().includes(q) ||
        item.name.toUpperCase().includes(q)
    );
  }, [query]);

  if (!isSearchPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <Search className="w-5 h-5 text-cyan-400 shrink-0 mr-3" />
          <input
            type="text"
            placeholder="Search stocks, indices, F&O (e.g. RELIANCE, TCS, NIFTY)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-slate-500 hover:text-slate-300 mr-2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800/80 border border-slate-700/60 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {results.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              No instruments found matching &quot;{query}&quot;
            </div>
          ) : (
            results.map((item) => {
              const isProfit = item.dayChangePercent >= 0;
              return (
                <button
                  key={item.symbol}
                  onClick={() => handleSelect(item.symbol)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-slate-800/60 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-slate-800 border border-slate-700/60 flex items-center justify-center font-bold text-xs text-slate-200 shrink-0 group-hover:border-cyan-500/40">
                      {item.symbol.slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-100 tracking-tight">
                          {item.symbol}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                          {item.exchange}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate max-w-[240px]">
                        {item.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold font-tabular text-slate-100">
                        {formatPaise(item.basePricePaise)}
                      </div>
                      <div
                        className={`text-[11px] font-medium flex items-center justify-end gap-0.5 ${
                          isProfit ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isProfit ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        <span>{formatPercent(item.dayChangePercent)}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Select any instrument to open in Trading Terminal</span>
          <span>NSE & BSE Cash / F&O</span>
        </div>
      </div>
    </div>
  );
}
