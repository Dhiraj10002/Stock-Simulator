# Production performance and reliability rollout

This release preserves the cinematic homepage and trading layouts. It changes correctness, session transport, quote rendering and operations. It does not certify a latency SLA or complete a deployment automatically.

## Behavior

- `POST /api/v1/orders` requires `Idempotency-Key` (1–128 characters). A normalized intent hash and key are persisted with the order and its reservation/share validation in a PostgreSQL transaction. Concurrent accepted retries return the same order UUID; different payloads with that key return 409. Keys survive hidden history and process restarts. An accepted market order interrupted before settlement can resume without another financial order or fill.
- Browser order submissions retain the same key in session storage through an uncertain response/reload. A confirmed acceptance completes the intent, allowing a later deliberate identical order. Validation failures do not create financial rows. The browser never retries an uncertain trade with a newly generated key.
- Derivative identity comparisons accept exact decimals and equivalent date formats. Neither direction of a 100× strike difference is accepted during activation. Older paise records require a separately reviewed migration backed by archived broker identity evidence; there is no prefix-only or bulk-rescaling bypass. Preserve historical IDs, fills and positions. The currently activated canonical master does not need to be rescaled again.
- Auth/private account calls use `/api/backend/*` on the frontend origin. Access and refresh JWTs are HttpOnly, Secure, SameSite=Lax, host-only cookies in production; JWTs never appear in browser JSON or local storage. The readable session cookie contains only an account cache scope and cannot authenticate a request. Legacy local-storage credentials are removed, and old sessions must sign in again.
- Private writes require the frontend's exact Origin and `X-Requested-With: stocksim`. The gateway uses a fixed server-only upstream, an endpoint allowlist, bounded request bodies, no redirects, no-store responses and request timeouts. Refresh retries derive the same backend retry key from the existing refresh cookie, including after a lost response. Cross-tab rotations are serialized when Web Locks is available.
- Public quote REST and WSS remain direct to Oracle. Display updates keep the newest valid tick per symbol and publish once per animation frame; original arrival/exchange timestamps still determine freshness. Hidden tabs keep only latest quotes. Reconnects use capped exponential backoff with jitter and reset after a stable connection; heartbeat silence closes a stalled socket. Healthy F&O streams suspend unnecessary display polling, while authoritative wallet/order-preview checks continue.
- Order-history polling no longer launches a database write goroutine. Old terminal history uses the same 24-hour visibility rule as a SELECT predicate. Durable financial records and retry keys remain stored.
- Unsupported VIX/PCR/bias and homepage compliance, audit and latency claims are replaced with truthful unavailable/sample labels. The homepage preview disclaimer is visible. Optional Vercel Speed Insights collects actual field Web Vitals; laboratory traces do not prove field INP.
- HTTP header/read/write/idle and request-body limits protect Go; WebSocket traffic is hijacked and keeps its own heartbeat lifecycle. Readiness uses the current observation time for worker heartbeat age and requires fresh feed data through the NFO session as well as NSE.

## Configure before deploying

Generate a **separate** random gateway secret with `openssl rand -hex 32` in your terminal. Do not share it in screenshots/chat or commit `.env`.

| Location | Variable | Value |
| --- | --- | --- |
| Oracle `.env` | `FRONTEND_PROXY_SECRET` | New gateway secret |
| Vercel server environment | `BACKEND_PROXY_SECRET` | Same gateway secret |
| Vercel server environment | `BACKEND_API_URL` | `https://stocksim-api.duckdns.org/api/v1` |
| Vercel public environment | `NEXT_PUBLIC_API_URL` | Same public API URL |
| Vercel public environment | `NEXT_PUBLIC_WS_URL` | `wss://stocksim-api.duckdns.org/ws/market` |
| Vercel public environment | `NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS` | `true` to enable field measurements |

The gateway refuses production requests when its server-only secret/HTTPS upstream is missing. Never use a `NEXT_PUBLIC_` name for secrets. Deploy the backend configuration **before** the frontend cookie session release, then redeploy Vercel to include the new build-time public variables. The optional Docker frontend receives the same server-only secret at runtime.

`frontend/vercel.json` selects Mumbai (`bom1`) for private gateway functions, avoiding Vercel's default US function hop for the India deployment. Confirm the actual Oracle VM region in OCI before rollout; change this region if the backend moves. Static frontend assets remain served by the CDN globally. Set the Vercel project Root Directory to `frontend` so this file is used.

The new-order API contract also applies to scripts/mobile/native clients: use a durable intent key and retain it after a timeout. `scripts/smoke_test_live_session.py` supplies one per intentional new order. Existing open orders/exits remain unchanged.

## Explicit broker proxy

The old implicit `host.docker.internal:8118` default is removed. **Before updating the VM**, explicitly choose the working route in its `.env`:

