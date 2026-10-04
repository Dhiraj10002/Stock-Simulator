# Angel One verification: integration review, 4 October 2026

Issue #9 remains open. The committed CLOSED/DISPLAY reports are user-supplied evidence of cached provider prices and historical candles; they do not establish fresh open-session ticks, depth or paper execution. No broker credentials were used in this review.

## Corrections in PR #13

- Select nearest unexpired expiry from eligible options, excluding futures, inactive/non-tradable contracts and malformed dates. Use exchange-local expiry cutoff and propagate database failures.
- Read already validated option contract quotes directly from Redis, avoiding repeated metadata lookups. Cache-only HTTP display reads queue asynchronous worker demand; they do not fan out synchronous broker calls on a cold cache.
- Smoke selection prefers the futures catalog, validates exact underlying, contract kind, exchange, active/tradable flags, numeric token, positive lot size and expiry-day cutoff. Invalid/expired contracts cannot silently become a fallback.
- Retain PR #12's tested NSE-first worker mappings. Historical latency figures are supplied observations, not independently repeated benchmarks.

## Actual open-session acceptance

First verify current official exchange schedules, holidays and the application's calendar; do not infer OPEN from weekday or local time alone. The application's expiry policy still uses 15:30 IST and needs a separate schedule audit against current exchange circulars.

Start the updated platform on the machine hosting the backend. Confirm `/api/v1/ready` and `/api/v1/market/status` report a matching active master and authentic LIVE feed. Then run:

```bash
python3 scripts/smoke_test_live_session.py --base-url http://localhost:8080/api/v1 --equity RELIANCE --underlying NIFTY --expect-open --output live-data-evidence.json
```

For paper execution, use a dedicated empty account and privately set `STOCK_SIM_SMOKE_TOKEN` to its application access token. Run once for index derivatives and once for stock derivatives:

```bash
python3 scripts/smoke_test_live_session.py --base-url http://localhost:8080/api/v1 --equity RELIANCE --underlying NIFTY --expect-open --paper-orders --output live-paper-evidence.json
python3 scripts/smoke_test_live_session.py --base-url http://localhost:8080/api/v1 --equity RELIANCE --underlying RELIANCE --expect-open --paper-orders --output live-stock-paper-evidence.json
```

These use application paper orders, never broker order placement. Inspect the account after any failure before retrying. Confirm no positions/pending orders remain and reconcile wallet/ledger. Separately inspect dashboard charts, moving prices and supplied depth; the current smoke script does not certify depth or wallet-ledger equality automatically. Attach sanitized evidence to #9 and close it only after actual OPEN-session results are reviewed. Keep tokens and broker keys in ignored local configuration.
