# Stock Simulator — Production Deployment Plan & Handoff
## Final Deployment Runbook

**Reviewed:** 2026-10-06  
**Repository:** https://github.com/Dhiraj10002/Stock-Simulator  
**Target architecture:** Vercel + Oracle Cloud VM + Neon PostgreSQL + private VM Redis + Caddy  
**Deployment status:** PRE-PRODUCTION — deploy only after the release gates in this document pass

---

## 1. Executive decision

The proposed deployment architecture is suitable for this project:

| Layer | Production target |
|---|---|
| Next.js frontend | Vercel |
| Go API/backend | Oracle Cloud VM, Docker |
| Market worker | Oracle Cloud VM, Docker |
| News worker | Oracle Cloud VM, Docker |
| Redis | Private Redis 7 container on the same Oracle VM |
| PostgreSQL | Neon Production |
| HTTPS/TLS + WebSocket gateway | Caddy on the Oracle VM |
| Broker data | Angel One SmartAPI, server-side only |

Oracle documents an Always Free Ampere A1 option equivalent to up to 2 OCPUs and 12 GB RAM for qualifying tenancies; capacity can be temporarily unavailable by region/availability domain. Start with a shape that reliably runs the stack and measure actual CPU/RAM usage before scaling. Do not assume free capacity is guaranteed. citeturn787721search2

### Important correction to the supplied deployment artifact

The artifact is directionally correct, but it is **not yet an exact runbook for the current repository**.

The current production Compose publishes backend port 8080 directly and does not define Caddy as a Compose service. The repository already contains `deploy/oracle/Caddyfile`, so the clean production design is:

`Internet → Caddy :80/:443 → backend :8080`

with backend 8080 bound to loopback only, or kept entirely on the private Docker network.

The repository also has documentation drift around Redis: `docker-compose.prod.yml` uses a private Redis container, while `docs/deployment.md` still describes Upstash. For the current plan, use **private VM Redis** and update the documentation accordingly.

---

## 2. Architecture

```
                         ┌───────────────────────┐
                         │      Vercel CDN        │
                         │  Next.js 16 frontend   │
                         └───────────┬───────────┘
                                     │ HTTPS
                                     │ REST + WSS
                                     ▼
                        ┌────────────────────────┐
                        │   Oracle Cloud VM       │
                        │                         │
Internet :80/:443 ───► │ Caddy reverse proxy     │
                        │      │                  │
                        │      ▼                  │
                        │ Go Backend :8080        │
                        │      │                  │
                        │      ├── Redis :6379     │
                        │      ├── Market Worker   │
                        │      └── News Worker     │
                        │                         │
                        │ Redis is PRIVATE        │
                        └───────┬─────────────────┘
                                │ TLS
                                ▼
                         ┌───────────────┐
                         │ Neon Postgres │
                         │  Production   │
                         └───────────────┘

                    Market Worker
                         │
                         ▼
                 Angel One SmartAPI
```

Caddy can terminate HTTPS automatically for a public hostname and proxy WebSocket connections. Public 80/443 reachability is required. citeturn787721search5turn659459search5

---

## 3. Pre-deployment release rule

Do **not** deploy `main` merely because CI is green.

Before production:
1. Merge only the reviewed/hardened changes that have passed CI.
2. Record the exact deploy SHA.
3. Run disposable PostgreSQL/Redis integration tests.
4. Run Go race tests.
5. Run frontend lint/typecheck/build.
6. Run market-worker and news-worker tests in an approved environment.
7. Run authenticated end-to-end tests.
8. Perform live SmartAPI acceptance.
9. Verify backup/restore and rollback.
10. Record release, master version and schema state.

The project must continue to fail closed when authoritative market data is unavailable.

---

## 4. Cloud accounts

Prepare:
- GitHub
- Vercel
- Oracle Cloud
- Neon
- Angel One SmartAPI
- DNS/domain provider

Never put Angel One credentials, database credentials, JWT secrets or broker tokens into `NEXT_PUBLIC_*` variables. Next.js exposes `NEXT_PUBLIC_*` values in the browser bundle at build time. citeturn807905search1

