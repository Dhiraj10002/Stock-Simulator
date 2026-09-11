# Stock Simulator — Project Plan & Implementation Guide

> **Purpose:** This file is the source of truth for Codex/AI agents working on the Stock Simulator project.
>
> **Important:** Always inspect the existing codebase before making changes. Do not invent files, functions, packages, APIs, database fields, or architecture that are not present or required.

---

# 1. Project Overview

**Stock Simulator** is a production-style paper trading platform for the Indian market (NSE/BSE).

Users trade using virtual/dummy money while working with realistic market workflows:

- Intraday trading
- Delivery trading
- F&O trading
- Wallet/cash balance
- Orders
- Portfolio
- P&L
- Market prices
- Charts
- Market/news information
- AI trading mentor
- News sentiment

The goal is to provide realistic trading practice without financial risk.

---

# 2. Core Rules for Development

These rules must be followed by every developer/AI agent.

## Architecture

- Preserve the existing project architecture.
- Do not introduce a different architecture unless explicitly requested.
- Prefer simple, maintainable Go code.
- Do not over-engineer.
- Do not create unnecessary abstractions.
- Reuse existing packages/functions whenever possible.

## Before Coding

Always:

1. Inspect the relevant existing files.
2. Check how the current feature is implemented.
3. Check imports and package names.
4. Check existing models and database setup.
5. Check existing routes.
6. Check configuration/environment variables.
7. Make the smallest required change.

## After Coding

Always run:

```bash
go fmt ./...
go test ./...
go run ./cmd/server
```

For frontend changes:

```bash
npm run lint
npm run build
```

Do not claim a feature is complete until it compiles/tests successfully.

## Secrets

Never commit:

- `.env`
- API keys
- JWT secrets
- database passwords
- Anthropic API keys
- Redis credentials

Use `.env.example` / `.env` only.

---

# 3. Mandatory Technology Stack

Do not suggest alternatives unless explicitly requested.

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- Vercel for hosting
- `lightweight-charts` for trading charts

## Backend

- Go
- Gin HTTP framework
- GORM
- PostgreSQL
- JWT authentication
- bcrypt password hashing
- WebSocket using `gorilla/websocket`

## Database

- PostgreSQL
- Neon PostgreSQL free tier

## Cache / Live Price Store

- Redis
- Upstash Redis free tier

## Market Data

- Python service/worker
- Delayed market-data source initially
- Render background worker

## AI

- Anthropic API
- Server-side only
- Never expose Anthropic API keys to the frontend

## Deployment

- Frontend: Vercel
- Go services: Render
- Python worker: Render Background Worker
- PostgreSQL: Neon
- Redis: Upstash

## Cost Constraint

The project must stay on genuine free tiers during the current development phase.

Do not add paid services/dependencies unless explicitly approved.

---

# 4. Repository Structure

Current intended structure:

```text
Stock-Simulator/
├── .github/
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   ├── internal/
│   │   ├── app/
│   │   ├── auth/
│   │   │   ├── dto/
│   │   │   ├── handler/
│   │   │   ├── middleware/
│   │   │   ├── repository/
│   │   │   ├── service/
│   │   │   └── token/
│   │   ├── config/
│   │   ├── database/
│   │   ├── handler/
│   │   ├── middleware/
│   │   ├── model/
│   │   ├── repository/
│   │   ├── router/
│   │   └── service/
│   ├── pkg/
│   │   ├── logger/
│   │   └── response/
│   ├── .env
│   ├── .env.example
│   ├── go.mod
│   └── go.sum
├── docker/
├── docs/
│   ├── api/
│   ├── architecture/
│   ├── database/
│   └── requirements/
├── frontend/
├── python-services/
├── scripts/
├── LICENSE
├── README.md
└── project.md
```

Do not reorganize this structure without a clear reason.

---

# 5. Current Backend Foundation

The following foundation has already been implemented.

## Configuration

Existing configuration contains:

```text
APP_NAME
APP_ENV
PORT
API_VERSION
DATABASE_URL
JWT_SECRET
```

Configuration is loaded using:

- `godotenv`
- `viper`

Main file:

```text
backend/internal/config/config.go
```

## Application Bootstrap

