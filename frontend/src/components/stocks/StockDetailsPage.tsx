"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import TradingViewChart from "@/components/trading/TradingViewChart";
import { useSymbolQuote, useTargetedSubscription } from "@/stores/market-store";
import { publicFetch, apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { formatPaise } from "@/lib/format";
import { dayMovement } from "@/lib/marketDisplay";
import { aggregateCandles, historyRequest, quoteLabel } from "@/lib/marketData";
import { useOrderPreview } from "@/hooks/useOrderPreview";
import type { Article, Candle, Instrument, Quote } from "@/types";

export default function StockDetailsPage({ initialSymbol = "ITC" }: { initialSymbol?: string }) {
  const search = useSearchParams();
  const symbol = (search.get("symbol") || initialSymbol).toUpperCase();
  const client = useQueryClient();
  const token = useAuthToken();
  const [timeframe, setTimeframe] = useState("1m");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<"DELIVERY" | "INTRADAY">("DELIVERY");
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [quantity, setQuantity] = useState(1);
  const [limit, setLimit] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  useTargetedSubscription(symbol);
  const wsQuote = useSymbolQuote(symbol);
  const quoteQuery = useQuery({ queryKey: ["display-quote", symbol], queryFn: () => publicFetch<Quote>(`/market/quotes/${encodeURIComponent(symbol)}?purpose=display`), refetchInterval: 10000, retry: false });
  const instrument = useQuery({ queryKey: ["instrument", symbol], queryFn: () => publicFetch<Instrument>(`/instruments/${encodeURIComponent(symbol)}`) });
  const quote = wsQuote && quoteLabel(wsQuote) !== "UNAVAILABLE" && (!quoteQuery.data || Date.parse(wsQuote.updated_at) >= Date.parse(quoteQuery.data.updated_at)) ? wsQuote : quoteQuery.data;
  const label = quoteLabel(quote);
  const movement = dayMovement(quote);
  const request = historyRequest(timeframe);
  const history = useQuery({ queryKey: ["stock-history", symbol, request.interval], queryFn: () => publicFetch<Candle[]>(`/market/quotes/${encodeURIComponent(symbol)}/history?interval=${request.interval}&limit=${request.limit}`), refetchInterval: 30000, retry: false });
  const news = useQuery({ queryKey: ["stock-news", symbol], queryFn: () => publicFetch<Article[]>(`/news?symbol=${encodeURIComponent(symbol)}&limit=5`), refetchInterval: 60000 });
  const order = { symbol, side, type, product, quantity, price_paise: type === "LIMIT" ? Math.round(Number(limit) * 100) : 0 };
  const preview = useOrderPreview(order, quantity > 0 && (type === "MARKET" || Number(limit) > 0));
  const canOrder = !!preview.data?.sufficient_funds && !submitting && instrument.data?.active === true;
  const placeOrder = async () => {
    if (!canOrder || !confirmation) return;
    setSubmitting(true);
    try {
      await apiFetch("/orders", { method: "POST", body: JSON.stringify(order) });
      setFeedback("Paper order submitted. Check its status in Orders.");
      setConfirmation(false);
      await Promise.all([client.invalidateQueries({ queryKey: ["portfolio"] }), client.invalidateQueries({ queryKey: ["wallet"] }), client.invalidateQueries({ queryKey: ["orders"] }), preview.refetch()]);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Order failed"); }
    finally { setSubmitting(false); }
  };
  const metric = (value?: number) => value !== undefined && value > 0 ? formatPaise(value) : "Unavailable";
  const depth = quote?.depth;
  return <div className="min-h-screen bg-slate-950 text-slate-100"><Navbar /><main className="mx-auto max-w-7xl space-y-6 p-6">
    <Link href="/dashboard" className="text-cyan-400">← Market dashboard</Link>
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div><h1 className="text-3xl font-bold">{instrument.data?.name || symbol}</h1><p className="text-slate-400">{symbol} · {instrument.data?.exchange || "Exchange unavailable"}</p></div>
      <div className="text-right"><p className="text-3xl font-mono">{label !== "UNAVAILABLE" ? metric(quote?.price_paise) : "Unavailable"}</p><p className="text-sm text-slate-400">{movement ? `${movement.change >= 0 ? "+" : ""}${movement.change.toFixed(2)} (${movement.percent.toFixed(2)}%)` : "Day movement unavailable"}</p><p className="mt-2 text-xs text-amber-300">{label}{quote ? ` · ${new Date(quote.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` : ""}</p></div>
    </header>
    {quoteQuery.isError && <p className="text-amber-300">Quote refresh failed. Available historical data is shown with its timestamp.</p>}
    <div className="grid gap-6 lg:grid-cols-3"><section className="space-y-6 lg:col-span-2">
      {history.isError && <p role="alert" className="text-amber-300">Chart archive request failed. <button onClick={() => history.refetch()} className="underline">Retry</button></p>}
      <TradingViewChart symbol={symbol} historicalCandles={aggregateCandles(history.data || [], timeframe)} liveQuote={quote || null} isLoading={history.isLoading} height={400} defaultTimeframe={timeframe} onTimeframeChange={setTimeframe} onRefresh={() => history.refetch()} />
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:grid-cols-3">{[["Open", quote?.open_paise], ["High", quote?.high_paise], ["Low", quote?.low_paise], ["Previous close", quote?.previous_close_paise], ["Lower circuit", quote?.lower_circuit_paise], ["Upper circuit", quote?.upper_circuit_paise]].map(([name, value]) => <div key={String(name)}><p className="text-xs text-slate-400">{name}</p><p className="font-mono">{metric(value as number | undefined)}</p></div>)}</div>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="font-bold">Provider market depth</h2><p className="mb-4 text-xs text-slate-400">{depth ? `${label} · ${quote?.source}` : "Five-level depth unavailable. No estimated order book is shown."}</p>{depth && <table className="w-full text-sm"><thead><tr><th>Bid quantity</th><th>Bid</th><th>Ask</th><th>Ask quantity</th></tr></thead><tbody>{depth.bids.map((bid, i) => <tr key={i} className="border-t border-slate-800"><td>{bid.quantity}</td><td className="text-emerald-400">{formatPaise(bid.price_paise)}</td><td className="text-rose-400">{formatPaise(depth.asks[i]?.price_paise)}</td><td>{depth.asks[i]?.quantity}</td></tr>)}</tbody></table>}</section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="font-bold">Fundamentals & 52-week range</h2><p className="mt-2 text-sm text-slate-400">A verified fundamentals source is not connected. These values are unavailable.</p></section>
    </section><aside className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="font-bold">Paper trading order</h2><p className="text-xs text-slate-400">Delivery and intraday simulation. Intraday margin is a simulator estimate.</p>
        <label className="block">Side<select value={side} onChange={e => { setSide(e.target.value as typeof side); setConfirmation(false); }} className="ml-3 bg-slate-800"><option>BUY</option><option>SELL</option></select></label>
        <label className="block">Product<select value={product} onChange={e => { setProduct(e.target.value as typeof product); setConfirmation(false); }} className="ml-3 bg-slate-800"><option value="DELIVERY">Delivery</option><option value="INTRADAY">Intraday</option></select></label>
        <label className="block">Order type<select value={type} onChange={e => { setType(e.target.value as typeof type); setConfirmation(false); }} className="ml-3 bg-slate-800"><option>MARKET</option><option>LIMIT</option></select></label>
        <label className="block">Quantity<input aria-label="Quantity" type="number" min="1" step="1" value={quantity} onChange={e => { setQuantity(Number(e.target.value)); setConfirmation(false); }} className="mt-1 w-full rounded bg-slate-800 p-2" /></label>
        {type === "LIMIT" && <label className="block">Limit price ₹<input type="number" min="0.01" step="0.01" value={limit} onChange={e => { setLimit(e.target.value); setConfirmation(false); }} className="mt-1 w-full rounded bg-slate-800 p-2" /></label>}
        {!token && <p className="text-amber-300">Sign in to preview and place a paper order.</p>}
        {preview.isError && <p role="alert" className="text-amber-300">{preview.error.message}</p>}
        {preview.data && <p className="text-sm text-slate-400">Required funds: {formatPaise(preview.data.required_funds_paise)} · Available: {formatPaise(preview.data.available_balance_paise)}</p>}
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={confirmation} onChange={e => setConfirmation(e.target.checked)} />Confirm {side} {quantity} {symbol} as a {product} paper order.</label>
        <button disabled={!canOrder || !confirmation} onClick={placeOrder} className="w-full rounded-lg bg-cyan-600 p-3 font-bold disabled:opacity-40">{submitting ? "Submitting…" : "Place paper order"}</button>
        {feedback && <p role="status" className="text-sm text-amber-300">{feedback}</p>}
      </section>
      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="font-bold">News</h2>{news.isError ? <p>News unavailable.</p> : news.data?.length ? news.data.map(article => <a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-cyan-300">{article.title}<span className="block text-xs text-slate-400">{article.source} · {new Date(article.published_at).toLocaleDateString("en-IN")}</span></a>) : <p className="text-sm text-slate-400">No sourced news available.</p>}</section>
    </aside></div>
  </main></div>;
}
