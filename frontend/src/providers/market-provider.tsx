"use client";

import React, { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useMarketStore } from "@/stores/market-store";
import { getApiUrl, getWsUrl } from "@/lib/config";
import type { Quote } from "@/types";

const PUBLIC_ROUTES = new Set(["/", "/login", "/signup", "/3d"]);

const ALL_MARKET_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "INFY",
  "HDFCBANK",
  "TATAMOTORS",
  "BHARTIARTL",
  "ETERNAL",
  "ZOMATO",
  "SUZLON",
  "TRENT",
  "ADANIENT",
  "YESBANK",
  "BEL",
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "MIDCPNIFTY",
  "SENSEX",
  "SBIN",
  "ICICIBANK",
  "ATGL",
  "POONAWALLA",
  "TATACHEM",
  "TATAPOWER",
  "PRAJIND",
  "BAJFINANCE",
  "AXISBANK",
  "KOTAKBANK",
  "APARINDS",
  "MARUTI",
];

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname ? PUBLIC_ROUTES.has(pathname) : false;

  const updateQuote = useMarketStore((s) => s.updateQuote);
  const setConnectionState = useMarketStore((s) => s.setConnectionState);
  const setFeedProvider = useMarketStore((s) => s.setFeedProvider);
  const setFeedStatus = useMarketStore((s) => s.setFeedStatus);
  const setMarketStatus = useMarketStore((s) => s.setMarketStatus);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch authoritative market calendar & feed status on mount and periodically
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

  // 2. Manage WebSocket connection (only for authenticated / trading app routes)
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

          // Subscribe to all relevant market symbols
          ws.send(
            JSON.stringify({
              action: "subscribe",
              symbols: ALL_MARKET_SYMBOLS,
            })
          );
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
          if (isSubscribed) {
            // Reconnect after 2 seconds
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
  }, [isPublic, updateQuote, setConnectionState, setFeedStatus, setFeedProvider]);

  return <>{children}</>;
}