Main application flow:

```text
Load Config
    ↓
Initialize Logger
    ↓
Connect PostgreSQL
    ↓
Run GORM migrations
    ↓
Setup Gin Router
    ↓
Start HTTP Server
```

Main file:

```text
backend/internal/app/app.go
```

## Database

PostgreSQL connection is implemented using:

- GORM
- PostgreSQL driver

File:

```text
backend/internal/database/database.go
```

## User Model

Current user model contains approximately:

```go
type User struct {
    ID        uint
    UUID      uuid.UUID
    Name      string
    Email     string
    Password  string
    CreatedAt time.Time
    UpdatedAt time.Time
    DeletedAt gorm.DeletedAt
}
```

Do not change existing fields unless required.

## Router

Current API prefix:

```text
/api/v1
```

Current health endpoint:

```text
GET /api/v1/health
```

---

# 6. Phase 1 — Backend Foundation

Status:

- [x] Project structure
- [x] Go module
- [x] Config loader
- [x] Environment variables
- [x] Logger
- [x] PostgreSQL connection
- [x] GORM setup
- [x] User migration
- [x] Gin router
- [x] Health API
- [x] Standard response package
- [ ] Recovery middleware
- [ ] Request logging middleware
- [ ] CORS middleware
- [ ] Request ID middleware
- [ ] Validator
- [ ] Swagger/OpenAPI
- [ ] Docker setup

Complete remaining foundation items before major trading functionality.

---

# 7. Phase 2 — Authentication

Authentication must be completed before wallet, portfolio, and trading.

Reason:

```text
User
 ↓
Authentication
 ↓
Wallet
 ↓
Portfolio
 ↓
Orders
 ↓
Trading Engine
```

Everything trading-related is user-specific.

## 2.1 Registration

Endpoint:

```text
POST /api/v1/auth/register
```

Flow:

```text
Request
 ↓
Bind JSON
 ↓
Validate
 ↓
Check email
 ↓
Hash password with bcrypt
 ↓
Create User
 ↓
Return success
```

Current status:

- [x] Register DTO
- [x] Repository Create
- [x] FindByEmail
- [x] Password hashing
- [x] Register service
- [x] Register handler
- [x] Register route
- [x] Tested successfully with Postman

## 2.2 Login

Endpoint:

```text
POST /api/v1/auth/login
```

Flow:

```text
Email + Password
 ↓
Find user
 ↓
Compare bcrypt hash
 ↓
Generate JWT
 ↓
Return access token
```

JWT:

- Algorithm: HS256
- Secret: `JWT_SECRET`
- Access token lifetime: 15 minutes

Current status:

- [x] JWT generation foundation
- [x] Login service foundation
- [x] Login handler foundation
- [ ] Verify login end-to-end

## 2.3 JWT Middleware

Implement:

```text
Authorization: Bearer <token>
```

Middleware must:

1. Check Authorization header.
2. Verify Bearer format.
3. Parse JWT.
4. Validate signature.
5. Validate expiry.
6. Extract user ID.
7. Store user ID in Gin context.
8. Reject invalid/expired tokens with HTTP 401.

Do not trust user ID supplied by request body/query.

## 2.4 Current User API

Endpoint:

```text
GET /api/v1/auth/me
```

Requires JWT.

Response should contain safe user information only:

```json
{
  "id": 1,
  "uuid": "...",
  "name": "Dhiraj Gupta",
  "email": "dhiraj@gmail.com"
}
```

Never return:

```text
password
password hash
JWT secret
database credentials
```

## 2.5 Refresh Token

Implement refresh tokens after access-token authentication works.

Recommended flow:

```text
Login
 ↓
Access Token
 ↓
Refresh Token
```

Access token:

```text
15 minutes
```

Refresh token:

```text
long-lived
```

Refresh endpoint:

```text
POST /api/v1/auth/refresh
```

The exact storage strategy must be compatible with the current architecture. Do not introduce Redis just for refresh tokens before the Redis phase unless necessary.

## 2.6 Logout

Implement logout after refresh tokens.

Expected behavior:

- Invalidate refresh token/session.
- Access token remains naturally short-lived if using stateless JWT.

---

