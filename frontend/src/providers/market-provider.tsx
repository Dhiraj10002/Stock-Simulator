"use client";

import React, { useEffect, useRef } from "react";
import { useMarketStore } from "@/stores/market-store";
import type { Quote } from "@/types";

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
];

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const updateQuote = useMarketStore((s) => s.updateQuote);
  const setConnectionState = useMarketStore((s) => s.setConnectionState);
  const setFeedProvider = useMarketStore((s) => s.setFeedProvider);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws/market";
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
          setFeedProvider("Angel One");

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
  }, [updateQuote, setConnectionState, setFeedProvider]);

  return <>{children}</>;
}
