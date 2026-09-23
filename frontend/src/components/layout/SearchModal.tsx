"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Layers,
  Zap,
  Activity,
  Filter,
  Loader2,
} from "lucide-react";
import { INSTRUMENT_METADATA, InstrumentMetadata } from "@/lib/mockData";
import { formatPaise, formatPercent } from "@/lib/format";
import { useTerminalStore } from "@/stores/terminal-store";
import { useUIStore } from "@/stores/ui-store";
import { useMultiSymbolQuotes } from "@/stores/market-store";
import { apiFetch } from "@/lib/api";
import { fetchBatchQuotes } from "@/lib/quoteService";
import type { StockSearchResult } from "@/types";
import FnoOrderModal from "@/components/trading/FnoOrderModal";

type SearchSegmentFilter = "ALL" | "EQUITY" | "FUTURES" | "OPTIONS";

export default function SearchModal() {
  const router = useRouter();
  const { isSearchPaletteOpen, setSearchPaletteOpen } = useUIStore();
  const setSelectedSymbol = useTerminalStore((s) => s.setSelectedSymbol);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SearchSegmentFilter>("ALL");

  // Debounce user input by 200ms to avoid overwhelming the search API
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);
    return () => clearTimeout(handler);
  }, [query]);

  // Live backend instrument search query from PostgreSQL instrument master
  const { data: apiResults, isFetching: isSearching } = useQuery<StockSearchResult[]>({
    queryKey: ["stocks-search", debouncedQuery, segmentFilter],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      let segmentParam = "";
      if (segmentFilter === "EQUITY") segmentParam = "&segment=NSE";
      else if (segmentFilter === "FUTURES") segmentParam = "&segment=FUTSTK";
      else if (segmentFilter === "OPTIONS") segmentParam = "&segment=OPTSTK";

      try {
        const res = await apiFetch<StockSearchResult[]>(
          `/stocks?q=${encodeURIComponent(debouncedQuery)}${segmentParam}`
        );
        return res || [];
      } catch (err) {
        console.warn("Backend stocks search error, falling back to local list:", err);
        return [];
      }
    },
    enabled: isSearchPaletteOpen && debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  // Scoped quote subscription — only re-renders when displayed search results' quotes change
  const searchResultSymbols = useMemo(
    () => (apiResults || []).map((r) => r.symbol),
    [apiResults]
  );
  const marketQuotes = useMultiSymbolQuotes(searchResultSymbols);

  // Prefetch live quotes for search results
  useEffect(() => {
    if (apiResults && apiResults.length > 0) {
      const syms = apiResults.map((r) => r.symbol);
      fetchBatchQuotes(syms).catch(() => {});
    }
  }, [apiResults]);

  // F&O Direct Buy/Sell order placement modal state
  const [fnoModalInstrument, setFnoModalInstrument] = useState<InstrumentMetadata | null>(null);
  const [fnoOrderSide, setFnoOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [isFnoModalOpen, setIsFnoModalOpen] = useState(false);

  const handleClose = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setSegmentFilter("ALL");
    setSearchPaletteOpen(false);
  }, [setSearchPaletteOpen]);

  const handleOpenFnoOrder = (item: InstrumentMetadata, side: "BUY" | "SELL" = "BUY") => {
    setSelectedSymbol(item.symbol);
    setFnoModalInstrument(item);
    setFnoOrderSide(side);
    setIsFnoModalOpen(true);
    // Close the search palette backdrop so the order modal is unobstructed
    setSearchPaletteOpen(false);
  };

  const handleSelect = (item: InstrumentMetadata) => {
    setSelectedSymbol(item.symbol);

    if (item.segment === "FUTURES" || item.segment === "OPTIONS") {
      // Open direct Buy/Sell order placement modal for this F&O contract
      handleOpenFnoOrder(item, "BUY");
    } else {
      handleClose();
      // If user selected an equity stock or index, route to its stock details
      let targetSymbol = item.underlying || item.symbol;
      if (targetSymbol.endsWith("-EQ")) {
        targetSymbol = targetSymbol.replace(/-EQ$/, "");
      }
      router.push(`/stocks/${encodeURIComponent(targetSymbol)}`);
    }
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
          setDebouncedQuery("");
          setSegmentFilter("ALL");
          setSearchPaletteOpen(true);
        }
      } else if (e.key === "Escape" && isSearchPaletteOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchPaletteOpen, setSearchPaletteOpen, handleClose]);

  // Comprehensive results query across PostgreSQL database + live market quotes + local instruments
  const results = useMemo(() => {
    const q = debouncedQuery.toUpperCase();
    const allMock = Object.values(INSTRUMENT_METADATA);

    // If query is empty, show default popular recommendations
    if (!q) {
      let filtered = allMock;
      if (segmentFilter === "EQUITY") {
        filtered = filtered.filter((i) => i.segment === "EQUITY" || i.segment === "INDEX");
      } else if (segmentFilter === "FUTURES") {
        filtered = filtered.filter((i) => i.segment === "FUTURES");
      } else if (segmentFilter === "OPTIONS") {
        filtered = filtered.filter((i) => i.segment === "OPTIONS");
      }
      return filtered.slice(0, 10);
    }

    const items: InstrumentMetadata[] = [];
    const seenSymbols = new Set<string>();

    // 1. Process backend API results
    if (apiResults && apiResults.length > 0) {
      for (const item of apiResults) {
        if (seenSymbols.has(item.symbol)) continue;
        seenSymbols.add(item.symbol);

        const isOpt =
          item.instrument_type.startsWith("OPT") ||
          item.symbol.endsWith("CE") ||
          item.symbol.endsWith("PE") ||
          item.symbol.includes(" CE") ||
          item.symbol.includes(" PE");
        const isFut = item.instrument_type.startsWith("FUT");
        const isIndex =
          item.instrument_type === "INDEX" ||
          item.symbol.startsWith("NIFTY") ||
          item.symbol.startsWith("BANKNIFTY");

        let seg: "EQUITY" | "INDEX" | "FUTURES" | "OPTIONS" = "EQUITY";
        if (isOpt) seg = "OPTIONS";
        else if (isFut) seg = "FUTURES";
        else if (isIndex) seg = "INDEX";

        const optType: "CE" | "PE" | undefined =
          item.symbol.endsWith("CE") || item.symbol.includes(" CE")
            ? "CE"
            : item.symbol.endsWith("PE") || item.symbol.includes(" PE")
            ? "PE"
            : undefined;

        const live = marketQuotes[item.symbol];
        const basePrice =
          live?.price_paise ||
          INSTRUMENT_METADATA[item.symbol]?.basePricePaise ||
          (parseFloat(item.strike) || 250000);
        const changePct =
          live?.change_percent ??
          (INSTRUMENT_METADATA[item.symbol]?.dayChangePercent ?? 0);

        items.push({
          symbol: item.symbol,
          name: item.name || item.symbol,
          exchange: item.exchange_segment === "NFO" ? "NSE-NFO" : "NSE",
          basePricePaise: basePrice,
          lotSize: item.lot_size || 1,
          dayChangePercent: changePct,
          segment: seg,
          expiry: item.expiry,
          optionType: optType,
        });
      }
    }

    // 2. Also match local instruments for index & stock instant suggestions
    const localFiltered = allMock.filter((item) => {
      const matchSym = item.symbol.toUpperCase().includes(q);
      const matchName = item.name.toUpperCase().includes(q);
      const matchUnderlying = item.underlying
        ? item.underlying.toUpperCase().includes(q)
        : false;
      const matchType = item.optionType
        ? item.optionType.toUpperCase().includes(q)
        : false;
      return matchSym || matchName || matchUnderlying || matchType;
    });

    for (const item of localFiltered) {
      if (!seenSymbols.has(item.symbol)) {
        seenSymbols.add(item.symbol);
        items.push(item);
      }
    }

    // Filter by active segment tab
    if (segmentFilter === "EQUITY") {
      return items.filter((i) => i.segment === "EQUITY" || i.segment === "INDEX");
    } else if (segmentFilter === "FUTURES") {
      return items.filter((i) => i.segment === "FUTURES");
    } else if (segmentFilter === "OPTIONS") {
      return items.filter((i) => i.segment === "OPTIONS");
    }

    return items.slice(0, 25);
  }, [debouncedQuery, apiResults, segmentFilter, marketQuotes]);

  if (!isSearchPaletteOpen && !isFnoModalOpen) return null;

  return (
    <>
      {isSearchPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors">
            {/* Search Input Bar */}
            <div className="flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <Search className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mr-3" />
              <input
                type="text"
                placeholder="Search all NSE stocks, indices & F&O contracts (e.g. TCS, NIFTY FUT, RELIANCE CE)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none font-medium"
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-cyan-500 animate-spin mr-2 shrink-0" />
              )}
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mr-2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200/80 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700/60 rounded">
                ESC
              </kbd>
            </div>

            {/* Segment Filter Quick Pills (All | NSE Cash | Futures | Options) */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-200/70 dark:border-slate-800/70 bg-slate-50/40 dark:bg-slate-900/40 overflow-x-auto no-scrollbar">
              <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>Filter:</span>
              </span>

              {(
                [
                  { key: "ALL", label: "All Instruments" },
                  { key: "EQUITY", label: "NSE Stocks" },
                  { key: "FUTURES", label: "Futures (FUT)" },
                  { key: "OPTIONS", label: "Options (CE / PE)" },
                ] as const
              ).map((seg) => (
                <button
                  key={seg.key}
                  onClick={() => setSegmentFilter(seg.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    segmentFilter === seg.key
                      ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 font-bold shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {seg.label}
                </button>
              ))}
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-2 space-y-1">
              {results.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold">
                    No instruments found matching &quot;{query}&quot;
                  </p>
                  <p className="text-xs text-slate-400">
                    Try searching by stock name (e.g. TCS, Reliance, Supreme) or derivative keyword (e.g. FUT, CE, PE).
                  </p>
                </div>
              ) : (
                results.map((item) => {
                  const isProfit = item.dayChangePercent >= 0;
                  const isFno = item.segment === "FUTURES" || item.segment === "OPTIONS";

                  return (
                    <div
                      key={item.symbol}
                      onClick={() => handleSelect(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSelect(item);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Symbol Avatar / Badge Icon */}
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${
                            item.segment === "FUTURES"
                              ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60"
                              : item.optionType === "CE"
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
                              : item.optionType === "PE"
                              ? "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/60"
                              : item.segment === "INDEX"
                              ? "bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/60"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700/60 group-hover:border-cyan-500/40"
                          }`}
                        >
                          {item.segment === "FUTURES" ? (
                            "FUT"
                          ) : item.optionType ? (
                            item.optionType
                          ) : (
                            (item?.symbol || "---").slice(0, 3)
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tracking-tight group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                              {item.symbol}
                            </span>

                            {/* Badges */}
                            {item.segment === "FUTURES" && (
                              <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                F&O FUT
                              </span>
                            )}
                            {item.optionType === "CE" && (
                              <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                CALL (CE)
                              </span>
                            )}
                            {item.optionType === "PE" && (
                              <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                PUT (PE)
                              </span>
                            )}
                            {item.segment === "INDEX" && (
                              <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                                INDEX
                              </span>
                            )}
                            {item.segment === "EQUITY" && (
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50">
                                {item.exchange}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px] sm:max-w-xs">
                            {item.name}
                            {item.lotSize > 1 ? ` • Lot: ${item.lotSize}` : ""}
                            {item.expiry ? ` • ${item.expiry}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Direct Buy/Sell Quick Action Buttons for F&O instruments */}
                        {isFno ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFnoOrder(item, "BUY");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-xs hover:shadow-cyan-500/25 transition-all active:scale-95 cursor-pointer"
                              title={`Buy ${item.symbol}`}
                            >
                              Buy
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFnoOrder(item, "SELL");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs hover:shadow-rose-500/25 transition-all active:scale-95 cursor-pointer"
                              title={`Sell ${item.symbol}`}
                            >
                              Sell
                            </button>
                          </div>
                        ) : null}

                        <div className="text-right">
                          <div className="text-sm font-bold font-tabular text-slate-900 dark:text-slate-100">
                            {formatPaise(item.basePricePaise)}
                          </div>
                          <div
                            className={`text-[11px] font-bold flex items-center justify-end gap-0.5 ${
                              isProfit
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
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

                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer info */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Select any instrument to open order placement or view details</span>
              <span className="font-mono text-[10px] bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>NSE & F&O Live DB Sync</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* F&O Direct Buy/Sell Order Placement Modal */}
      <FnoOrderModal
        isOpen={isFnoModalOpen}
        onClose={() => {
          setIsFnoModalOpen(false);
          setFnoModalInstrument(null);
        }}
        instrument={fnoModalInstrument}
        initialSide={fnoOrderSide}
      />
    </>
  );
}