---

## 5. Oracle VM

### Recommended starting VM

Use Ubuntu 24.04 LTS 64-bit.

Suggested starting allocation:
```
2 OCPU
8–12 GB RAM
50+ GB boot volume
Public IPv4
```

Oracle's Always Free A1 allowance is up to 2 OCPUs and 12 GB RAM for qualifying tenancies, subject to regional capacity. citeturn787721search2

### Why this size

The host runs:
- Go backend
- Python market worker
- Python news worker
- Redis
- Caddy
- Docker/OS

Measure `docker stats` and actual memory pressure after deployment before deciding whether to reduce the allocation.

---

## 6. OCI network/security

Public ingress should be only:

```
TCP 80   0.0.0.0/0
TCP 443  0.0.0.0/0
TCP 22   YOUR_PUBLIC_IP/32
```

Do not publicly expose:
```
6379
8080
8085
5432
3000
```

OCI Security Lists or NSGs provide the network-level control; Oracle recommends limiting ingress to explicitly required sources and ports. citeturn659459search0turn659459search6

Docker-published ports can interact with host firewall rules in ways that surprise operators, so loopback-binding the backend is the safer design. Docker documents this firewall consideration. citeturn787721search7

---

## 7. Domain/DNS

Recommended:

```
Frontend:   https://stock-simulator.example.com
Backend:    https://api.stock-simulator.example.com
WebSocket:  wss://api.stock-simulator.example.com/ws/market
```

Create:

```
A  api.stock-simulator.example.com  -> Oracle VM public IPv4
```

You can begin with the Vercel-provided frontend domain, but a custom domain is preferable before wider release.

---

## 8. Install Docker on Oracle Ubuntu

Use Docker's official Ubuntu repository/install flow. Docker currently supports Ubuntu 22.04, 24.04 and 26.04 and supports arm64, which fits OCI Ampere A1. citeturn787721search7

```bash
sudo apt update
sudo apt install -y ca-certificates curl

sudo install -m 0755 -d /etc/apt/keyrings

sudo curl -fsSL \
  https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc

sudo chmod a+r /etc/apt/keyrings/docker.asc

# Use the current Ubuntu codename from /etc/os-release.
# Example for Ubuntu 24.04:
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<'EOF'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: arm64
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update

sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

sudo systemctl enable --now docker

sudo docker run hello-world
docker compose version
```

If your image is not Ubuntu 24.04, replace `noble` with the actual release codename.

---

## 9. Clone repository

```bash
sudo mkdir -p /opt/stock-simulator
sudo chown "$USER":"$USER" /opt/stock-simulator

cd /opt/stock-simulator
git clone https://github.com/Dhiraj10002/Stock-Simulator.git .
```

Then:

```bash
git fetch --all --tags
git status
git rev-parse HEAD
git log -1 --oneline
```

Production must use an explicitly approved SHA, not an arbitrary working branch.

---

## 10. Production environment

```bash
cd /opt/stock-simulator
cp .env.prod.example .env
chmod 600 .env
nano .env
```

Recommended structure:

```dotenv
APP_ENV=production
PORT=8080

DATABASE_URL=YOUR_NEON_PRODUCTION_CONNECTION_STRING
JWT_SECRET=GENERATED_RANDOM_SECRET

CORS_ALLOWED_ORIGINS=https://stock-simulator.example.com

REDIS_URL=redis://redis:6379/0
MARKET_WORKER_URL=http://market-worker:8085

MARKET_FEED_MODE=live

ALLOW_SEEDED_QUOTES=false
SIMULATION_MODE=false
ALLOW_SEEDED_EXECUTABLE_QUOTES=false

ANGEL_API_KEY=YOUR_SERVER_SIDE_KEY
ANGEL_CLIENT_ID=YOUR_CLIENT_ID
ANGEL_CLIENT_CODE=YOUR_CLIENT_CODE
ANGEL_PASSWORD=YOUR_PASSWORD_OR_PIN
ANGEL_TOTP_SECRET=YOUR_TOTP_SECRET

INSTRUMENT_REFRESH_SECONDS=60
```

