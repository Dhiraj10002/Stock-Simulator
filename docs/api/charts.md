# Trading charts

The frontend stock chart uses `lightweight-charts` and consumes the
backend market contracts:

- Historical candles: `GET /api/v1/market/quotes/:symbol/history?limit=100`
- Live prices: `ws://localhost:8080/ws/market`

The chart converts integer paise from the API into rupees for display. Select a
symbol or candle limit from the toolbar. The last candle is updated when a live
quote arrives, while the historical series remains sourced from Redis.

Set these variables when the backend is not local:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws/market
```
