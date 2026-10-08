"use client";

import React, { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  Target,
  Layers,
  AlertCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { OptionChainResponse, StrikeRow, OptionContract, Instrument } from "@/types";
import dynamic from "next/dynamic";

const FnoOrderModal = dynamic(() => import("@/components/trading/FnoOrderModal"), {
  ssr: false,
});

const UNDERLYING_OPTIONS = [
  { symbol: "NIFTY", name: "NIFTY 50", lotSize: 75 },
  { symbol: "BANKNIFTY", name: "BANK NIFTY", lotSize: 30 },
  { symbol: "FINNIFTY", name: "FIN NIFTY", lotSize: 65 },
  { symbol: "SENSEX", name: "BSE SENSEX", lotSize: 20 },
  { symbol: "RELIANCE", name: "Reliance Ind", lotSize: 250 },
  { symbol: "HDFCBANK", name: "HDFC Bank", lotSize: 550 },
  { symbol: "TCS", name: "Tata Consultancy", lotSize: 175 },
  { symbol: "INFY", name: "Infosys", lotSize: 400 },
];

export default function OptionChainDesk() {
  const [selectedUnderlying, setSelectedUnderlying] = useState("NIFTY");
  const [selectedExpiry] = useState<string>("");
  const [mobileTab, setMobileTab] = useState<"CE" | "PE">("CE");

  // Bottom-sheet Order Pad state
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Instrument | null>(null);
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");

  // ATM row scroll anchors
  const atmMobileRef = useRef<HTMLDivElement | null>(null);
  const atmTableRef = useRef<HTMLTableRowElement | null>(null);

  // Touch Swipe coordinates for mobile CE/PE switching
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Fetch Option Chain data
  const {
    data: chainData,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery<OptionChainResponse | null>({
    queryKey: ["option-chain", selectedUnderlying, selectedExpiry],
    queryFn: async () => {
      const q = new URLSearchParams({
        symbol: selectedUnderlying,
        ...(selectedExpiry ? { expiry: selectedExpiry } : {}),
      });
      const res = await apiFetch<OptionChainResponse>(`/fno/option-chain?${q.toString()}`);
      return res || null;
    },
    refetchInterval: 5000, // Live poll every 5s
  });

  const spotPricePaise = chainData?.spot_price_paise ?? 0;
  const strikes: StrikeRow[] = useMemo(() => chainData?.strikes ?? [], [chainData?.strikes]);

  // Find ATM strike
  const atmStrike = useMemo(() => {
    if (!strikes.length || !spotPricePaise) return null;
    return strikes.find((s) => s.is_atm) || strikes[Math.floor(strikes.length / 2)];
  }, [strikes, spotPricePaise]);

  // Scroll to ATM strike
  const scrollToAtm = () => {
    if (atmMobileRef.current && typeof window !== "undefined" && window.innerWidth < 768) {
      atmMobileRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (atmTableRef.current) {
      atmTableRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Touch handlers for mobile swipe between Calls (CE) and Puts (PE)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Only handle horizontal swipes (ignore vertical scrolling)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && mobileTab === "CE") {
        // Swiped left -> Switch to Puts (PE)
        setMobileTab("PE");
      } else if (deltaX > 0 && mobileTab === "PE") {
        // Swiped right -> Switch to Calls (CE)
        setMobileTab("CE");
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Open Bottom-Sheet Order Pad for a contract
  const handleOpenOrder = (
    contract: OptionContract,
    strikePricePaise: number,
    side: "BUY" | "SELL"
  ) => {
    const inst: Instrument = {
      id: contract.symbol,
      token: "0",
      symbol: contract.symbol,
      name: `${selectedUnderlying} ${strikePricePaise / 100} ${contract.option_type}`,
      exchange: "NFO",
      instrument_type: "OPTIDX",
      underlying: selectedUnderlying,
      lot_size: contract.lot_size || chainData?.lot_size || 50,
      tick_size: 0.05,
      strike: strikePricePaise / 100,
      strikePrice: strikePricePaise / 100,
      option_type: contract.option_type,
      active: true,
      is_tradable: true,
      segment: "OPTIONS",
      expiry: chainData?.expiry_date || "",
      display_symbol: contract.symbol,
    };
    setSelectedContract(inst);
    setOrderSide(side);
    setOrderModalOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. Underlying Switcher & Quick Navigation Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                L2 Option Chain Desk
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  REAL-TIME NFO
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Institutional depth, implied volatility (IV), Greeks & 1-tap mobile bottom-sheet order pad.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void refetch()}
              disabled={isRefetching}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Refresh Option Chain"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Underlying Selector Chips (Horizontal Scroll on Mobile) */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 pt-1 -mx-1 px-1">
          {UNDERLYING_OPTIONS.map((u) => {
            const isSelected = selectedUnderlying === u.symbol;
            return (
              <button
                key={u.symbol}
                onClick={() => setSelectedUnderlying(u.symbol)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? "bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-sm shadow-cyan-600/30 scale-102"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {u.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Market Sentiment & Spot Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Spot Price */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            {selectedUnderlying} Spot Price
          </span>
          <div className="text-xl font-black font-tabular text-slate-900 dark:text-slate-100 mt-0.5">
            {spotPricePaise > 0 ? `₹${(spotPricePaise / 100).toFixed(2)}` : "Loading..."}
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-mono mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Underlying Live Index</span>
          </div>
        </div>

        {/* ATM Strike */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            ATM Strike
          </span>
          <div className="text-xl font-black font-tabular text-cyan-600 dark:text-cyan-400 mt-0.5">
            {atmStrike ? `₹${(atmStrike.strike_price_paise / 100).toLocaleString("en-IN")}` : "—"}
          </div>
          <button
            onClick={scrollToAtm}
            className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline font-bold font-mono mt-0.5 flex items-center gap-0.5 cursor-pointer"
          >
            <span>Jump to Strike ↓</span>
          </button>
        </div>

        {/* Put-Call Ratio (PCR) */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Put-Call Ratio (PCR)
          </span>
          <div className="text-xl font-black font-tabular text-slate-900 dark:text-slate-100 mt-0.5">
            {chainData?.put_call_ratio ? chainData.put_call_ratio.toFixed(2) : "1.00"}
          </div>
          <div className="text-[10px] font-bold mt-0.5">
            {(chainData?.put_call_ratio ?? 1) >= 1 ? (
              <span className="text-emerald-600 dark:text-emerald-400">Bullish Bias (Calls Supported)</span>
            ) : (
              <span className="text-rose-600 dark:text-rose-400">Bearish / Put Dominant</span>
            )}
          </div>
        </div>

        {/* Lot Size & Expiry */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Lot Size & Expiry
          </span>
          <div className="text-xl font-black font-tabular text-slate-900 dark:text-slate-100 mt-0.5">
            {chainData?.lot_size ?? 50} Qty / Lot
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
            {chainData?.expiry_date ? `Exp: ${chainData.expiry_date}` : "Current Near-Week"}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>Option chain data could not be retrieved from exchange server. Retrying...</span>
        </div>
      )}

      {isLoading && strikes.length === 0 && (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-cyan-600 dark:text-cyan-400" />
          <span>Loading live L2 option chain strikes for {selectedUnderlying}...</span>
        </div>
      )}

      {/* 3. MOBILE VIEW: Touch Tab Toggle & Gesture Hint (< md screens) */}
      <div className="block md:hidden space-y-3">
        {/* CE vs PE Segmented Touch Selector */}
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-2xl bg-slate-200/80 dark:bg-slate-800/80">
          <button
            onClick={() => setMobileTab("CE")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mobileTab === "CE"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <span>CALLS (CE)</span>
            <span className="text-[10px] opacity-75 font-mono">BULLISH</span>
          </button>
          <button
            onClick={() => setMobileTab("PE")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mobileTab === "PE"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <span>PUTS (PE)</span>
            <span className="text-[10px] opacity-75 font-mono">BEARISH</span>
          </button>
        </div>

        {/* Touch Swipe Hint & Floating ATM Jump Button */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
          <span className="flex items-center gap-1">
            <span className="text-cyan-500 font-bold">👈 Swipe 👉</span>
            <span>to switch Calls/Puts</span>
          </span>
          {atmStrike && (
            <button
              onClick={scrollToAtm}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/20"
            >
              <Target className="w-3 h-3" />
              <span>ATM: ₹{(atmStrike.strike_price_paise / 100).toLocaleString("en-IN")}</span>
            </button>
          )}
        </div>

        {/* Mobile Swipe Container with Touch Event Handlers */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="space-y-2.5"
        >
          {strikes.map((s) => {
            const strikeRupees = s.strike_price_paise / 100;
            const spotRupees = spotPricePaise / 100;
            const isAtm = s.is_atm;

            // Moneyness
            const isCallItm = strikeRupees < spotRupees;
            const isPutItm = strikeRupees > spotRupees;
            const isItm = mobileTab === "CE" ? isCallItm : isPutItm;

            const contract = mobileTab === "CE" ? s.call : s.put;
            const ltpRupees = (contract?.ltp_paise ?? 0) / 100;

            return (
              <div
                key={s.strike_price_paise}
                ref={isAtm ? atmMobileRef : undefined}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isAtm
                    ? "bg-cyan-500/10 border-cyan-500/50 ring-2 ring-cyan-500/30"
                    : isItm
                    ? "bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border-amber-500/20"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black font-tabular text-slate-900 dark:text-slate-100">
                        ₹{strikeRupees.toLocaleString("en-IN")}
                      </span>
                      {isAtm ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cyan-500 text-slate-950">
                          ATM
                        </span>
                      ) : isItm ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono">
                          ITM
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                          OTM
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      {contract?.symbol}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-black font-tabular text-slate-900 dark:text-slate-100">
                      ₹{ltpRupees.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      IV: {contract?.iv ? `${contract.iv.toFixed(1)}%` : "—"} • OI:{" "}
                      {contract?.open_interest ? contract.open_interest.toLocaleString("en-IN") : "—"}
                    </div>
                  </div>
                </div>

                {/* 1-Tap Buy / Sell Bottom-Sheet Action Buttons */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => handleOpenOrder(contract, s.strike_price_paise, "BUY")}
                    className="py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-black text-xs shadow-xs transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>BUY</span>
                    <span className="font-mono text-[10px] opacity-80">₹{ltpRupees.toFixed(2)}</span>
                  </button>
                  <button
                    onClick={() => handleOpenOrder(contract, s.strike_price_paise, "SELL")}
                    className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs shadow-xs transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>SELL</span>
                    <span className="font-mono text-[10px] opacity-80">₹{ltpRupees.toFixed(2)}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. DESKTOP VIEW: High-Density Institutional L2 Matrix (>= md screens) */}
      <div className="hidden md:block rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse font-tabular">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th colSpan={5} className="py-2.5 px-4 text-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                  CALLS (CE)
                </th>
                <th className="py-2.5 px-4 text-center bg-slate-200/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100">
                  STRIKE
                </th>
                <th colSpan={5} className="py-2.5 px-4 text-center text-rose-600 dark:text-rose-400 bg-rose-500/5">
                  PUTS (PE)
                </th>
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
                {/* Calls Headers */}
                <th className="py-2 px-3 text-right">OI</th>
                <th className="py-2 px-3 text-right">IV %</th>
                <th className="py-2 px-3 text-right">LTP (₹)</th>
                <th className="py-2 px-3 text-center">Trade</th>
                <th className="py-2 px-2 text-center">Type</th>

                {/* Strike Header */}
                <th className="py-2 px-4 text-center bg-slate-100 dark:bg-slate-800/50">STRIKE</th>

                {/* Puts Headers */}
                <th className="py-2 px-2 text-center">Type</th>
                <th className="py-2 px-3 text-center">Trade</th>
                <th className="py-2 px-3 text-left">LTP (₹)</th>
                <th className="py-2 px-3 text-left">IV %</th>
                <th className="py-2 px-3 text-left">OI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {strikes.map((s) => {
                const strikeRupees = s.strike_price_paise / 100;
                const spotRupees = spotPricePaise / 100;
                const isAtm = s.is_atm;

                const isCallItm = strikeRupees < spotRupees;
                const isPutItm = strikeRupees > spotRupees;

                const callLtp = (s.call?.ltp_paise ?? 0) / 100;
                const putLtp = (s.put?.ltp_paise ?? 0) / 100;

                return (
                  <tr
                    key={s.strike_price_paise}
                    ref={isAtm ? atmTableRef : undefined}
                    className={`transition-colors ${
                      isAtm
                        ? "bg-cyan-500/10 font-bold"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    {/* Calls Wing */}
                    <td className={`py-2 px-3 text-right text-slate-500 font-mono ${isCallItm ? "bg-amber-500/[0.03]" : ""}`}>
                      {s.call?.open_interest?.toLocaleString("en-IN") || "—"}
                    </td>
                    <td className={`py-2 px-3 text-right text-slate-500 font-mono ${isCallItm ? "bg-amber-500/[0.03]" : ""}`}>
                      {s.call?.iv ? `${s.call.iv.toFixed(1)}%` : "—"}
                    </td>
                    <td className={`py-2 px-3 text-right font-black ${isCallItm ? "bg-amber-500/[0.03] text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200"}`}>
                      ₹{callLtp.toFixed(2)}
                    </td>
                    <td className={`py-2 px-3 text-center ${isCallItm ? "bg-amber-500/[0.03]" : ""}`}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenOrder(s.call, s.strike_price_paise, "BUY")}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
                        >
                          B
                        </button>
                        <button
                          onClick={() => handleOpenOrder(s.call, s.strike_price_paise, "SELL")}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                        >
                          S
                        </button>
                      </div>
                    </td>
                    <td className={`py-2 px-2 text-center text-[10px] font-mono ${isCallItm ? "bg-amber-500/[0.03] text-amber-600 font-bold" : "text-slate-400"}`}>
                      {isCallItm ? "ITM" : "OTM"}
                    </td>

                    {/* Center Column: Strike */}
                    <td
                      className={`py-2 px-4 text-center font-black ${
                        isAtm
                          ? "bg-cyan-500 text-slate-950 text-sm shadow-xs"
                          : "bg-slate-100/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      ₹{strikeRupees.toLocaleString("en-IN")}
                    </td>

                    {/* Puts Wing */}
                    <td className={`py-2 px-2 text-center text-[10px] font-mono ${isPutItm ? "bg-amber-500/[0.03] text-amber-600 font-bold" : "text-slate-400"}`}>
                      {isPutItm ? "ITM" : "OTM"}
                    </td>
                    <td className={`py-2 px-3 text-center ${isPutItm ? "bg-amber-500/[0.03]" : ""}`}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenOrder(s.put, s.strike_price_paise, "BUY")}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
                        >
                          B
                        </button>
                        <button
                          onClick={() => handleOpenOrder(s.put, s.strike_price_paise, "SELL")}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                        >
                          S
                        </button>
                      </div>
                    </td>
                    <td className={`py-2 px-3 text-left font-black ${isPutItm ? "bg-amber-500/[0.03] text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-200"}`}>
                      ₹{putLtp.toFixed(2)}
                    </td>
                    <td className={`py-2 px-3 text-left text-slate-500 font-mono ${isPutItm ? "bg-amber-500/[0.03]" : ""}`}>
                      {s.put?.iv ? `${s.put.iv.toFixed(1)}%` : "—"}
                    </td>
                    <td className={`py-2 px-3 text-left text-slate-500 font-mono ${isPutItm ? "bg-amber-500/[0.03]" : ""}`}>
                      {s.put?.open_interest?.toLocaleString("en-IN") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Mobile Bottom-Sheet Order Pad Modal */}
      {orderModalOpen && (
        <FnoOrderModal
          isOpen={orderModalOpen}
          onClose={() => setOrderModalOpen(false)}
          instrument={selectedContract}
          initialSide={orderSide}
          onSuccess={() => {
            setOrderModalOpen(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