Generate JWT:

```bash
openssl rand -hex 32
```

Never commit `.env`.

---

## 11. Neon production database

Create a **separate production Neon project/database**.

Do not use development credentials or a development database.

Neon provides both direct and pooled connection URIs. citeturn807905search2

For this repository, validate the exact connection mode against the application's GORM/connection-pool behavior before release. The database is the authoritative source for:
- users
- wallets
- orders
- trades
- positions
- instruments
- accounting state

Redis must not become the source of truth for financial records.

---

## 12. Migration policy

The repository has `RUN_MIGRATION` handling and GORM auto-migration code.

Do not permanently configure:

```dotenv
RUN_MIGRATION=true
```

for every restart.

Preferred deployment flow:

```
backup
  ↓
migration step
  ↓
schema validation
  ↓
application rollout
  ↓
smoke test
```

Before first production launch, inspect the current migration implementation and confirm its exact operations against Neon.

---

## 13. Redis

Current production Compose correctly uses:

```
Redis 7
private Docker network
AOF persistence
no public port
```

Keep this architecture unless intentionally changed.

Do not deploy Upstash just because the older `docs/deployment.md` mentions it.

---

## 14. Required Compose hardening

Current `docker-compose.prod.yml` contains:

```yaml
ports:
  - "8080:8080"
```

Change it to:

```yaml
ports:
  - "127.0.0.1:8080:8080"
```

The intended traffic path becomes:

```
Internet
   ↓
Caddy :443
   ↓
127.0.0.1:8080
   ↓
Go backend
```

Do not leave backend port 8080 public.

---

## 15. Caddy

The repository already contains:

```
deploy/oracle/Caddyfile
```

The existing file uses:

```
reverse_proxy backend:8080
```

That is correct if Caddy is another container on `stock_sim_net`. Caddy documents that `localhost` inside Docker refers to the Caddy container itself, not the host. citeturn659459search8

### Recommended: Caddy inside Compose

Add:

```yaml
caddy:
  image: caddy:2-alpine
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./deploy/oracle/Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
  networks:
    - stock_sim_net
  depends_on:
    backend:
      condition: service_healthy
```

And:

```yaml
volumes:
  redis_prod_data:
  caddy_data:
  caddy_config:
```

This preserves certificate/config state across container replacement.

Caddy automatically provisions TLS certificates when the public hostname and ports are correctly configured. citeturn787721search5

---

## 16. Caddy routing

Use:

```caddyfile
api.stock-simulator.example.com {
    handle /api/* {
        reverse_proxy backend:8080
    }

    handle /ws/* {
        reverse_proxy backend:8080
    }

    handle /health {
        rewrite * /api/v1/health
        reverse_proxy backend:8080
    }

    handle /ready {
        rewrite * /api/v1/ready
        reverse_proxy backend:8080
    }

    handle /openapi.yaml {
        reverse_proxy backend:8080
    }
}
```

Caddy's `reverse_proxy` supports WebSocket upgrades. citeturn659459search5

---

## 17. Backend startup

Start only Redis + backend first:

```bash
docker compose -f docker-compose.prod.yml up -d redis backend
```

Verify:

```bash
docker compose -f docker-compose.prod.yml ps
```

Then activate/sync the instrument master using the repository's supported command:

```bash
docker compose -f docker-compose.prod.yml run \
  --rm \
  --no-deps \
  --entrypoint /sync-instruments \
  backend
```

Verify:
- one valid active production snapshot
- non-zero tradable instruments
- current F&O contracts
- expected segment/token fields

Only then start market/news workers and Caddy.

---

## 18. Start workers/proxy

```bash
docker compose -f docker-compose.prod.yml up -d market-worker news-worker caddy
```

Then:

```bash
docker compose -f docker-compose.prod.yml ps
```

Expected:

```
redis          healthy
backend        healthy
market-worker  healthy
news-worker    running
caddy          running
```

---

## 19. Local VM health checks

```bash
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS http://127.0.0.1:8080/api/v1/ready
```

The current repository readiness model checks DB, Redis, market feed state, worker heartbeat, instrument master and calendar/session state.

