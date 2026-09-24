"use client";

import { useMemo, useState, useEffect } from "react";
import { formatPaise, getIndianMarketStatus } from "@/lib/format";
import { Lock, MousePointerClick, ArrowUpDown } from "lucide-react";
import type { Quote, MarketDepth as MarketDepthType } from "@/types";

interface MarketDepthProps {
  symbol: string;
  quote: Quote | null;
  depth?: MarketDepthType | null;
  onSelectPrice?: (priceRupees: number) => void;
}

export default function MarketDepth({ symbol, quote, depth, onSelectPrice }: MarketDepthProps) {
  const [marketStatus, setMarketStatus] = useState(() => getIndianMarketStatus());

  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getIndianMarketStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const ltpPaise = quote?.price_paise && quote.price_paise > 0 ? quote.price_paise : 0;
  const hasDepth = Boolean(depth && (depth.bids?.length > 0 || depth.asks?.length > 0));

  const maxQty = useMemo(() => {
    if (!hasDepth || !depth) return 1;
    const allQtys = [...depth.bids.map((b) => b.quantity), ...depth.asks.map((a) => a.quantity)];
    return Math.max(...allQtys, 1);
  }, [hasDepth, depth]);

  const spreadPaise = useMemo(() => {
    if (!hasDepth || !depth || !ltpPaise) return 0;
    const bestAsk = depth.asks[0]?.price_paise ?? ltpPaise;
    const bestBid = depth.bids[0]?.price_paise ?? ltpPaise;
    return Math.max(0, bestAsk - bestBid);
  }, [hasDepth, depth, ltpPaise]);

  const spreadPercent = ltpPaise > 0 ? ((spreadPaise / ltpPaise) * 100).toFixed(2) : "0.00";

  // Buyer vs Seller ratio
  const totalQty = (depth?.total_bid_qty ?? 0) + (depth?.total_ask_qty ?? 0);
  const buyerPercent = totalQty > 0 ? Math.round(((depth?.total_bid_qty ?? 0) / totalQty) * 100) : 50;
  const sellerPercent = 100 - buyerPercent;

  const handlePriceClick = (pricePaise: number) => {
    if (onSelectPrice) {
      onSelectPrice(Number((pricePaise / 100).toFixed(2)));
    }
  };

  if (!hasDepth || !depth) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-slate-900/50 rounded-xl border border-slate-800/80 text-xs space-y-2 select-none">
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
          <ArrowUpDown className="w-4 h-4" />
        </div>
        <span className="font-semibold text-slate-300 text-xs">Market Depth (L2) Unavailable</span>
        <p className="text-[11px] text-slate-500 max-w-xs">
          Real-time Level 2 order book is not provided by the active market feed for {symbol}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-slate-900/50 rounded-xl border border-slate-800/80 p-3 text-xs space-y-3 select-none">
      {/* Header */}
      <div className="flex flex-col gap-1.5 border-b border-slate-800/60 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              Market Depth (L2)
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
              NSE
            </span>
            {onSelectPrice && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[9px] text-cyan-400/80">
                <MousePointerClick className="w-2.5 h-2.5" /> click price to set limit
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-mono font-tabular">
            Spread: <span className="text-slate-200 font-semibold">{formatPaise(spreadPaise)}</span> ({spreadPercent}%)
          </div>
        </div>

        {/* Market Status Badge */}
        {!marketStatus.isOpen ? (
          <div className="flex items-center justify-between px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300">
            <span className="flex items-center gap-1.5 font-semibold">
              <Lock className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Market Closed (Frozen Depth)</span>
            </span>
            <span className="font-mono text-[9px] text-amber-400/70">
              Closing Snapshot
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Order Book</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">5 Levels</span>
          </div>
        )}
      </div>

      {/* Depth Grid (Bids vs Asks) */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono font-tabular">
        {/* Bids Column */}
        <div>
          <div className="grid grid-cols-3 text-[10px] text-slate-500 pb-1 border-b border-slate-800/40 font-sans">
            <span className="text-left">Orders</span>
            <span className="text-center">Qty</span>
            <span className="text-right text-emerald-400 font-semibold">Bid</span>
          </div>
          <div className="space-y-0.5 pt-1">
            {depth.bids.map((b, idx) => {
              const widthPct = (b.quantity / maxQty) * 100;
              return (
                <div
                  key={`bid-${idx}-${b.price_paise}`}
                  onClick={() => handlePriceClick(b.price_paise)}
                  title={`Set Limit to ₹${(b.price_paise / 100).toFixed(2)}`}
                  className="relative grid grid-cols-3 py-0.5 px-1 items-center rounded overflow-hidden cursor-pointer hover:bg-slate-800/90 active:scale-[0.98] transition-all group"
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-emerald-500/15 group-hover:bg-emerald-500/25 pointer-events-none transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="text-left text-slate-500 text-[10px] z-10">{b.orders}</span>
                  <span className="text-center text-slate-300 z-10">{b.quantity.toLocaleString()}</span>
                  <span className="text-right text-emerald-400 font-bold z-10 group-hover:underline">
                    {(b.price_paise / 100).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Asks Column */}
        <div>
          <div className="grid grid-cols-3 text-[10px] text-slate-500 pb-1 border-b border-slate-800/40 font-sans">
            <span className="text-left text-rose-400 font-semibold">Ask</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Orders</span>
          </div>
          <div className="space-y-0.5 pt-1">
            {depth.asks.map((a, idx) => {
              const widthPct = (a.quantity / maxQty) * 100;
              return (
                <div
                  key={`ask-${idx}-${a.price_paise}`}
                  onClick={() => handlePriceClick(a.price_paise)}
                  title={`Set Limit to ₹${(a.price_paise / 100).toFixed(2)}`}
                  className="relative grid grid-cols-3 py-0.5 px-1 items-center rounded overflow-hidden cursor-pointer hover:bg-slate-800/90 active:scale-[0.98] transition-all group"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-rose-500/15 group-hover:bg-rose-500/25 pointer-events-none transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="text-left text-rose-400 font-bold z-10 group-hover:underline">
                    {(a.price_paise / 100).toFixed(2)}
                  </span>
                  <span className="text-center text-slate-300 z-10">{a.quantity.toLocaleString()}</span>
                  <span className="text-right text-slate-500 text-[10px] z-10">{a.orders}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cumulative Buyer vs. Seller Strength Bar */}
      <div className="pt-2 border-t border-slate-800/60 flex flex-col gap-1 text-[10px]">
        <div className="flex justify-between font-mono font-tabular text-slate-400">
          <span className="text-emerald-400 font-semibold">
            Bids: {depth.total_bid_qty.toLocaleString()} ({buyerPercent}%)
          </span>
          <span className="text-rose-400 font-semibold">
            Asks: {depth.total_ask_qty.toLocaleString()} ({sellerPercent}%)
          </span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${buyerPercent}%` }}
          />
          <div
            className="bg-rose-500 transition-all duration-300"
            style={{ width: `${sellerPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
