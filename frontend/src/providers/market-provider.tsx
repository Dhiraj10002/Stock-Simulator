"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMarketStore } from "@/stores/market-store";
import { useTradingStore } from "@/stores/trading-store";
import { useAuthToken } from "@/hooks/useAuthToken";
import { getWsUrl } from "@/lib/config";
import { apiFetch } from "@/lib/api";
import { fetchInstruments } from "@/lib/instruments";
import { subscriptionTargets } from "@/lib/marketSubscriptions";
import { coalesceQuote, reconnectDelay, type ObservedQuote } from "@/lib/liveStream";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { observeQuote } from "@/lib/quoteMetrics";
import type { Quote } from "@/types";

// Mounted only by the trading layout. Route changes within the app keep one socket.
export function MarketProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  const market = useMarketStatus("NSE", true, true);
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
    const data = market.data, store = useMarketStore.getState();
    if (market.isError) { store.setFeedStatus({ feedState: "UNAVAILABLE" }); return; }
    if (!data) return;
    if (data.status) store.setMarketStatus(data.status as Parameters<typeof store.setMarketStatus>[0]);
    store.setFeedStatus({ feedProvider: data.feed_provider as Parameters<typeof store.setFeedStatus>[0]["feedProvider"], feedState: data.feed_state as Parameters<typeof store.setFeedStatus>[0]["feedState"], isSynthetic: Boolean(data.is_synthetic), lastTick: data.last_tick });
  }, [market.data, market.dataUpdatedAt, market.isError]);

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
    let connectedBefore = false;
    let attempt = 0, openedAt = 0, lastMessageAt = 0;
    const pending = new Map<string, ObservedQuote>();
    let frame: number | undefined;
    const flush = () => { frame = undefined; if (active && pending.size) useMarketStore.getState().updateStreamQuotes([...pending.values()]); pending.clear(); };
    const onVisibility = () => { if (!document.hidden) { if (frame !== undefined) cancelAnimationFrame(frame); flush(); } };
    document.addEventListener("visibilitychange", onVisibility);
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
        openedAt = lastMessageAt = Date.now();
        useMarketStore.getState().setConnectionState("connected");
        subscribed.current.clear();
        syncSubscriptions();
        if (connectedBefore) {
          void queryClient.invalidateQueries({ queryKey: ["market-status"] });
          void queryClient.invalidateQueries({ queryKey: ["stock-history"] });
        }
        connectedBefore = true;
        heartbeat = setInterval(() => {
          if (!current() || ws.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastMessageAt > 70000) { ws.close(); return; }
          ws.send(JSON.stringify({ action: "ping" }));
        }, 30000);
      };
      ws.onmessage = event => {
        if (!current()) return;
        lastMessageAt = Date.now();
        try {
          const data = JSON.parse(event.data);
          if (data.type === "feed_status") {
            const status = data.feed_status || data;
            useMarketStore.getState().setFeedStatus({ feedProvider: status.feed_provider, feedState: status.feed_state, isSynthetic: Boolean(status.is_synthetic), lastTick: status.last_tick, updatedAt: status.updated_at });
          } else if (data.type === "quote" && data.quote) {
            observeQuote(data.quote as Quote, { received: performance.now(), receivedEpoch: Date.now(), snapshot: !!data.snapshot, serverReceived: data.server_received_at_ms, serverSent: data.server_sent_at_ms });
            coalesceQuote(pending, data.quote as Quote);
            if (!document.hidden && frame === undefined) frame = requestAnimationFrame(flush);
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
        pending.clear();
        if (frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
        if (openedAt && Date.now() - openedAt >= 30000) attempt = 0;
        openedAt = 0;
        reconnect = setTimeout(connect, reconnectDelay(attempt++));
      };
    };
    connect();
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame !== undefined) cancelAnimationFrame(frame);
      pending.clear();
      if (reconnect) clearTimeout(reconnect);
      if (heartbeat) clearInterval(heartbeat);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) { ws.onclose = null; ws.close(); }
      subscribed.current.clear();
      useMarketStore.getState().setSubscribedSymbols([]);
      useMarketStore.getState().setConnectionState("disconnected");
    };
  }, [syncSubscriptions, queryClient]);
  return <>{children}</>;
}