---

## 20. Public HTTPS checks

After DNS is correct:

```bash
curl -i https://api.stock-simulator.example.com/health
curl -i https://api.stock-simulator.example.com/ready

curl -i https://api.stock-simulator.example.com/api/v1/health
curl -i https://api.stock-simulator.example.com/api/v1/ready
```

Also verify direct public access to port 8080 fails.

---

## 21. Vercel deployment

Import the GitHub repository into Vercel.

Set:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | default |

The repository currently uses Next.js 16.x. Let Vercel detect Next.js unless a project-specific build issue requires an override.

---

## 22. Vercel production variables

Set:

```dotenv
NEXT_PUBLIC_API_URL=https://api.stock-simulator.example.com/api/v1
NEXT_PUBLIC_WS_URL=wss://api.stock-simulator.example.com/ws/market
```

These variables are public browser configuration, not secrets. Vercel requires a new deployment for changed environment values to take effect. citeturn807905search1turn807905search6

---

## 23. CORS contract

Oracle:

```dotenv
CORS_ALLOWED_ORIGINS=https://stock-simulator.example.com
```

Do not use:

```text
*
```

in production.

When the frontend moves from a Vercel temporary domain to the custom domain, update CORS deliberately and redeploy/restart the backend.

---

## 24. WebSocket validation

After login:

```
Browser DevTools
   → Network
   → WS
   → /ws/market
```

Expect:
- HTTP 101 upgrade
- continuous market updates
- correct symbol identity
- exchange timestamps
- reconnect after disconnect
- source/provenance preserved

Caddy supports the required WebSocket proxying. citeturn787721search9

---

## 25. Authentication checks

Test:

```
register
login
refresh
logout
authenticated portfolio
authenticated wallet
authenticated orders
expired access token
refresh token
invalid credentials
rate limiting
```

The current router supports Redis-backed auth/write rate limiting when enabled.

---

## 26. Proxy/rate-limit identity

Caddy sits in front of Go, so explicitly define the trusted proxy boundary.

Do not blindly trust arbitrary `X-Forwarded-For` values from clients.

Required architecture:

```
Internet
   ↓
Caddy
   ↓
Go
```

Test that the backend sees the intended client identity for rate limiting and security logging.

---

## 27. SmartAPI secrets

Keep:

```
ANGEL_API_KEY
ANGEL_CLIENT_ID
ANGEL_CLIENT_CODE
ANGEL_PASSWORD
ANGEL_TOTP_SECRET
```

server-side only.

Never place them in:
- frontend source
- `NEXT_PUBLIC_*`
- GitHub
- logs
- screenshots
- browser storage
- PR text

---

## 28. Market feed production rule

Production must use:

```dotenv
MARKET_FEED_MODE=live
ALLOW_SEEDED_QUOTES=false
SIMULATION_MODE=false
ALLOW_SEEDED_EXECUTABLE_QUOTES=false
```

Healthy path:

```
Angel One
   ↓
Market Worker
   ↓
Redis
   ↓
Go backend
   ↓
Vercel frontend
```

Failure path:

```
Angel One unavailable
      ↓
feed degraded/unavailable
      ↓
trade execution blocked
      ↓
no synthetic fallback
      ↓
pending/retry or honest unavailable state
```

---

## 29. Instrument master

Before live worker startup:

```
download
  ↓
validate
  ↓
stage
  ↓
activate one version
  ↓
worker loads same version
```

Validate:
- segment
- exchange
- token
- symbol identity
- duplicate tokens
- expiry
- strike
- active/tradable state
- historical identity

Only eligible listed F&O instruments should be surfaced.

---

## 30. Calendar

The application currently uses a sourced 2026 calendar and fail-closed behavior for unsupported years.

NSE currently lists 15-Jan-2026 as a weekday holiday and notes that 08-Nov-2026 is Diwali Laxmi Pujan/Muhurat Trading, with the Muhurat timing to be notified separately. citeturn787721search0turn787721search6