# 8. Phase 3 — Wallet

Create user wallet after authentication.

Initial wallet requirements:

```text
User
 ↓
Wallet
 ├── Cash Balance
 ├── Available Balance
 ├── Blocked/Margin Amount
 └── Transaction History
```

## Initial Virtual Capital

Use a fixed virtual starting amount.

Example:

```text
₹10,00,000
```

This is virtual money only.

The exact starting amount should be stored/configurable rather than hard-coded throughout business logic.

## Wallet APIs

Implement:

```text
GET  /api/v1/wallet
GET  /api/v1/wallet/transactions
```

Later:

```text
POST /api/v1/wallet/reset
```

Reset must be carefully protected and should be intended for simulator functionality, not real financial deposits.

---

# 9. Phase 4 — Portfolio

Portfolio tracks the user's current holdings.

Data:

```text
User
 ↓
Portfolio
 ↓
Positions
 ├── Symbol
 ├── Quantity
 ├── Average Price
 ├── Current Price
 ├── Invested Value
 ├── Current Value
 ├── Unrealized P&L
 └── P&L %
```

API:

```text
GET /api/v1/portfolio
GET /api/v1/portfolio/positions
GET /api/v1/portfolio/pnl
```

Important:

- Portfolio must be derived from executed trades.
- Do not allow clients to directly modify holdings.
- Server-side calculations are authoritative.

---

# 10. Phase 5 — Orders

Order system supports:

## Order Types

```text
MARKET
LIMIT
```

Later:

```text
STOP_LOSS
STOP_LIMIT
```

## Product Types

```text
INTRADAY
DELIVERY
FNO
```

## Order Status

```text
PENDING
OPEN
EXECUTED
CANCELLED
REJECTED
```

## Order API

```text
POST   /api/v1/orders
GET    /api/v1/orders
GET    /api/v1/orders/:id
DELETE /api/v1/orders/:id
```

The server must validate:

- User authentication
- Symbol
- Quantity
- Price where required
- Product type
- Order type
- Available funds
- Position requirements
- Market availability

Never trust calculations from frontend.

---

# 11. Phase 6 — Trading Engine

This is the core of the project.

Architecture:

```text
Order API
    ↓
Order Validation
    ↓
Trading Engine
    ↓
Market Price
    ↓
Order Matching
    ↓
Execution
    ↓
Wallet Update
    ↓
Portfolio Update
    ↓
Order Status Update
    ↓
Transaction Record
```

## Important Principle

Order execution must be atomic.

A successful trade should update:

```text
Order
Wallet
Position
Transaction
```

consistently.

Use PostgreSQL transactions where required.

Example conceptual flow:

```text
BEGIN TRANSACTION

Create/Update Order
      ↓
Validate Funds
      ↓
Execute Trade
      ↓
Update Wallet
      ↓
Update Position
      ↓
Create Transaction

COMMIT
```

Rollback on failure.

---

# 12. Phase 7 — Market Data

Initial implementation uses a delayed market-data source.

Create Python service/worker for data ingestion.

Flow:

```text
Market Data Source
       ↓
Python Worker
       ↓
Redis
       ↓
Go Backend
       ↓
Frontend
```

Redis stores:

- Latest price
- OHLC data
- Market status
- Symbol metadata where appropriate

Do not make the frontend directly depend on the market-data provider.

---

# 13. Phase 8 — WebSocket / Live Prices

Go backend exposes WebSocket functionality.

Technology:

```text
gorilla/websocket
```

Flow:

```text
Market Data
    ↓
Redis
    ↓
Go WebSocket Server
    ↓
Frontend
```

Frontend receives price updates without continuously polling HTTP endpoints.

Possible endpoint:

```text
/ws/market
```

The exact protocol should be documented before implementation.

---

# 14. Phase 9 — Trading Charts

Frontend uses:

```text
lightweight-charts
```

Charts should support:

- Candlestick chart
- Time intervals
- Volume where data supports it
- Symbol switching
- Live price updates
- Historical data

Avoid building a charting engine from scratch.

---

# 15. Phase 10 — Frontend Trading UI

Build the frontend after backend contracts are stable.

Main screens:

