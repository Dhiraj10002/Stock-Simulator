"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Zap } from "lucide-react";
import { publicFetch } from "@/lib/api";
import {
  displayQuote,
  expiryLabel,
  futuresTradeBlock,
  type FuturesMarketStatus,
} from "@/lib/fnoExplore";
import { useAuthToken } from "@/hooks/useAuthToken";
import {
  useMultiSymbolQuotes,
  useTargetedSubscription,
} from "@/stores/market-store";
import { topIndexFutures } from "@/lib/fnoStockOverview";
import type { Instrument, Quote } from "@/types";

const panel =
  "rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 shadow-xs";

const DEFAULT_INDEX_FUTURES = [
  {
    symbol: "NIFTY-OCT-FUT",
    underlying: "NIFTY",
    name: "NIFTY OCT FUT",
    expiry: "27 Oct 2026",
    price: 23378.5,
    change: 12.4,
    changePercent: 0.05,
    lotSize: 65,
  },
  {
    symbol: "BANKNIFTY-OCT-FUT",
    underlying: "BANKNIFTY",
    name: "BANKNIFTY OCT FUT",
    expiry: "27 Oct 2026",
    price: 54794.8,
    change: -211.2,
    changePercent: -0.38,
    lotSize: 30,
  },
  {
    symbol: "NIFTY-NOV-FUT",
    underlying: "NIFTY",
    name: "NIFTY NOV FUT",
    expiry: "23 Nov 2026",
    price: 23480.3,
    change: 38.3,
    changePercent: 0.16,
    lotSize: 65,
  },
  {
    symbol: "MIDCPNIFTY-OCT-FUT",
    underlying: "MIDCPNIFTY",
    name: "MIDCPNIFTY OCT FUT",
    expiry: "27 Oct 2026",
    price: 13616.5,
    change: -181.3,
    changePercent: -1.31,
    lotSize: 120,
  },
];

function formatFutureCardName(inst: Instrument): string {
  const u = (inst.underlying || inst.symbol.replace(/\d.*$/, "")).toUpperCase();
  if (inst.expiry) {
    const parsed = Date.parse(inst.expiry);
    if (!Number.isNaN(parsed)) {
      const month = new Date(parsed)
        .toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          month: "short",
        })
        .toUpperCase();
      return `${u} ${month} FUT`;
    }
  }
  return inst.display_symbol || `${u} FUT`;
}

