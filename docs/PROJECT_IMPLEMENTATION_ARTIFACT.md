# Stock Simulator — Implementation Artifact

This is the learning and handover record for the project from its initial setup
through the News Sentiment phase. It states what is implemented today, why it
exists, and what remains.

## Project summary

Stock Simulator is an Indian-market paper-trading platform. Users practise
buying and selling using virtual money. Prices are currently simulated/delayed;
the project is not for real-money trading or financial advice.

```text
Next.js frontend
  │ HTTP + JWT / WebSocket
  ▼
Go + Gin backend
  ├── PostgreSQL: permanent business records
  ├── Redis: temporary data, cache, and Pub/Sub
  └── Gemini: educational mentor only
        ▲                    ▲
        │                    │
Python market worker  Python news worker
```

## Technology choices

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js, TypeScript, Tailwind, lightweight-charts | Trading UI, charting, WebSocket consumer |
| Backend | Go, Gin, GORM | HTTP API, authentication, trading business rules |
| Database | PostgreSQL | Users, wallets, orders, positions, trades, refresh sessions |
| Cache/live data | Redis | Quotes, candles, live Pub/Sub events, temporary news cache |
| Workers | Python | Market simulation and news ingestion/sentiment |
| AI | Gemini 3.7 Flash | Backend-only educational mentor |

### Storage rule

PostgreSQL is the source of truth for permanent financial records. Redis stores
temporary/live information only. Orders, wallet balances, positions, and trades
must never exist only in Redis.

## Completed phases

| Phase | Status | Implemented result |
|---|---|---|
| Foundation | Complete | Config, logging, PostgreSQL/GORM, migrations, Docker, health route, CORS, recovery, request IDs, validation |
| Authentication | Complete | Register/login, bcrypt, access/refresh JWTs, sessions, refresh rotation, logout invalidation, `/auth/me` |
| Wallet | Complete | Virtual wallet, cash/available/blocked balances, transaction history, reset, safe credit/debit/reserve/release |
| Portfolio | Complete | Positions, invested/current value, unrealised P&L |
| Orders/trades | Complete | Buy/sell market and limit orders, cancellation, execution, trades, atomic wallet/order/position updates |
| Market data | Complete | Redis quotes and candles, Python market worker, REST quote/history APIs |
| WebSocket | Complete | Redis Pub/Sub to Go Gorilla WebSocket endpoint |
| Trading charts | Complete | Candlestick/volume chart, symbol switching, history and live price updates |
| Frontend trading UI | Complete | Auth, dashboard, market/order form, orders, portfolio, wallet, transactions, profile |
| AI mentor | Complete | Protected Go-to-Gemini educational analysis endpoint and UI |
| News sentiment | Complete | RSS to Python lexical scoring to Redis to Go API to frontend News page |

## Backend structure

```text
backend/internal/
  auth/       authentication, JWT middleware, DTOs, repository, service
  wallet/     wallet API, transactions, balance operations
  order/      order API, repository, execution service
  portfolio/  position and P&L calculations
  trade/      execution-history retrieval
  market/     Redis quote/history service and WebSocket server
  news/       Redis news-read service and API
  ai/         Gemini mentor service and API
  model/      GORM domain models
  router/     route wiring
```

The design is handler → service → repository. Handlers manage HTTP input/output,
services hold business rules, and repositories persist/query database records.

## Authentication and security work

```text
Register → bcrypt password hash → User + virtual wallet
Login    → password verification → access token + refresh token
Access   → Authorization: Bearer <token> on protected endpoints
Refresh  → stored refresh session validated and rotated
Logout   → refresh session invalidated
```

Implemented safeguards:

- bcrypt password hashing
- JWT validation middleware
- refresh-session storage and invalidation
- request validation
- CORS origin configuration
- request IDs, request logs, and panic recovery
- GORM/parameterised persistence queries
- local `.env` ignored by Git
- no Gemini key in the frontend/browser

## Domain model and money handling

```text
User
 ├── RefreshSession
 └── Wallet
      └── WalletTransaction

User
 ├── Order
 │    └── Trade
 └── Position
```

All money is stored and transferred as integer **paise**, avoiding floating-point
currency errors. The frontend converts paise to rupees only for display.

| Record | Meaning |
|---|---|
| Wallet | Cash balance, available balance, and blocked/reserved balance |
| WalletTransaction | Audit record for balance movement |
| Order | Buy/sell intent: symbol, type, product, quantity, price, status |
| Trade | Immutable record created at execution |
| Position | Quantity held, average price, value, unrealised P&L |

## Transaction-safe order execution

```text
Limit BUY creation
  → verify available funds
  → reserve/blocked wallet amount
  → create order + wallet transaction

Cancellation
  → release reservation
  → update order status

Execution
  → lock records inside one PostgreSQL transaction
  → validate/use market price
  → debit or release wallet funds
  → create/update position
  → create trade + wallet transaction
  → update order status
  → commit all changes together
```

This prevents partial state: a trade cannot execute while its wallet, position,
and order remain inconsistent.

## Market data and live prices

`python-services/market-worker` generates deterministic simulated quotes for
`RELIANCE`, `TCS`, `INFY`, and `HDFCBANK`.