```text
Login
Register
Dashboard
Market Watch
Stock Detail
Chart
Buy/Sell Order
Orders
Portfolio
Wallet
Transactions
P&L
Profile
```

Trading screen should show:

```text
Symbol
Current Price
Chart
Buy/Sell
Quantity
Order Type
Product Type
Estimated Amount
Available Balance
Order Confirmation
```

---

# 16. Phase 11 — AI Trading Mentor

Technology:

```text
Anthropic API
```

Important:

```text
Frontend
   ↓
Go Backend
   ↓
Anthropic API
```

Never:

```text
Frontend
   ↓
Anthropic API
```

Never expose the Anthropic API key to browser/client code.

AI mentor can provide:

- Trade explanation
- Risk explanation
- Portfolio insights
- Educational guidance
- Market context
- Post-trade analysis

The AI must not be treated as a guaranteed financial prediction system.

---

# 17. Phase 12 — News Sentiment

Flow:

```text
News Source
   ↓
Python Service
   ↓
Sentiment Analysis
   ↓
Backend/Redis
   ↓
Frontend
```

Display:

```text
Positive
Neutral
Negative
```

Include source/time where appropriate.

---

# 18. Phase 13 — Redis

Use Redis/Upstash for:

- Latest market prices
- Temporary market data
- Rate limiting
- Cache
- Potential refresh-token/session support if later required

Do not put PostgreSQL permanent business records only in Redis.

PostgreSQL remains the source of truth for:

```text
Users
Orders
Trades
Wallet
Transactions
Portfolio-related persistent data
```

---

# 19. Phase 14 — Security

Implement:

- JWT validation
- bcrypt password hashing
- Input validation
- CORS
- Request ID
- Rate limiting
- Safe error messages
- SQL injection protection through GORM/query parameters
- No secrets in Git
- No password in API responses
- No JWT secret exposure
- No Anthropic key exposure

Use generic authentication errors:

```text
invalid email or password
```

Do not reveal whether an email exists during login.

---

# 20. Phase 15 — API Documentation

Use Swagger/OpenAPI.

Document:

- Authentication
- Wallet
- Portfolio
- Orders
- Trades
- Market data
- WebSocket
- AI endpoints

Keep API docs synchronized with actual handlers/routes.

Existing API documentation is under:

```text
docs/api/
```

---

# 21. Phase 16 — Testing

## Backend Unit Tests

Test:

```text
Config
Auth Service
JWT
Password Hashing
Wallet
Order Validation
Trading Engine
Portfolio Calculations
P&L
```

## Integration Tests

Test:

```text
Register
Login
Authenticated endpoint
Wallet creation
Order creation
Order execution
Portfolio update
```

## Important Trading Tests

Test edge cases:

```text
Insufficient balance
Invalid quantity
Invalid price
Duplicate order
Cancelled order
Partial/unsupported execution
Selling without holdings
Intraday restrictions
Delivery restrictions
```

---

# 22. Phase 17 — Docker

Create Docker setup for local development.

Expected services:

```text
Go Backend
Frontend
Python Worker
```

Use external Neon/Upstash services while maintaining the free-tier constraint.

Do not introduce unnecessary local infrastructure if it conflicts with the current setup.

---

# 23. Phase 18 — Deployment

## Frontend

Deploy to:

```text
Vercel
```

## Backend

Deploy Go API to:

```text
Render Web Service
```

## Python Worker

Deploy as:

```text
Render Background Worker
```

## Database

Use:

```text
Neon PostgreSQL
```

## Redis

Use:

```text
Upstash Redis
```

Before deployment verify:

```text
Environment variables
CORS
Database connection
JWT secret
API URLs
WebSocket URL
Frontend environment variables
```

---

# 24. Phase 19 — CI/CD

Use GitHub Actions.

Pipeline:

```text
Push / Pull Request
       ↓
Go formatting
       ↓
Go tests
       ↓
Go build
       ↓
Frontend lint
       ↓
Frontend build
       ↓
Deploy
```

Do not deploy code that fails tests/build.

---

# 25. Recommended Implementation Order

Follow this exact order unless there is a strong technical reason not to.

