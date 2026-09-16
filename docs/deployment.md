# Deployment Architecture

The production architecture is divided across managed cloud services and an Oracle Cloud Always Free VM:

```text
Vercel (Frontend Next.js)
   │
   ▼ HTTPS
Oracle Cloud Always Free VM
   │ (Reverse Proxy Caddy / Nginx on ports 80/443)
   │
   ├── docker-compose.prod.yml
   │     ├── Go Backend (port 8080 internal)
   │     ├── Market Worker (SmartAPI WebSocket)
   │     └── News Worker (RSS Ingestion)
   │
   ├── Neon PROD PostgreSQL (DATABASE_URL with sslmode=require)
   └── Upstash PROD Redis (REDIS_URL with rediss://)
```

## Service Responsibilities
1. **Frontend**: Hosted on Vercel connecting via HTTPS to the Go Backend API and WebSocket (`wss://`).
2. **Oracle VM**: Runs application containers only (`backend`, `market-worker`, `news-worker`). No local database or Redis runs on the VM.
3. **Neon PostgreSQL**: Managed serverless Postgres holding persistent tables (`users`, `wallets`, `orders`, `trades`, `positions`, `instruments`, etc.).
4. **Upstash Redis**: Managed Redis cluster with TLS (`rediss://`) holding real-time quotes, OHLC history, and Pub/Sub channel `market:updates`.

## Local & Staging Single-Command Launch

The entire platform (Next.js Frontend, Go Backend, Python Market Worker with GBM Synthetic Feed, and Python News Worker) can be launched locally or on staging with a single command:

```bash
docker compose up --build
```

- **Institutional Frontend UI**: `http://localhost:3000`
- **Go REST API & WebSocket**: `http://localhost:8080` (`/api/v1` and `/ws/market`)
- **Market Worker**: Automatically seeds 150 historical candles and streams 1-second ticks into Redis.
- **News Worker**: Continuously ingests RSS financial headlines with sectoral sentiment scoring.

To run with local PostgreSQL and Redis containers instead of Neon and Upstash:
```bash
docker compose --profile local up --build
```

---

## Production Deployment Steps (Oracle VM / Cloud Server)
1. Install Docker and Docker Compose plugin on the VM.
2. Clone repository or deploy code artifact to the VM.
3. Configure environment variables in `backend/.env` on the VM:
   - `DATABASE_URL`: Neon PROD connection string (`sslmode=require`).
   - `REDIS_URL`: Upstash PROD connection string (`rediss://...`).
   - `JWT_SECRET`: High-entropy 64-character random string.
   - `CORS_ALLOWED_ORIGINS`: Production Vercel domain (`https://your-domain.vercel.app`).
   - `MARKET_FEED_MODE`: `auto` (attempts Angel One if credentials exist; falls back to synthetic GBM if offline).
   - `ANGEL_*` credentials: (Optional) API key, Client ID, PIN, and TOTP secret.
   - `GEMINI_API_KEY`: (Optional) Server-side Gemini API key (defaults to built-in rule engine if omitted).
4. Launch production stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
5. Startup Order:
   - Backend boots first, performs GORM auto-migrations on Neon, and starts HTTP server on `:8080`.
   - Backend health-check verifies database and readiness (`/api/v1/health`).
   - Frontend and workers boot after backend reports healthy.
6. Configure Caddy or Nginx reverse proxy with automated Let's Encrypt TLS:
   - Proxy `/api/v1/*` and `/ws/market` to `http://127.0.0.1:8080`.
   - Restrict Oracle OCI Security List / ingress rules: allow only 80 and 443 publicly; restrict port 22 to your own IP.

---

## Automated Verification Suite
To verify the entire platform end-to-end:
```bash
cd backend
go test -v -run TestE2E_FullPlatformSuite ./internal/router/...
```


