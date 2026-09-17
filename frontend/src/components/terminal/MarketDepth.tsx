"use client";

import { useMemo, useState, useEffect } from "react";
import { formatPaise, getIndianMarketStatus } from "@/lib/format";
import { generateMarketDepth, getDynamicMetadata } from "@/lib/mockData";
import { Lock } from "lucide-react";
import type { Quote } from "@/types";

interface MarketDepthProps {
  symbol: string;
  quote: Quote | null;
}

export default function MarketDepth({ symbol, quote }: MarketDepthProps) {
  const [marketStatus, setMarketStatus] = useState(() => getIndianMarketStatus());

  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getIndianMarketStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const meta = getDynamicMetadata(symbol);

  const ltpPaise = quote?.price_paise && quote.price_paise > 0 ? quote.price_paise : meta.basePricePaise;
  const depth = useMemo(() => generateMarketDepth(ltpPaise), [ltpPaise]);

  const maxQty = useMemo(() => {
    const allQtys = [...depth.bids.map((b) => b.quantity), ...depth.asks.map((a) => a.quantity)];
    return Math.max(...allQtys, 1);
  }, [depth]);

  const spreadPaise = Math.max(5, (depth.asks[0]?.price_paise ?? ltpPaise) - (depth.bids[0]?.price_paise ?? ltpPaise));
  const spreadPercent = ((spreadPaise / ltpPaise) * 100).toFixed(3);

  // 52-week position calculation (0 to 100%)
  const low52W = meta.low52WPaise;
  const high52W = meta.high52WPaise;
  const range52W = Math.max(1, high52W - low52W);
  const position52W = Math.min(100, Math.max(0, ((ltpPaise - low52W) / range52W) * 100));

  // Buyer vs Seller ratio
  const totalQty = depth.total_bid_qty + depth.total_ask_qty;
  const buyerPercent = totalQty > 0 ? Math.round((depth.total_bid_qty / totalQty) * 100) : 50;
  const sellerPercent = 100 - buyerPercent;

  return (
    <div className="flex flex-col bg-slate-900/50 rounded-xl border border-slate-800/80 p-3 text-xs space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-1.5 border-b border-slate-800/60 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              Market Depth (L2)
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              NSE
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            Spread: <span className="text-slate-200">{formatPaise(spreadPaise)}</span> ({spreadPercent}%)
          </div>
        </div>

        {/* Clear Market Closed (Frozen Depth) Badge */}
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
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live Order Book</span>
          </div>
        )}
      </div>

      {/* Depth Grid (Bids vs Asks) */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
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
                <div key={`bid-${idx}-${b.price_paise}`} className="relative grid grid-cols-3 py-0.5 px-1 items-center rounded overflow-hidden">
                  <div
                    className="absolute inset-y-0 right-0 bg-emerald-500/10 pointer-events-none transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="text-left text-slate-500 text-[10px] z-10">{b.orders}</span>
                  <span className="text-center text-slate-300 z-10">{b.quantity.toLocaleString()}</span>
                  <span className="text-right text-emerald-400 font-semibold z-10">
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
                <div key={`ask-${idx}-${a.price_paise}`} className="relative grid grid-cols-3 py-0.5 px-1 items-center rounded overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-rose-500/10 pointer-events-none transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="text-left text-rose-400 font-semibold z-10">
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

      {/* Buyer / Seller Pressure Bar */}
      <div className="pt-1">
        <div className="flex justify-between text-[10px] font-mono mb-1">
          <span className="text-emerald-400">{buyerPercent}% Buyers ({depth.total_bid_qty.toLocaleString()})</span>
          <span className="text-rose-400">{sellerPercent}% Sellers ({depth.total_ask_qty.toLocaleString()})</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full flex overflow-hidden">
          <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${buyerPercent}%` }} />
          <div className="bg-rose-500 transition-all duration-300" style={{ width: `${sellerPercent}%` }} />
        </div>
      </div>

      {/* 52-Week Range Bar */}
      <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>52W Low: <strong className="text-slate-300">{formatPaise(low52W)}</strong></span>
          <span className="font-semibold text-slate-300">52-Week Range</span>
          <span>52W High: <strong className="text-slate-300">{formatPaise(high52W)}</strong></span>
        </div>
        <div className="relative w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="absolute top-0 bottom-0 bg-gradient-to-r from-emerald-500 via-cyan-400 to-indigo-500 rounded-full"
            style={{ width: `${position52W}%` }}
          />
        </div>
      </div>
    </div>
  );
}