export default function TopIndexFutures({
  contracts,
  active,
  now,
  status,
  onOrder,
}: {
  contracts: Instrument[];
  active: boolean;
  now: number;
  status?: FuturesMarketStatus;
  onOrder: (instrument: Instrument, side: "BUY" | "SELL") => void;
}) {
  const indices = useMemo(
    () => contracts.filter((i) => i.instrument_type === "FUTIDX"),
    [contracts],
  );
  const symbols = useMemo(() => indices.map((i) => i.symbol), [indices]);
  const token = useAuthToken();
  const stream = useMultiSymbolQuotes(active ? symbols : []);

  const query = useQuery({
    queryKey: ["top-index-futures-quotes", symbols],
    queryFn: async ({ signal }) => {
      const controller = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const result: Record<string, Quote> = {};
      const chunks = Array.from(
        { length: Math.ceil(symbols.length / 100) },
        (_, i) => symbols.slice(i * 100, (i + 1) * 100),
      );
      for (let offset = 0; offset < chunks.length; offset += 3) {
        const batches = await Promise.all(
          chunks
            .slice(offset, offset + 3)
            .map((chunk) =>
              publicFetch<Record<string, Quote>>(
                `/market/quotes/batch?symbols=${encodeURIComponent(chunk.join(","))}`,
                controller,
              ),
            ),
        );
        for (const batch of batches) Object.assign(result, batch);
      }
      return result;
    },
    enabled: active && symbols.length > 0,
    refetchInterval: active ? 20000 : false,
    retry: false,
  });

  const quotes: Record<string, Quote | undefined> = useMemo(() => {
    const map: Record<string, Quote | undefined> = {};
    for (const symbol of symbols) {
      const q = displayQuote(query.data?.[symbol], stream[symbol], query.isError);
      map[symbol] = q;
    }
    return map;
  }, [symbols, query.data, stream, query.isError]);

  const ranked = useMemo(() => topIndexFutures(indices, quotes), [indices, quotes]);
  const topRanked = useMemo(() => ranked.slice(0, 4), [ranked]);

  useTargetedSubscription(active ? topRanked.map((i) => i.symbol) : []);

  const displayedCards = useMemo(() => {
    // If topRanked from live volume has at least 4 unique instruments, use them
    const uniqueTopRanked = topRanked.filter(
      (inst, idx, arr) => arr.findIndex((x) => x.symbol === inst.symbol) === idx,
    );

    if (uniqueTopRanked.length >= 4) {
      return uniqueTopRanked.slice(0, 4).map((inst) => {
        const q = quotes[inst.symbol];
        const price = q && q.price_paise > 0 ? q.price_paise / 100 : 0;
        const change = q?.change_paise !== undefined ? q.change_paise / 100 : 0;
        const changePercent = q?.change_percent ?? 0;
        return {
          instrument: inst,
          name: formatFutureCardName(inst),
          expiry: expiryLabel(inst.expiry),
          lotSize: inst.lot_size,
          price,
          change,
          changePercent,
        };
      });
    }

    // Sort index instruments by expiry date (nearest first)
    const sortedIndices = [...indices].sort((a, b) => {
      const expA = a.expiry ? Date.parse(a.expiry) : Infinity;
      const expB = b.expiry ? Date.parse(b.expiry) : Infinity;
      return expA - expB;
    });

    const usedSymbols = new Set<string>();
    const selectedInsts: Instrument[] = [];

    // Slot 1: NIFTY (1st expiry)
    const n1 = sortedIndices.find(
      (i) => (i.underlying || "").toUpperCase() === "NIFTY" && !usedSymbols.has(i.symbol),
    );
    if (n1) {
      usedSymbols.add(n1.symbol);
      selectedInsts.push(n1);
    }

    // Slot 2: BANKNIFTY (1st expiry)
    const bn1 = sortedIndices.find(
      (i) => (i.underlying || "").toUpperCase() === "BANKNIFTY" && !usedSymbols.has(i.symbol),
    );
    if (bn1) {
      usedSymbols.add(bn1.symbol);
      selectedInsts.push(bn1);
    }

    // Slot 3: NIFTY (2nd expiry) or FINNIFTY
    const n2 =
      sortedIndices.find(
        (i) => (i.underlying || "").toUpperCase() === "NIFTY" && !usedSymbols.has(i.symbol),
      ) ||
      sortedIndices.find(
        (i) => (i.underlying || "").toUpperCase() === "FINNIFTY" && !usedSymbols.has(i.symbol),
      );
    if (n2) {
      usedSymbols.add(n2.symbol);
      selectedInsts.push(n2);
    }

    // Slot 4: MIDCPNIFTY (1st expiry) or any remaining index
    const mid1 =
      sortedIndices.find(
        (i) => (i.underlying || "").toUpperCase() === "MIDCPNIFTY" && !usedSymbols.has(i.symbol),
      ) || sortedIndices.find((i) => !usedSymbols.has(i.symbol));
    if (mid1) {
      usedSymbols.add(mid1.symbol);
      selectedInsts.push(mid1);
    }

    // If 4 distinct contracts were selected from master catalog, map them
    if (selectedInsts.length === 4) {
      return selectedInsts.map((inst, idx) => {
        const fallback = DEFAULT_INDEX_FUTURES[idx];
        const q = quotes[inst.symbol];
        const price = q && q.price_paise > 0 ? q.price_paise / 100 : fallback?.price ?? 0;
        const change = q?.change_paise !== undefined ? q.change_paise / 100 : fallback?.change ?? 0;
        const changePercent = q?.change_percent ?? fallback?.changePercent ?? 0;

        return {
          instrument: inst,
          name: formatFutureCardName(inst),
          expiry: expiryLabel(inst.expiry),
          lotSize: inst.lot_size,
          price,
          change,
          changePercent,
        };
      });
    }

    // Otherwise use default fallback cards with distinct symbols
    return DEFAULT_INDEX_FUTURES.map((fallback) => {
      const inst: Instrument = {
        id: fallback.symbol,
        symbol: fallback.symbol,
        display_symbol: fallback.name,
        name: fallback.name,
        exchange: "NFO",
        token: fallback.symbol,
        instrument_type: "FUTIDX",
        underlying: fallback.underlying,
        expiry: fallback.expiry,
        strike: 0,
        option_type: "",
        lot_size: fallback.lotSize,
        tick_size: 0.05,
        active: true,
        segment: "FUTURES",
        basePricePaise: Math.round(fallback.price * 100),
      };

      return {
        instrument: inst,
        name: fallback.name,
        expiry: fallback.expiry,
        lotSize: fallback.lotSize,
        price: fallback.price,
        change: fallback.change,
        changePercent: fallback.changePercent,
      };
    });
  }, [topRanked, indices, quotes]);

  return (
    <section aria-label="Top traded index futures" className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Top traded index futures
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Benchmark monthly & weekly index futures contracts
          </p>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          Cash Settled • NSE
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {displayedCards.map((card, idx) => {
          const isGain = card.changePercent >= 0;
          const cardKey = `${card.instrument.token || card.instrument.symbol || card.name}-${card.expiry}-${idx}`;
          const block = futuresTradeBlock(
            card.instrument,
            quotes[card.instrument.symbol],
            token,
            status,
            now,
          );
          return (
            <div
              key={cardKey}
              className={`${panel} p-4 hover:border-cyan-500/50 transition-all space-y-3 flex flex-col justify-between group`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-400">
                    INDEX FUT
                  </span>
                  <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors mt-1">
                    {card.name}
                  </h3>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Expiry: {card.expiry} • Lot: {card.lotSize}
                  </div>
                </div>
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="flex items-baseline justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
                <div>
                  <div className="text-sm font-black font-tabular text-slate-900 dark:text-slate-100">
                    ₹{card.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div
                    className={`text-[11px] font-bold font-tabular flex items-center gap-1 ${
                      isGain
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    <span>
                      {isGain ? "+" : ""}
                      {card.change.toFixed(2)}
                    </span>
                    <span>
                      ({isGain ? "+" : ""}
                      {card.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onOrder(card.instrument, "BUY")}
                    title={block || "Paper trade · buy / long"}
                    className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-40"
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => onOrder(card.instrument, "SELL")}
                    title={block || "Paper trade · sell / short"}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-40"
                  >
                    Sell
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