1. If direct Oracle egress is accepted by Angel One, leave `BROKER_HTTP_PROXY` and `BROKER_HTTPS_PROXY` empty.
2. If using the existing host bridge, set **both** to `http://host.docker.internal:8118`. Confirm that its actual owning service is managed by systemd with restart-on-failure, starts after boot and is reachable only from the private container network. A laptop-only reverse tunnel is not an always-on production dependency.
3. For the provided optional supervised proxy, set both to `http://broker-proxy:8118`, configure `deploy/oracle/broker-proxy/config` for an approved upstream if required, then run:

```bash
sudo docker compose --env-file .env -f docker-compose.prod.yml --profile broker-proxy up -d --build broker-proxy
sudo docker compose --env-file .env -f docker-compose.prod.yml exec broker-proxy curl --head --silent --show-error --max-time 8 --proxy http://127.0.0.1:8118 https://smartapisocket.angelone.in/
```

This profile has no public proxy port, restart policy, CONNECT/TLS health check and bounded Docker logs. A proxy on the **same VM does not change its public egress IP**; verify login and WSS from the chosen approved route. Do not open port 8118 to the internet. Do not put upstream passwords in the tracked config; mount a protected local config when credentials are required.

The worker probes configured CONNECT/origin TLS before connection attempts, reports `BROKER_PROXY_UNAVAILABLE` without printing credentials, and keeps retrying with jitter. Provider ticks retain broker event timestamps; outage never silently enables synthetic execution. Verify the worker image includes `broker_proxy.py`.

## Safe release and recovery

1. Record current frontend deployment and image/commit IDs; take a managed database snapshot/backup and verify a restore in a separate disposable database. Back up the protected `.env` and Caddy certificate volume securely.
2. Configure the gateway secret and **explicitly preserve the working broker route**. Review `docker compose config --quiet` without printing the expanded environment.
3. Deploy/build the reviewed backend/worker revision. Startup adds schema migration `2026100701` (intent columns and unique index) transactionally; no financial history is deleted. Observe readiness and master/worker agreement. Do not force a new master sync on every release.
4. Deploy the frontend with the environment above. Verify sign-in, refresh after access expiry, two-tab requests, logout, private no-store responses, quote subscriptions/reconnect, mobile keyboard and unavailable states.
5. During an open market, use a dedicated paper account for delivery, MIS, futures/options entry/exit and wallet/P&L reconciliation. Confirm same-key replay returns the same order, changed-payload replay is 409, and broker disconnection blocks new execution. No live account orders are placed by this release's browser tests.
6. Retain a **schema-compatible** backend rollback artifact. Old main binaries intentionally reject a database newer than their schema ledger; an ordinary checkout to the old binary is not a valid rollback after migration. Prefer a forward fix/compatible artifact. Do not downgrade the ledger or restore an old database over newer financial writes. Keep backend and frontend session contracts compatible.

Optional VM monitoring (edit the checked-in paths/domain to match your installation first):

```bash
sudo install -m 644 deploy/oracle/stocksim-{monitor.service,monitor.timer,alert.service} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stocksim-monitor.timer
sudo journalctl -u stocksim-monitor.service -u stocksim-alert.service --since '-15 min'
```

The timer checks readiness every minute, emits structured status and a local journal failure alert, and may restart an unhealthy market worker after three failed checks with a ten-minute cooldown. It does not restart a healthy worker or one with a known proxy failure, nor restart the financial API/database. `restart: unless-stopped` alone does not restart an alive-but-unhealthy container. Connect these journal alerts to your chosen external monitoring service before relying on unattended operations; no external notification destination is guessed or configured here.

## Measure on the deployed VM and mobile

Run the compiled read-only database profiler from the production backend image:

```bash
sudo docker compose --env-file .env -f docker-compose.prod.yml exec -T backend /profile-db -samples 20 -plans > database-profile.json
```

Compare warm `SELECT 1` p50/p95 with plan **execution** time. If a trivial warm round trip is hundreds of milliseconds while execution is low, optimize region/network placement first. Confirm Oracle and Neon project regions in their consoles; test a nearby disposable Neon project with a representative restored dataset before scheduling any data migration. Do not change production `DATABASE_URL` just to benchmark. Query/index changes require real plans, row counts and before/after evidence. The removal of per-poll history writes and the unique intent index are concrete changes in this release; no production latency reduction is claimed yet.

From the frontend checkout, use the existing deployed read-only mobile profiler:

```bash
npm run profile:mobile -- --url https://stock-simulator-gules.vercel.app --paths /,/login,/stocks --runs 3 --output artifacts/mobile-production
```

Use a separate protected storage state for authenticated **read-only** pages if needed; do not commit cookies or send them in chat. Capture ordinary and reduced-motion traces on a real mobile device too. Use Speed Insights field p75 for LCP ≤2.5s, INP ≤200ms and CLS ≤0.1. Test open-market quote arrival to display separately from broker/exchange age and executable-price validation. Network geography/provider delivery cannot be bypassed by promising instant updates.

The deterministic batching regression sends 100 ticks for two symbols and observes one store notification with the newest prices. This establishes update coalescing, not a measured phone FPS or exchange-to-screen latency SLA.