```text
PHASE 1
Backend Foundation
        ↓
PHASE 2
Authentication
        ↓
PHASE 3
Wallet
        ↓
PHASE 4
Portfolio
        ↓
PHASE 5
Orders
        ↓
PHASE 6
Trading Engine
        ↓
PHASE 7
Market Data
        ↓
PHASE 8
WebSocket
        ↓
PHASE 9
Charts
        ↓
PHASE 10
Frontend Trading UI
        ↓
PHASE 11
AI Mentor
        ↓
PHASE 12
News Sentiment
        ↓
PHASE 13
Redis Optimization
        ↓
PHASE 14
Security Hardening
        ↓
PHASE 15
Swagger
        ↓
PHASE 16
Testing
        ↓
PHASE 17
Docker
        ↓
PHASE 18
Deployment
        ↓
PHASE 19
CI/CD
```

---

# 26. Current Progress

Based on the current project state:

## Completed

```text
[x] Repository foundation
[x] Frontend initialized
[x] Backend initialized
[x] Go module
[x] Config loader
[x] Logger
[x] Gin router
[x] Health API
[x] Standard API response
[x] PostgreSQL connection
[x] GORM
[x] User model
[x] User migration
[x] Auth DTO
[x] Auth repository
[x] Password hashing
[x] Register service
[x] Register handler
[x] Register route
[x] Register API tested successfully
```

## In Progress

```text
[~] Login
[ ] JWT middleware
[ ] /auth/me
[ ] Refresh token
[ ] Logout
```

## Next Immediate Task

**Finish Authentication completely.**

Order:

```text
1. Verify Login
2. JWT middleware
3. /auth/me
4. Refresh token
5. Logout
6. Authentication tests
```

Then move immediately to:

```text
Wallet
```

---

# 27. Codex Working Instructions

When Codex receives this file, follow these rules:

## Rule 1 — Inspect First

Before coding, inspect:

```text
project.md
README.md
backend/
frontend/
docs/
```

and the specific files related to the requested task.

## Rule 2 — Don't Hallucinate

Never assume that a function/file exists.

Bad:

```text
database.DB
```

unless it actually exists.

Good:

```text
Inspect database.go first.
Use the existing database API.
```

## Rule 3 — Preserve Existing Code

Do not rewrite working code unnecessarily.

Make focused changes.

## Rule 4 — Complete One Feature

For every task:

```text
Inspect
 ↓
Implement
 ↓
Format
 ↓
Test
 ↓
Build
 ↓
Explain changes
```

## Rule 5 — Give Copy-Paste-Ready Code

When changes are needed, provide:

```text
FILE: path/to/file.go

<complete code>
```

Prefer complete files for small modules.

## Rule 6 — Do Not Change Technology

Use the defined stack.

Do not replace:

```text
Go → Node
Gin → Fiber
GORM → Prisma
PostgreSQL → MongoDB
Redis → another cache
Next.js → another frontend framework
```

unless explicitly requested.

## Rule 7 — Don't Over-Engineer

The objective is:

```text
Production-quality
+
Simple
+
Understandable
+
Testable
```

not maximum abstraction.

---

# 28. Definition of Done

A feature is considered complete only when:

```text
[ ] Code implemented
[ ] Existing architecture preserved
[ ] gofmt/npm formatting completed
[ ] Tests added/updated where appropriate
[ ] Build passes
[ ] API manually tested where applicable
[ ] Error cases handled
[ ] No secrets committed
[ ] Documentation updated where needed
```

---

# 29. Product Goal

The final application should allow a user to:

```text
Register
   ↓
Login
   ↓
Receive virtual money
   ↓
View market prices
   ↓
Open chart
   ↓
Place order
   ↓
Order gets executed
   ↓
Wallet updates
   ↓
Portfolio updates
   ↓
P&L updates
   ↓
View order/trade history
   ↓
Receive market/news insights
   ↓
Use AI mentor for educational analysis
```

The platform should feel like a realistic Indian stock-market paper-trading application while using virtual money.

---

# 30. Source of Truth

If this document conflicts with the actual source code:

1. Inspect the source code.
2. Preserve working behavior.
3. Update this document if the architecture intentionally changed.
4. Never invent an implementation just to match this document.

**Current source code + this document = project context.**
