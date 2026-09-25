"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  useMarketStore,
  DEFAULT_BENCHMARK_SYMBOLS,
  MAX_CLIENT_SUBSCRIPTIONS,
} from "@/stores/market-store";
import { useTradingStore } from "@/stores/trading-store";
import { getApiUrl, getWsUrl } from "@/lib/config";
import { apiFetch } from "@/lib/api";
import { fetchInstruments } from "@/lib/instruments";
import type { Quote } from "@/types";

const PUBLIC_ROUTES = new Set(["/login", "/signup", "/3d"]);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname ? PUBLIC_ROUTES.has(pathname) : false;

  const updateQuote = useMarketStore((s) => s.updateQuote);
  const setConnectionState = useMarketStore((s) => s.setConnectionState);
  const setFeedProvider = useMarketStore((s) => s.setFeedProvider);
  const setFeedStatus = useMarketStore((s) => s.setFeedStatus);
  const setMarketStatus = useMarketStore((s) => s.setMarketStatus);
  const setInstruments = useMarketStore((s) => s.setInstruments);

  // Phase 5 Targeted Subscriptions
  const watchlistSymbols = useMarketStore((s) => s.watchlistSymbols);
  const activeViewSymbols = useMarketStore((s) => s.activeViewSymbols);
  const setWatchlistSymbols = useMarketStore((s) => s.setWatchlistSymbols);
  const setSubscribedSymbols = useMarketStore((s) => s.setSubscribedSymbols);
  const selectedTradingSymbol = useTradingStore((s) => s.selectedSymbol);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedSymbolsRef = useRef<Set<string>>(new Set());

  // 1. Fetch canonical instruments for client-side search and metadata lookup
  useEffect(() => {
    if (isPublic) return;
    fetchInstruments()
      .then((list) => {
        setInstruments(list);
      })
      .catch((err) => {
        console.error("Failed to fetch canonical instruments:", err);
      });
  }, [isPublic, setInstruments]);

  // 2. Fetch user's DB-backed watchlist to populate initial targeted subscriptions
  useEffect(() => {
    if (isPublic) return;
    apiFetch<{ symbol: string }[]>("/watchlist")
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setWatchlistSymbols(items.map((i) => i.symbol));
        }
      })
      .catch(() => {
        // Unauthenticated or watchlist empty
      });
  }, [isPublic, setWatchlistSymbols]);

  // 3. Fetch authoritative market calendar & feed status periodically
  useEffect(() => {
    if (isPublic) return;
    const apiUrl = getApiUrl();
    const fetchStatus = () => {
      fetch(`${apiUrl}/market/status`)
        .then((res) => res.json())
        .then((body) => {
          if (body.success && body.data) {
            if (body.data.status) {
              setMarketStatus(body.data.status);
            }
            if (body.data.feed_provider || body.data.feed_state) {
              setFeedStatus({
                feedProvider: body.data.feed_provider,
                feedState: body.data.feed_state,
                isSynthetic: Boolean(body.data.is_synthetic),
                lastTick: body.data.last_tick,
              });
            }
          }
        })
        .catch(() => {
          // Fall back gracefully
        });
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [isPublic, setMarketStatus, setFeedStatus]);

  // 4. Targeted subscription synchronizer: syncs active symbols over WebSocket
  const syncSubscriptions = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Union of: benchmarks + active DB watchlist + current view + trading selection
    const candidateSymbols = [
      ...DEFAULT_BENCHMARK_SYMBOLS,
      ...watchlistSymbols,
      ...activeViewSymbols,
      ...(selectedTradingSymbol ? [selectedTradingSymbol] : []),
    ];

    const targetList = Array.from(
      new Set(
        candidateSymbols
          .map((s) => s.toUpperCase().trim())
          .filter(Boolean)
      )
    ).slice(0, MAX_CLIENT_SUBSCRIPTIONS);

    const targetSet = new Set(targetList);
    const currentSet = subscribedSymbolsRef.current;

    const toSubscribe = targetList.filter((s) => !currentSet.has(s));
    const toUnsubscribe = Array.from(currentSet).filter((s) => !targetSet.has(s));

    if (toSubscribe.length > 0) {
      wsRef.current.send(
        JSON.stringify({
          action: "subscribe",
          symbols: toSubscribe,
        })
      );
      for (const sym of toSubscribe) {
        currentSet.add(sym);
      }
    }

    if (toUnsubscribe.length > 0) {
      wsRef.current.send(
        JSON.stringify({
          action: "unsubscribe",
          symbols: toUnsubscribe,
        })
      );
      for (const sym of toUnsubscribe) {
        currentSet.delete(sym);
      }
    }

    setSubscribedSymbols(Array.from(currentSet));
  }, [watchlistSymbols, activeViewSymbols, selectedTradingSymbol, setSubscribedSymbols]);

  // Synchronize targeted subscriptions whenever targets change
  useEffect(() => {
    if (isPublic) return;
    syncSubscriptions();
  }, [isPublic, syncSubscriptions]);

  // 5. Manage WebSocket connection (only for authenticated / trading app routes)
  useEffect(() => {
    if (isPublic) {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      setConnectionState("disconnected");
      setFeedProvider("Offline");
      return;
    }

    const wsUrl = getWsUrl();
    let isSubscribed = true;

    function connect() {
      if (!isSubscribed) return;

      try {
        setConnectionState("connecting");
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isSubscribed) return;
          setConnectionState("connected");
          subscribedSymbolsRef.current.clear();
          syncSubscriptions();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "feed_status") {
              const fs = data.feed_status || data;
              setFeedStatus({
                feedProvider: fs.feed_provider,
                feedState: fs.feed_state,
                isSynthetic: Boolean(fs.is_synthetic),
                lastTick: fs.last_tick,
                updatedAt: fs.updated_at,
              });
              return;
            }
            if (data.type === "quote" && data.quote) {
              const q = data.quote;
              updateQuote({
                symbol: q.symbol,
                price_paise: q.price_paise,
                change_percent: q.change_percent,
                source: q.source,
                updated_at: q.updated_at,
              } as Quote);
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          setConnectionState("disconnected");
        };

        ws.onclose = () => {
          setConnectionState("disconnected");
          subscribedSymbolsRef.current.clear();
          if (isSubscribed) {
            reconnectTimeoutRef.current = setTimeout(connect, 2000);
          }
        };
      } catch {
        setConnectionState("disconnected");
        setFeedProvider("Offline");
        if (isSubscribed) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [isPublic, updateQuote, setConnectionState, setFeedStatus, setFeedProvider, syncSubscriptions]);

  return <>{children}</>;
}
