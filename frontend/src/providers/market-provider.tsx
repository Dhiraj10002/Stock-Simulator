"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMarketStore } from "@/stores/market-store";
import { useTradingStore } from "@/stores/trading-store";
import { useAuthToken } from "@/hooks/useAuthToken";
import { getApiUrl, getWsUrl } from "@/lib/config";
import { apiFetch } from "@/lib/api";
import { fetchInstruments } from "@/lib/instruments";
import { subscriptionTargets } from "@/lib/marketSubscriptions";
import type { Quote } from "@/types";

// Mounted only by the trading layout. Route changes within the app keep one socket.
export function MarketProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthToken();
  const watchlistSymbols = useMarketStore(s => s.watchlistSymbols);
  const activeViewSymbols = useMarketStore(s => s.activeViewSymbols);
  const selectedSymbol = useTradingStore(s => s.selectedSymbol);
  const setWatchlistSymbols = useMarketStore(s => s.setWatchlistSymbols);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribed = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    void fetchInstruments().then(list => { if (mounted) useMarketStore.getState().setInstruments(list); });
    return () => { mounted = false; };
  }, []);

  const watchlist = useQuery<{ symbol: string }[]>({
    queryKey: ["watchlist", token],
    queryFn: ({ signal }) => apiFetch("/watchlist", { signal }),
    enabled: !!token,
    staleTime: 10_000,
    retry: false,
  });
  useEffect(() => {
    setWatchlistSymbols(token ? (watchlist.data || []).map(item => item.symbol) : []);
  }, [token, watchlist.data, setWatchlistSymbols]);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch(`${getApiUrl()}/market/status`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!res.ok) throw new Error("Market status unavailable");
        const body = await res.json();
        if (controller.signal.aborted) return;
        if (body.success && body.data) {
          const data = body.data, store = useMarketStore.getState();
          if (data.status) store.setMarketStatus(data.status);
          store.setFeedStatus({ feedProvider: data.feed_provider, feedState: data.feed_state, isSynthetic: Boolean(data.is_synthetic), lastTick: data.last_tick });
        }
      } catch {
        if (!controller.signal.aborted) useMarketStore.getState().setFeedStatus({ feedState: "UNAVAILABLE" });
      } finally { inFlight = false; }
    };
    void refresh();
    const interval = setInterval(refresh, 30000);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  // Stable callback reads the latest targets. Updating targets never tears down the socket.
  const syncSubscriptions = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const state = useMarketStore.getState();
    const targets = subscriptionTargets(state.watchlistSymbols, state.activeViewSymbols, useTradingStore.getState().selectedSymbol);
    const targetSet = new Set(targets), current = subscribed.current;
    const added = targets.filter(symbol => !current.has(symbol));
    const removed = [...current].filter(symbol => !targetSet.has(symbol));
    if (removed.length) ws.send(JSON.stringify({ action: "unsubscribe", symbols: removed }));
    if (added.length) ws.send(JSON.stringify({ action: "subscribe", symbols: added }));
    if (added.length || removed.length) {
      subscribed.current = targetSet;
      state.setSubscribedSymbols(targets);
    }
  }, []);

  useEffect(() => { syncSubscriptions(); }, [watchlistSymbols, activeViewSymbols, selectedSymbol, syncSubscriptions]);

  useEffect(() => {
    let active = true;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const connect = () => {
      if (!active) return;
      useMarketStore.getState().setConnectionState("connecting");
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;
      const current = () => active && wsRef.current === ws;
      ws.onopen = () => {
        if (!current()) return;
        useMarketStore.getState().setConnectionState("connected");
        subscribed.current.clear();
        syncSubscriptions();
        heartbeat = setInterval(() => { if (current() && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "ping" })); }, 30000);
      };
      ws.onmessage = event => {
        if (!current()) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "feed_status") {
            const status = data.feed_status || data;
            useMarketStore.getState().setFeedStatus({ feedProvider: status.feed_provider, feedState: status.feed_state, isSynthetic: Boolean(status.is_synthetic), lastTick: status.last_tick, updatedAt: status.updated_at });
          } else if (data.type === "quote" && data.quote) {
            useMarketStore.getState().updateQuote(data.quote as Quote);
          }
        } catch { /* Ignore malformed provider messages. */ }
      };
      ws.onerror = () => { if (current()) useMarketStore.getState().setConnectionState("disconnected"); };
      ws.onclose = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (!current()) return;
        useMarketStore.getState().setConnectionState("disconnected");
        subscribed.current.clear();
        useMarketStore.getState().setSubscribedSymbols([]);
        reconnect = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      active = false;
      if (reconnect) clearTimeout(reconnect);
      if (heartbeat) clearInterval(heartbeat);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) { ws.onclose = null; ws.close(); }
      subscribed.current.clear();
      useMarketStore.getState().setSubscribedSymbols([]);
      useMarketStore.getState().setConnectionState("disconnected");
    };
  }, [syncSubscriptions]);
  return <>{children}</>;
}
