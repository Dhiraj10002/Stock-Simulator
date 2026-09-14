"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";

type Candle = { timestamp: number; open_paise: number; high_paise: number; low_paise: number; close_paise: number; volume: number };
type Quote = { symbol: string; price_paise: number; updated_at: string };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws/market";
const rupees = (paise: number) => paise / 100;

export default function MarketChart() {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candlesSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [limit, setLimit] = useState(100);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState("Loading history…");

  useEffect(() => {
    if (!container.current) return;
    const instance = createChart(container.current, { autoSize: true, layout: { background: { type: ColorType.Solid, color: "#101827" }, textColor: "#9ca3af" }, grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } }, timeScale: { timeVisible: true } });
    chart.current = instance;
    candlesSeries.current = instance.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
    volumeSeries.current = instance.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", color: "#334155" });
    instance.priceScale("").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    return () => { instance.remove(); chart.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/market/quotes/${symbol}/history?limit=${limit}`).then((response) => response.json()).then((body) => { if (!cancelled) { setCandles(body.data ?? []); setStatus((body.data ?? []).length ? "History loaded" : "No history available yet"); } }).catch(() => { if (!cancelled) setStatus("Unable to load history"); });
    return () => { cancelled = true; };
  }, [symbol, limit]);

  useEffect(() => {
    if (!candlesSeries.current || !volumeSeries.current || !candles.length) return;
    candlesSeries.current.setData(candles.map((c) => ({ time: c.timestamp as Time, open: rupees(c.open_paise), high: rupees(c.high_paise), low: rupees(c.low_paise), close: rupees(c.close_paise) })));
    volumeSeries.current.setData(candles.map((c) => ({ time: c.timestamp as Time, value: c.volume, color: c.close_paise >= c.open_paise ? "#166534" : "#7f1d1d" })));
    chart.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socket.onopen = () => { setStatus("Live"); socket.send(JSON.stringify({ action: "subscribe", symbols: [symbol] })); };
    socket.onmessage = (message) => { const event = JSON.parse(message.data); if (event.type !== "quote" || event.quote?.symbol !== symbol) return; const next: Quote = event.quote; setQuote(next); setCandles((items) => { const price = next.price_paise; const timestamp = Math.floor(new Date(next.updated_at).getTime() / 60000) * 60; if (!items.length) return [{ timestamp, open_paise: price, high_paise: price, low_paise: price, close_paise: price, volume: 0 }]; const last = items[items.length - 1]; if (last.timestamp !== timestamp) return [...items, { timestamp, open_paise: last.close_paise, high_paise: price, low_paise: price, close_paise: price, volume: 0 }]; return [...items.slice(0, -1), { ...last, close_paise: price, high_paise: Math.max(last.high_paise, price), low_paise: Math.min(last.low_paise, price) }]; }); };
    socket.onerror = () => setStatus("Live connection unavailable");
    return () => socket.close();
  }, [symbol]);

  return <section className="chart-card"><div className="chart-toolbar"><label>Symbol <select value={symbol} onChange={(e) => setSymbol(e.target.value)}><option>RELIANCE</option><option>TCS</option><option>INFY</option><option>HDFCBANK</option></select></label><label>Candles <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}><option value={50}>50</option><option value={100}>100</option><option value={250}>250</option></select></label><span className="chart-status">{status}</span>{quote && <strong>₹{rupees(quote.price_paise).toFixed(2)}</strong>}</div><div className="chart" ref={container} /></section>;
}
