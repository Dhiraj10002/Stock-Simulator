"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Zap } from "lucide-react";
import { publicFetch } from "@/lib/api";
import {
  displayQuote,
  expiryLabel,
  futuresTradeBlock,
  futuresUnderlying,
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
    symbol: "NIFTY24SEPFUT",
    underlying: "NIFTY",
    name: "NIFTY 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 23378.5,
    change: 12.4,
    changePercent: 0.05,
    lotSize: 50,
  },
  {
    symbol: "BANKNIFTY24SEPFUT",
    underlying: "BANKNIFTY",
    name: "BANKNIFTY 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 56527.0,
    change: 217.0,
    changePercent: 0.39,
    lotSize: 15,
  },
  {
    symbol: "NIFTY24OCTFUT",
    underlying: "NIFTY",
    name: "NIFTY 27 Oct Fut",
    expiry: "27 Oct 2026",
    price: 23480.3,
    change: 38.3,
    changePercent: 0.16,
    lotSize: 50,
  },
  {
    symbol: "MIDCPNIFTY24SEPFUT",
    underlying: "MIDCPNIFTY",
    name: "MIDCPNIFTY 29 Sep Fut",
    expiry: "29 Sep 2026",
    price: 14524.4,
    change: 85.6,
    changePercent: 0.59,
    lotSize: 50,
  },
];

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
    if (topRanked.length >= 4) {
      return topRanked.map((inst) => {
        const q = quotes[inst.symbol];
        const u = futuresUnderlying(inst);
        const price = q ? q.price_paise / 100 : 0;
        const change = q?.change_paise !== undefined ? q.change_paise / 100 : 0;
        const changePercent = q?.change_percent ?? 0;
        return {
          instrument: inst,
          name: inst.display_symbol || `${u} ${expiryLabel(inst.expiry)} Fut`,
          expiry: expiryLabel(inst.expiry),
          lotSize: inst.lot_size,
          price,
          change,
          changePercent,
        };
      });
    }

    return DEFAULT_INDEX_FUTURES.map((fallback) => {
      const matched = indices.find(
        (i) => i.symbol.toUpperCase() === fallback.symbol.toUpperCase() ||
               (i.underlying && i.underlying.toUpperCase() === fallback.underlying.toUpperCase()),
      );
      const q = matched ? quotes[matched.symbol] : undefined;
      const price = q && q.price_paise > 0 ? q.price_paise / 100 : fallback.price;
      const change = q?.change_paise !== undefined ? q.change_paise / 100 : fallback.change;
      const changePercent = q?.change_percent !== undefined ? q.change_percent : fallback.changePercent;
      const lot = matched?.lot_size || fallback.lotSize;

      const inst: Instrument = matched || {
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
        lot_size: lot,
        tick_size: 0.05,
        active: true,
        segment: "FUTURES",
        basePricePaise: Math.round(price * 100),
      };

      return {
        instrument: inst,
        name: fallback.name,
        expiry: fallback.expiry,
        lotSize: lot,
        price,
        change,
        changePercent,
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
        {displayedCards.map((card) => {
          const isGain = card.changePercent >= 0;
          const block = futuresTradeBlock(
            card.instrument,
            quotes[card.instrument.symbol],
            token,
            status,
            now,
          );
          return (
            <div
              key={card.instrument.symbol}
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
