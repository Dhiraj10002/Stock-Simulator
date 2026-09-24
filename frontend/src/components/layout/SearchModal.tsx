"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  TrendingUp,
  Filter,
  Loader2,
  Check,
  Plus,
  BarChart2,
} from "lucide-react";
import type { InstrumentMetadata } from "@/types";
import { formatPaise, formatPercent } from "@/lib/format";
import { useTerminalStore } from "@/stores/terminal-store";
import { useUIStore } from "@/stores/ui-store";
import { useMultiSymbolQuotes } from "@/stores/market-store";
import { apiFetch } from "@/lib/api";
import { fetchBatchQuotes } from "@/lib/quoteService";
import type { StockSearchResult } from "@/types";
import FnoOrderModal from "@/components/trading/FnoOrderModal";

type SearchSegmentFilter = "ALL" | "EQUITY" | "FUTURES" | "OPTIONS";

/**
 * Format any raw symbol into clean Zerodha Kite-style display with spaces:
 * Examples:
 * - KEI27OCT26FUT -> "KEI OCT FUT", "NFO"
 * - TCS29SEP26FUT -> "TCS SEP FUT", "NFO"
 * - TCS27OCT262300CE -> "TCS OCT 2300 CE", "NFO"
 * - TCS27OCT262420PE -> "TCS OCT 2420 PE", "NFO"
 * - TCS 4150 CE -> "TCS SEP 4150 CE", "NFO"
 * - TCS -> "TCS", "NSE"
 */
export function formatKiteSymbol(
  symbol: string,
  expiry?: string,
  rawStrike?: string,
  rawOptType?: string
): { displayName: string; exchangeTag: string; isDerivative: boolean } {
  let s = (symbol || "").trim().toUpperCase();
  s = s.replace(/-EQ$/, "");

  // 1. Futures: e.g. KEI27OCT26FUT, TCS29SEP26FUT, KEI26SEPFUT, NIFTY26SEPFUT
  const futMatch = s.match(/^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?FUT$/);
  if (futMatch) {
    const under = futMatch[1];
    const month = futMatch[3];
    return { displayName: `${under} ${month} FUT`, exchangeTag: "NFO", isDerivative: true };
  }

  // 2. Options: e.g. TCS29SEP261940CE, TCS27OCT262300CE, NIFTY06OCT2625550CE, KEI27OCT264500PE
  const optMatch = s.match(/^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?(\d+(?:\.\d+)?)(CE|PE)$/);
  if (optMatch) {
    const under = optMatch[1];
    const month = optMatch[3];
    const strikeVal = optMatch[5];
    const type = optMatch[6];
    return { displayName: `${under} ${month} ${strikeVal} ${type}`, exchangeTag: "NFO", isDerivative: true };
  }

  // 3. Spaced option e.g. "TCS 4150 CE"
  if (s.includes(" CE") || s.includes(" PE")) {
    const parts = s.split(/\s+/);
    if (parts.length >= 3) {
      const monthMatch = (expiry || "").match(/[A-Z]{3}/i);
      const month = monthMatch ? monthMatch[0].toUpperCase() : "SEP";
      return { displayName: `${parts[0]} ${month} ${parts[1]} ${parts[2]}`, exchangeTag: "NFO", isDerivative: true };
    }
  }

  // 4. Fallback check using raw fields if provided
  if (rawOptType && (rawOptType === "CE" || rawOptType === "PE")) {
    const monthMatch = (expiry || "").match(/[A-Z]{3}/i);
    const month = monthMatch ? monthMatch[0].toUpperCase() : "SEP";
    let strikeVal = rawStrike || "";
    if (strikeVal.includes(".")) {
      const num = parseFloat(strikeVal);
      strikeVal = (num > 100000 ? num / 100 : num).toString();
    }
    return {
      displayName: `${s} ${month} ${strikeVal} ${rawOptType}`.trim(),
      exchangeTag: "NFO",
      isDerivative: true,
    };
  }

  // Standard equity
  const isBse = s.includes("BSE");
  return { displayName: s, exchangeTag: isBse ? "BSE" : "NSE", isDerivative: false };
}

