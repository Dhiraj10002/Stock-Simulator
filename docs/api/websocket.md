# Live market prices (WebSocket)

The backend exposes a public WebSocket at `ws://localhost:8080/ws/market`.
Redis receives quote events from the market worker, and the Go server forwards
only the symbols selected by each connected client.

## Client messages

Subscribe to one or more symbols:

```json
{"action":"subscribe","symbols":["RELIANCE","TCS"]}
```

Stop receiving a symbol:

```json
{"action":"unsubscribe","symbols":["TCS"]}
```

The server acknowledges each command with a current subscription list:

```json
{"type":"subscribed","symbols":["RELIANCE","TCS"]}
```

## Quote events

When the worker publishes a new quote, subscribed clients receive:

```json
{"type":"quote","quote":{"symbol":"RELIANCE","price_paise":250000,"source":"simulated","updated_at":"2026-08-14T10:00:00Z"}}
```

Prices are integer paise, matching the REST market and order APIs. The local
worker publishes once per `POLL_INTERVAL_SECONDS` (60 seconds by default), so
start the stack with `docker compose up --build` before connecting.

For production, replace the development `CheckOrigin` policy with an allowlist
for the real frontend origin and add authentication if live data is private.