Before production:
- verify 2026 source
- verify segment-specific timing
- verify MIS cutoff
- keep unconfirmed special-session timings disabled
- add future calendar versions deliberately

Do not invent special-session hours.

---

## 31. Backup

Before the first live deployment:

```
database backup/snapshot
configuration backup
approved release SHA
previous release SHA
instrument master version
schema/migration state
rollback instructions
```

Financial records are authoritative in PostgreSQL.

Redis persistence is useful for operational continuity, but Redis is not the accounting authority.

---

## 32. Rollback

Record:

```
CURRENT_RELEASE_SHA
PREVIOUS_RELEASE_SHA
SCHEMA_VERSION
INSTRUMENT_MASTER_VERSION
```

Application rollback:

```bash
git checkout PREVIOUS_RELEASE_SHA
docker compose -f docker-compose.prod.yml up -d --build
```

Do not perform destructive database rollback automatically.

---

## 33. First production smoke test

### Frontend

```
home
login
dashboard
search
chart
option chain
portfolio
orders
wallet
```

### Market data

Test:
- one NSE equity
- one index
- one current stock future
- one liquid call
- one liquid put

Verify:
- symbol
- segment
- token
- price
- paise scaling
- exchange timestamp
- previous close
- day change
- OI
- stale state
- source

### Paper execution

Test:
- delivery buy
- delivery partial sell
- MIS long
- MIS short
- limit
- SL
- SL-M
- cancellation
- duplicate exit
- expiry settlement path

No broker order placement.

---

## 34. Controlled outage tests

Test in a non-production acceptance environment first:

```
Redis unavailable
market worker unavailable
Angel One feed unavailable
stale quote
missing quote
cold history
database interruption
reconnect
```

Expected:

```
honest unavailable/degraded state
no fabricated prices
no fabricated candles
no re-timestamped stale prices
no invalid execution
retry/pending where appropriate
```

---

## 35. Validation commands

### Frontend

```bash
cd frontend
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
```

### Market worker

```bash
cd python-services/market-worker
python -m pip install -r requirements.txt
python -m unittest discover -v -p 'test_*.py'
```

### News worker

```bash
cd python-services/news-worker
python -m pip install -r requirements.txt
python -m unittest discover -v -p 'test_*.py'
```

### Disposable backend services

```bash
cd ../..
bash scripts/run-disposable-tests.sh
```

### Backend

```bash
cd backend
go vet ./...
go test -count=1 -p 1 ./...
go test -race -count=1 -p 1 ./...
```

Never run destructive fixtures against Neon production.

---

## 36. Mobile/deployed frontend profiling

The repository currently exposes:

```bash
cd frontend

npm run profile:mobile -- \
  --url https://stock-simulator.example.com \
  --paths /,/login \
  --runs 3 \
  --output artifacts/deployed-mobile
```

Use this after the Vercel production deployment exists.

---

## 37. Monitoring

Minimum production monitoring:

```
CPU
RAM
disk
container restarts
backend latency
Redis availability
DB latency/pool waits
worker heartbeat
last market tick
subscribed token count
feed state
instrument master version
5xx rate
login failures
WebSocket reconnects
```

Use `/ready` as the service-health signal for external monitoring, but do not confuse application readiness with complete production certification.

---

## 38. Logs

Never log:
- JWT secrets
- database passwords
- SmartAPI credentials
- TOTP
- auth headers
- session tokens

Safe operational fields include:
- request ID
- route
- latency
- HTTP status
- symbol
- segment
- feed state
- master version
- error class

---

## 39. Production Compose gaps found in this review

### P0 — public backend port

Current:
```yaml
ports:
  - "8080:8080"
```

Required:
```yaml
ports:
  - "127.0.0.1:8080:8080"
```

### P0 — Caddy is not currently in production Compose

Repository has the Caddyfile, but `docker-compose.prod.yml` needs either:
- a Caddy service on `stock_sim_net`, or
- an explicitly managed host-installed Caddy.

Recommended: Compose-managed Caddy.

### P1 — deployment docs are inconsistent on Redis

`docs/deployment.md` says Upstash, while current production Compose uses private Redis.

