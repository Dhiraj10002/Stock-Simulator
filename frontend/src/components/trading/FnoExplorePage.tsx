"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { publicFetch, apiFetch, getAuthToken } from "@/lib/api";
import { formatPaise } from "@/lib/format";
import { dayMovement } from "@/lib/marketDisplay";
import { quoteLabel } from "@/lib/marketData";
import { useTargetedSubscription } from "@/stores/market-store";
import FnoOrderModal from "@/components/trading/FnoOrderModal";
import type { Instrument, Portfolio, Quote } from "@/types";

function FutureRow({ instrument, onOrder }: { instrument: Instrument; onOrder: (instrument: Instrument, side: "BUY" | "SELL") => void }) {
  const { data: quote } = useQuery({ queryKey: ["display-quote", instrument.symbol], queryFn: () => publicFetch<Quote>(`/market/quotes/${encodeURIComponent(instrument.symbol)}?purpose=display`), refetchInterval: 10000, retry: false });
  useTargetedSubscription(instrument.symbol);
  const movement = dayMovement(quote);
  const label = quoteLabel(quote);
  const canTrade = label === "LIVE" || label === "SIMULATED";
  return <tr className="border-t border-slate-800"><td className="p-3"><p className="font-bold">{instrument.display_symbol || instrument.symbol}</p><p className="text-xs text-slate-400">{instrument.exchange} · {instrument.expiry} · lot {instrument.lot_size}</p></td><td>{quote && label !== "UNAVAILABLE" ? formatPaise(quote.price_paise) : "Unavailable"}<p className="text-xs text-amber-300">{label}</p></td><td>{movement ? `${movement.percent.toFixed(2)}%` : "Unavailable"}</td><td>{quote?.open_interest_available ? quote.open_interest?.toLocaleString("en-IN") : "Unavailable"}</td><td className="space-x-2"><button disabled={!canTrade} onClick={() => onOrder({ ...instrument, lotSize: instrument.lot_size }, "BUY")} className="rounded bg-emerald-700 p-2 disabled:opacity-40">Buy</button><button disabled={!canTrade} onClick={() => onOrder({ ...instrument, lotSize: instrument.lot_size }, "SELL")} className="rounded bg-rose-700 p-2 disabled:opacity-40">Sell</button></td></tr>;
}
export default function FnoExplorePage({ onSelectOptionChain }: { onSelectOptionChain?: (symbol: string) => void } = {}) {
  const [underlying, setUnderlying] = useState("NIFTY");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const eligible = useQuery({ queryKey: ["derivative-underlyings"], queryFn: () => publicFetch<string[]>("/instruments/derivative-underlyings"), staleTime: 60000 });
  const contracts = useQuery({ queryKey: ["futures", underlying], queryFn: async () => {
    const rows = await publicFetch<Instrument[]>(`/instruments?underlying=${encodeURIComponent(underlying)}&active=true&limit=500`);
    return rows.filter(row => row.instrument_type === "FUTIDX" || row.instrument_type === "FUTSTK");
  }, refetchInterval: 60000 });
  const token = getAuthToken();
  const portfolio = useQuery({ queryKey: ["portfolio", token], queryFn: () => apiFetch<Portfolio>("/portfolio"), enabled: !!token, refetchInterval: 10000 });
  const onOrder = (instrument: Instrument, orderSide: "BUY" | "SELL") => { setSelected(instrument); setSide(orderSide); };
  return <main className="space-y-6 p-6 text-slate-100"><header><h1 className="text-3xl font-bold">Futures & Options</h1><p className="mt-2 text-sm text-slate-400">Contracts from the active instrument master. Prices retain their provider and timestamp; unavailable data is never estimated.</p></header>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-bold">Eligible underlyings</h2><input aria-label="Search eligible underlyings" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search an underlying" className="my-3 w-full rounded bg-slate-800 p-3" />
      {eligible.isError && <p role="alert" className="text-amber-300">Current eligible universe unavailable.</p>}
      <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">{eligible.data?.filter(name => name.includes(search.toUpperCase())).map(name => <button key={name} onClick={() => setUnderlying(name)} className={`rounded px-3 py-2 ${underlying === name ? "bg-cyan-700" : "bg-slate-800"}`}>{name}</button>)}</div>
      {eligible.data?.length === 0 && <p>No current eligible contracts in the master.</p>}
    </section>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="mb-4 flex justify-between"><h2 className="font-bold">{underlying} · Current futures</h2><button onClick={() => onSelectOptionChain?.(underlying)} className="text-cyan-400">Open option chain →</button></div>
      {contracts.isError && <p role="alert" className="text-amber-300">Contract discovery failed. <button onClick={() => contracts.refetch()}>Retry</button></p>}
      {contracts.isLoading ? <p>Loading canonical contracts…</p> : <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Contract</th><th>Price / source state</th><th>Day change</th><th>OI</th><th>Paper order</th></tr></thead><tbody>{contracts.data?.map(inst => <FutureRow key={`${inst.exchange}:${inst.token}`} instrument={inst} onOrder={onOrder} />)}</tbody></table>{contracts.data?.length === 0 && <p>No active futures available for this underlying.</p>}</div>}
    </section>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-bold">Portfolio & margin model</h2>{portfolio.isError ? <p role="alert" className="text-amber-300">Portfolio unavailable. Exposure cannot be confirmed.</p> : token ? <p className="text-sm text-slate-400">Valuation: {portfolio.data?.valuation_status || "Unavailable"} · Open F&O positions: {portfolio.data?.positions.filter(p => p.product === "FNO").length ?? "Unavailable"}</p> : <p>Sign in to view your exposure.</p>}<p className="mt-3 text-xs text-amber-300">Margin estimates use configured simulator percentages, not broker SPAN/exposure. Greeks in the option chain are model calculations with assumed volatility.</p></section>
    <FnoOrderModal isOpen={!!selected} onClose={() => setSelected(null)} instrument={selected} initialSide={side} />
  </main>;
}