export default function SearchModal() {
  const router = useRouter();
  const { isSearchPaletteOpen, setSearchPaletteOpen } = useUIStore();
  const setSelectedSymbol = useTerminalStore((s) => s.setSelectedSymbol);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SearchSegmentFilter>("ALL");

  // Debounce user input by 150ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 150);
    return () => clearTimeout(handler);
  }, [query]);

  // Watchlist query to show checkmark icon like Kite
  const { data: watchlistItems, refetch: refetchWatchlist } = useQuery<{ symbol: string }[]>({
    queryKey: ["watchlist"],
    queryFn: async () => {
      try {
        return (await apiFetch<{ symbol: string }[]>("/watchlist")) || [];
      } catch {
        return [];
      }
    },
    staleTime: 10_000,
  });

  const watchlistSet = useMemo(() => {
    return new Set((watchlistItems || []).map((w) => (w.symbol || "").toUpperCase()));
  }, [watchlistItems]);

  const handleToggleWatchlist = async (e: React.MouseEvent, sym: string) => {
    e.stopPropagation();
    const clean = sym.toUpperCase();
    const inWl = watchlistSet.has(clean);
    try {
      if (inWl) {
        await apiFetch(`/watchlist/${encodeURIComponent(clean)}`, { method: "DELETE" });
      } else {
        await apiFetch("/watchlist", { method: "POST", body: JSON.stringify({ symbol: clean }) });
      }
      refetchWatchlist();
    } catch (err) {
      console.error("Failed to toggle watchlist:", err);
    }
  };

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
    setSearchPaletteOpen(false);
  };

  const handleOpenChart = (item: InstrumentMetadata) => {
    handleClose();
    let targetSymbol = item.underlying || item.symbol;
    if (targetSymbol.endsWith("-EQ")) {
      targetSymbol = targetSymbol.replace(/-EQ$/, "");
    }
    router.push(`/stocks/${encodeURIComponent(targetSymbol)}`);
  };

  const handleSelect = (item: InstrumentMetadata) => {
    setSelectedSymbol(item.symbol);

    if (item.segment === "FUTURES" || item.segment === "OPTIONS") {
      handleOpenFnoOrder(item, "BUY");
    } else {
      handleClose();
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
      }
      if (e.key === "Escape" && isSearchPaletteOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchPaletteOpen, setSearchPaletteOpen, handleClose]);

  // Comprehensive results query formatted in clean Kite style
  const results = useMemo(() => {
    if (!apiResults || apiResults.length === 0) {
      return [];
    }

    const items: (InstrumentMetadata & { exchangeTag: string })[] = [];
    const seenSymbols = new Set<string>();

    for (const item of apiResults) {
      if (seenSymbols.has(item.symbol)) continue;
      seenSymbols.add(item.symbol);

      const kite = formatKiteSymbol(item.symbol, item.expiry, item.strike, item.option_type);

      const isOpt =
        item.instrument_type?.startsWith("OPT") ||
        item.symbol.endsWith("CE") ||
        item.symbol.endsWith("PE") ||
        item.symbol.includes(" CE") ||
        item.symbol.includes(" PE");
      const isFut = item.instrument_type?.startsWith("FUT") || item.symbol.endsWith("FUT");
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
      const basePrice = live?.price_paise || item.price_paise || 0;
      const changePct = live?.change_percent ?? item.change_percent ?? 0;

      items.push({
        symbol: item.symbol,
        displayName: item.display_name || kite.displayName,
        name: item.name || item.symbol,
        exchange: kite.exchangeTag,
        exchangeTag: kite.exchangeTag,
        basePricePaise: basePrice,
        lotSize: item.lot_size || 1,
        dayChangePercent: changePct,
        segment: seg,
        expiry: item.expiry,
        optionType: optType,
      });
    }

    // Filter by active segment tab
    let filtered = items;
    if (segmentFilter === "EQUITY") {
      filtered = items.filter((i) => i.segment === "EQUITY" || i.segment === "INDEX");
    } else if (segmentFilter === "FUTURES") {
      filtered = items.filter((i) => i.segment === "FUTURES");
    } else if (segmentFilter === "OPTIONS") {
      filtered = items.filter((i) => i.segment === "OPTIONS");
    }

    return filtered.slice(0, 30);
  }, [apiResults, segmentFilter, marketQuotes]);

  if (!isSearchPaletteOpen && !isFnoModalOpen) return null;

  return (
    <>
      {isSearchPaletteOpen && (
        <div
          role="presentation"
          onClick={handleClose}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start justify-center pt-14 sm:pt-20 px-3 animate-in fade-in duration-150"
        >
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-150"
          >
            {/* Input Bar */}
            <div className="flex items-center px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
              <input
                type="text"
                autoFocus
                placeholder="Search stocks, futures & options (e.g. TCS, KEI, NIFTY 23500 CE)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full py-4 text-sm bg-transparent placeholder-slate-400 text-slate-900 dark:text-slate-100 outline-none font-medium"
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
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-200/70 dark:border-slate-800/70 bg-slate-50/50 dark:bg-slate-950/40 overflow-x-auto no-scrollbar">
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

            {/* Results List: Clean Zerodha Kite Styled Table */}
            <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {results.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold">
                    {query.trim() ? `No instruments found matching "${query}"` : "Search Instruments"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {query.trim()
                      ? "Try searching by stock name (e.g. TCS, KEI, RELIANCE) or derivative contract (e.g. SEP FUT, 2300 CE)."
                      : "Type a symbol, company name, or contract to search NSE and NFO instruments."}
                  </p>
                </div>
              ) : (
                results.map((item) => {
                  const isProfit = (item.dayChangePercent ?? 0) >= 0;
                  const isFno = item.segment === "FUTURES" || item.segment === "OPTIONS";
                  const inWatchlist = watchlistSet.has(item.symbol.toUpperCase());
                  const displayName = item.displayName || item.symbol;
                  const exchangeTag = (item as any).exchangeTag || (isFno ? "NFO" : item.exchange || "NSE");

                  return (
                    <div
                      key={item.symbol}
                      onClick={() => handleSelect(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSelect(item);
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer relative"
                    >
                      {/* Left Side: Watchlist Checkmark + Clean Spaced Symbol + Subtitle */}
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {/* Watchlist subtle checkmark indicator */}
                        {inWatchlist ? (
                          <Check className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 shrink-0" />
                        )}

                        <div className="flex items-baseline gap-2 min-w-0">
                          {/* Main clean spaced symbol (e.g. "TCS SEP FUT", "TCS OCT 2300 CE", "TCS") */}
                          <span className="font-bold text-sm tracking-wide text-slate-800 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors shrink-0">
                            {displayName}
                          </span>

                          {/* Company / Underlying Subtitle */}
                          {!isFno ? (
                            <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[180px] sm:max-w-xs font-normal">
                              {item.name}
                            </span>
                          ) : item.lotSize && item.lotSize > 1 ? (
                            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                              Lot: {item.lotSize}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Right Side: Hover Action Buttons + Live Price & Change + Exchange Tag */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Kite Quick Action Buttons: Blue B, Orange S, Chart, Watchlist (+) */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenFnoOrder(item, "BUY");
                            }}
                            className="w-7 h-7 rounded bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center shadow-xs transition-transform cursor-pointer"
                            title="Buy (B)"
                          >
                            B
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenFnoOrder(item, "SELL");
                            }}
                            className="w-7 h-7 rounded bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center shadow-xs transition-transform cursor-pointer"
                            title="Sell (S)"
                          >
                            S
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenChart(item);
                            }}
                            className="w-7 h-7 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                            title="Open Stock Chart"
                          >
                            <BarChart2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleToggleWatchlist(e, item.symbol)}
                            className={`w-7 h-7 rounded flex items-center justify-center active:scale-95 transition-colors cursor-pointer ${
                              inWatchlist
                                ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400"
                                : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            }`}
                            title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist (+)"}
                          >
                            {inWatchlist ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Price & Change % */}
                        <div className="text-right min-w-[75px]">
                          <div className="text-xs font-bold font-tabular text-slate-900 dark:text-slate-100">
                            {formatPaise(item.basePricePaise ?? 0)}
                          </div>
                          <div
                            className={`text-[11px] font-semibold font-tabular flex items-center justify-end gap-0.5 ${
                              isProfit
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            <span>{formatPercent(item.dayChangePercent ?? 0)}</span>
                          </div>
                        </div>

                        {/* Exchange Tag: [NFO], [NSE], [BSE] */}
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase shrink-0 min-w-[36px] text-center">
                          {exchangeTag}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer info */}
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Hover any item for Kite quick actions: <b>[B]</b> Buy, <b>[S]</b> Sell, <b>[+]</b> Watchlist</span>
              <span className="font-mono text-[10px] bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>NSE & F&O Live</span>
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