```text
Market worker
  → Redis market:quote:<SYMBOL>       latest quote
  → Redis market:history:<SYMBOL>     candle list
  → Redis market:updates              Pub/Sub live event
  → Go WebSocket server
  → Next.js chart
```

REST endpoints:

```text
GET /api/v1/market/quotes/:symbol
GET /api/v1/market/quotes/:symbol/history?limit=100
```

WebSocket endpoint: `ws://localhost:8080/ws/market`

```json
{"action":"subscribe","symbols":["RELIANCE","TCS"]}
```

```json
{"type":"quote","quote":{"symbol":"RELIANCE","price_paise":250000,"source":"simulated","updated_at":"..."}}
```

Full protocol: [WebSocket documentation](api/websocket.md).

## Frontend work

The frontend has these completed screens:

- Register and login
- Dashboard metrics
- Market terminal and live chart
- Buy/sell order form
- Orders
- Portfolio and P&L
- Wallet and transaction history
- News sentiment
- AI Mentor
- Profile and logout

The frontend sends its access token in the `Authorization` header for protected
API calls. It uses REST for ordinary data and WebSocket for price events.

Public frontend configuration:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws/market
```

## AI Trading Mentor

```text
Frontend question
  → POST /api/v1/ai/analyze-trade (JWT protected)
  → Go backend applies educational/risk instructions
  → Gemini 3.7 Flash
  → answer returned to frontend
```

Backend-only configuration:

```env
GEMINI_API_KEY=your-secret-key
GEMINI_MODEL=gemini-3.7-flash
```

The mentor is instructed to explain concepts and risks. It must not promise
returns, make certain price predictions, or give personalised financial advice.
See [AI Mentor documentation](api/ai-mentor.md).

## News Sentiment

```text
Public RSS feed
  → Python news worker
  → simple finance-word lexicon
  → POSITIVE / NEUTRAL / NEGATIVE
  → Redis news:items
  → GET /api/v1/news
  → Frontend News page
```

The response has title, source, link, published time, label, score, and matched
symbols. This is an educational lexical signal, not a trading recommendation.

```text
GET /api/v1/news?limit=20
GET /api/v1/news?symbol=RELIANCE
```

See [News API documentation](api/news.md).

## Implemented API list

### Public

```text
GET  /api/v1/health
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/market/quotes/:symbol
GET  /api/v1/market/quotes/:symbol/history
GET  /api/v1/news
GET  /ws/market                         WebSocket upgrade
```

### JWT-protected

```text
GET    /api/v1/auth/me
GET    /api/v1/wallet
GET    /api/v1/wallet/transactions
POST   /api/v1/wallet/reset
GET    /api/v1/portfolio
GET    /api/v1/portfolio/positions
GET    /api/v1/portfolio/pnl
POST   /api/v1/orders
GET    /api/v1/orders
GET    /api/v1/orders/:id
DELETE /api/v1/orders/:id
POST   /api/v1/orders/:id/execute
GET    /api/v1/trades
POST   /api/v1/ai/analyze-trade
```

## Local run and verification

Start containers:

```bash
docker compose up --build
```

This starts PostgreSQL, Redis, Go backend, market worker, and news worker.

Start frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

Checks run during implementation:

```bash
cd backend && go test ./...
python3 -m py_compile python-services/market-worker/worker.py
python3 -m py_compile python-services/news-worker/worker.py
docker compose config --quiet
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

## Important files

| Area | File |
|---|---|
| Router/API composition | `backend/internal/router/router.go` |
| App startup/migrations | `backend/internal/app/app.go` |
| Configuration | `backend/internal/config/config.go` |
| Docker services | `docker-compose.yml` |
| Frontend terminal | `frontend/src/app/trading-terminal.tsx` |
| Live chart | `frontend/src/app/market-chart.tsx` |
| Market worker | `python-services/market-worker/worker.py` |
| News worker | `python-services/news-worker/worker.py` |
| AI contract | `docs/api/ai-mentor.md` |

## Remaining roadmap

1. **Phase 13 — Redis hardening:** cache policy, rate limiting, Upstash
   production configuration, resilient connection/error handling.
2. **Phase 14 — Security hardening:** automated security tests, strict
   WebSocket origin allowlist, rate limits, safe third-party error mapping.
3. **Phase 15 — API documentation:** reconcile and complete OpenAPI/Swagger
   with only implemented endpoints and their exact schemas.
4. **Later business features:** stock/instrument master, watchlist, F&O detail,
   intraday leverage and auto square-off, deployment, monitoring, CI/CD.

## Project explanation for interview/demo

> “Stock Simulator is a paper-trading platform built with Next.js, Go,
> PostgreSQL, Redis, and Python workers. PostgreSQL stores permanent financial
> state, while Redis supports live market data, Pub/Sub, and temporary news.
> Orders execute atomically so wallet balances, positions, trades, and order
> status stay consistent. Historical prices arrive over REST; live prices arrive
> over WebSockets. An educational Gemini mentor is called only from the backend,
> so private provider keys never reach the browser.”

## Honest current limitations

- Market prices are simulated/delayed rather than exchange-grade live feeds.
- News sentiment is a simple lexicon, not a trained FinBERT model.
- Gemini free-tier availability and limits can change and require a local key.
- This is a learning paper-trading system, not production real-money trading.