Choose one architecture. This handoff chooses **private VM Redis**.

### P1 — frontend missing-variable fallback

`frontend/src/lib/config.ts` can fall back to same-origin URLs when production public variables are absent.

For production, a missing API/WS URL should be surfaced as a deployment/configuration error instead of silently pretending the same-origin route is valid.

### P1 — proxy trust/rate-limit behavior

Define and test the Caddy → Go client-IP trust boundary.

### P1 — deployment automation

After the manual path is stable, create controlled CI/CD with:

```
CI
 ↓
build/test
 ↓
deploy approved SHA
 ↓
health check
 ↓
rollback on failure
```

Do not automate production before the manual process has passed acceptance.

---

## 40. Final release gates

- [ ] Approved release SHA selected
- [ ] CI green
- [ ] Go tests pass
- [ ] Go race test passes
- [ ] Frontend tests/lint/typecheck/build pass
- [ ] Worker tests pass in approved environment
- [ ] Disposable PostgreSQL/Redis integration passes
- [ ] Oracle security rules verified
- [ ] SSH restricted
- [ ] 8080 not publicly reachable
- [ ] 6379 not publicly reachable
- [ ] Caddy HTTPS verified
- [ ] WebSocket 101 verified
- [ ] Exact production CORS verified
- [ ] Auth rate limiting verified
- [ ] Neon production DB verified
- [ ] Backup/restore path verified
- [ ] Instrument master activated
- [ ] Calendar verified
- [ ] SmartAPI live acceptance completed
- [ ] Authenticated E2E completed
- [ ] Paper trading paths validated
- [ ] Outage/reconnect behavior validated
- [ ] Rollback path tested
- [ ] Monitoring/alerts active
- [ ] No production certification based on CI alone

---

## 41. Final deployment sequence

```
PHASE 1
Review + merge approved code
        ↓
PHASE 2
Oracle VM + DNS + firewall
        ↓
PHASE 3
Docker + Compose
        ↓
PHASE 4
Neon production database
        ↓
PHASE 5
Private Redis
        ↓
PHASE 6
Caddy HTTPS/WSS
        ↓
PHASE 7
Go backend
        ↓
PHASE 8
Instrument master
        ↓
PHASE 9
Market + news workers
        ↓
PHASE 10
/health + /ready
        ↓
PHASE 11
Vercel frontend
        ↓
PHASE 12
Authenticated E2E
        ↓
PHASE 13
Live SmartAPI acceptance
        ↓
PHASE 14
Outage + rollback validation
        ↓
PHASE 15
Final release decision
```

---

## 42. Current deployment status

| Area | Status |
|---|---|
| Architecture | ✅ Suitable |
| Docker production stack | ⚠️ Minor hardening required |
| Caddy config | ✅ Exists |
| Caddy Compose service | ❌ Not yet integrated |
| Backend 8080 public binding | ❌ Must be hardened |
| Redis architecture | ✅ Private VM Redis |
| Neon production | ⏳ Pending |
| Oracle VM | ⏳ Pending |
| DNS | ⏳ Pending |
| Vercel | ⏳ Pending |
| SmartAPI live acceptance | ⏳ Pending |
| Authenticated E2E | ⏳ Pending |
| Production certification | ❌ Not yet |

---

## 43. Sources checked

- Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm citeturn787721search2
- Docker Engine on Ubuntu: https://docs.docker.com/engine/install/ubuntu/ citeturn787721search7
- Caddy HTTPS: https://caddyserver.com/docs/quick-starts/https citeturn787721search5
- Caddy reverse proxy/WebSocket: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy citeturn787721search9
- Vercel environment variables/security: https://vercel.com/academy/nextjs-foundations/env-and-security citeturn807905search1
- Neon connection URI: https://api-docs.neon.tech/reference/getconnectionuri citeturn807905search2
- NSE 2026 market holidays: https://www.nseindia.com/resources/exchange-communication-holidays citeturn787721search0turn787721search6

**This file is the production deployment handoff for Codex/Gemini. Do not improvise around the release gates, and never replace unavailable authoritative market data with synthetic or stale fallbacks.**
