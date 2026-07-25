# Stock Simulator Project Brief

Stock Simulator is a production-style paper trading platform for the Indian market
(NSE/BSE). Users trade with real market prices but virtual money so they can
practice intraday, delivery, and F&O trading without financial risk.

## Tech Stack

Use this stack strictly. Do not suggest alternatives unless explicitly asked.

- Frontend: Next.js with TypeScript and Tailwind, hosted on Vercel free tier
- Charting: TradingView `lightweight-charts` open-source package
- Backend: Go services hosted on Render free Web Service
  - `auth-service`: JWT auth
  - `trading-engine`: order matching, wallet, portfolio, P&L
- Database: PostgreSQL via Neon free tier
- Cache / live prices: Redis via Upstash free tier
- Data ingestion: Python script using a free/delayed market data source,
  running as a Render free Background Worker
- Real-time: WebSocket only with `gorilla/websocket` in Go
- AI mentor and news sentiment: Anthropic API called server-side only

Never expose Anthropic API keys or any other secrets client-side.

## Cost Constraint

Everything must stay on genuine free tiers right now.

Before adding any new dependency or service, verify it has a no-credit-card free
tier. Flag anything that requires payment instead of adding it silently.

## Architecture

```text
Client -> API Gateway -> Auth Service (verifies JWT) -> Trading Engine -> PostgreSQL
Market data provider -> Python ingestion -> Redis (live prices) -> WebSocket -> Client
```

## Feature Requirements

- Delivery (CNC): no leverage, simple buy and hold
- Intraday (MIS): leverage multiplier and auto square-off before 3:20 PM IST via
  a scheduled job
- F&O: instrument master data including strike, expiry, and lot size; simplified
  margin calculation; expiry-day handling
- AI trade mentor: structured JSON feedback on trade quality after each trade or
  at end of day
- News sentiment: FinBERT/lexicon for bulk scoring, Claude API for on-demand
  deep explanation

## Coding Conventions

- Go: standard project layout, one module per service, table-driven tests
- TypeScript: strict mode, functional React components with hooks
- Commits: conventional commits such as `feat:`, `fix:`, and `chore:`
- Never commit `.env` files or secrets

## Ask Before

Ask before:

- Adding a paid service
- Changing the core architecture
- Introducing a new major dependency or service

# Project Name

## Vision

## Problem Statement

## Solution

## Target Users

## Milestones

- Milestone 1 ✅
- Milestone 2
- Milestone 3
...
- Milestone 30