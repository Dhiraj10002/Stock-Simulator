# Review of Gemini changes and next actions

Date: 2026-09-30. Reviewed commit: `f3badce` (Planner Optimization with Composite Indexes).

## Verdict

The core accounting work is substantially improved and its database regressions pass. **Not all original audit findings are resolved.** A new targeted reproduction fails for stop-limit activation persistence, and multiple original data-integrity/authentication/operational gaps remain in source.

This review did not modify application code, configuration or user accounts. Commit names and completion reports were treated as claims to verify. A passing selected suite does not establish that every workflow works against a live provider.

## What I verified

- Ran `scripts/run-disposable-tests.sh` with inherited test connection URLs removed. It created a new PostgreSQL container and cleaned it up afterward. Accounting, F05/F06/F07 regressions, reconciliation and reports tests passed.
- Existing security checks were separately rerun for configuration, import URL/redirect/size restrictions and removal of the HTTP import endpoint.
- Frontend TypeScript check passed. ESLint passed with no diagnostics.
- Frontend `npm test` could not run: its script invokes `npx tsx`, but `tsx` is absent from installed dependencies and the manifest/lockfile. The attempted npm registry resolution failed with `EAI_AGAIN`. This is a test-tooling reproducibility gap, not evidence of failing frontend assertions.
- Added one temporary test through a Go overlay under `/tmp`, leaving repository tests unchanged. It reproduced the stop-limit state bug below against another fresh PostgreSQL container. That container was also cleaned up.
- No live broker, browser E2E, full CI/container build or production deployment check was performed. Python workers were not rerun in this review. The read-only reconciliation CLI exists but was not run on user data.

## Original findings: current status

| Finding | Status | Evidence / remaining work |
|---|---|---|
| F01 public instrument import | Addressed | HTTP route removed; operator CLI, exact remote source restriction, redirect rejection and bounded reads remain. Full versioned/staged master activation is still future work. |
| F02 short-futures expiry cash | Addressed | Signed P&L precedes cash calculation in `fno_expiry.go:156`; accounting regressions pass. |
| F03 delivery/intraday mixing | Addressed | Delivery lookup includes product in `execution_service.go:104`; regression passes. |
| F04 slippage/recorded-fill mismatch | Addressed for covered scenarios | Position transitions use `fillPrice` at `execution_service.go:337`; round-trip, partial-close and reversal reconciliation checks pass. |
| F05 trigger bypass | Partially addressed | Untriggered direct execution is blocked. Trigger activation can still roll back: see R1. |
| F06 expiry parser fails open | Addressed | Month layouts now use `Jan`; malformed expiry fails closed. Date parsing regressions pass. |
| F07 unsafe duplicate exit | Partially addressed | Close-only clamping now covers ordinary square-off; concurrent exit regression passes. Durable request idempotency and position-generation binding remain absent. |
| F08 durable expiry recovery | Open | `finalQuotePrice` still reads a transient current quote, not a persisted settlement reference. |
| F09 unsafe JWT configuration | Addressed in code | Startup validation retained. Deployment secret strength/rotation was not inspected. |
| F10 concurrent refresh | Open | Each call can independently rotate the same refresh token. |
| F11 fabricated balances/daily P&L | Open | Portfolio error paths retain ₹10 lakh and 10%/5% invented daily-P&L formulas. |
| F12 margin preview mismatch | Open | Dialog and AI still maintain margin formulas separate from backend product rules. |
| F13 fabricated fresh news | Open | Empty Redis results still return hardcoded articles with current-relative timestamps. |
| F14 history/stream provenance | Open | History reader lacks provenance filtering; Pub/Sub quote forwarding lacks equivalent source/freshness validation. |
| F15 AI degraded-context honesty | Open | Default capital and separate margin formulas remain; degraded context needs explicit metadata. |
| F16 schema upgrade safety | Open | Startup still checks selected columns and ignores some migration errors. Composite performance indexes do not solve schema-version compatibility. |
| F17 readiness/limits | Partial | Rate limiting defaults on. Redis/feed readiness and HTTP server timeouts remain incomplete. |
| F18 consistency/refactoring | Partial | Accounting contracts improved; UI/auth/data-policy duplication remains. Refactor around corrected shared contracts. |

## Remaining bugs and gaps, in priority order

### R1 — High: stop-limit activation is rolled back

Evidence: `backend/internal/order/service/execution_service.go:82` and `:290`.

Both branches set a triggered stop order to OPEN. When its limit is not satisfied, they save the order and return an error from the same GORM transaction. That error rolls back the saved transition.

Reproduction: BUY SL, trigger 10,500 paise, limit 10,600, quote 10,700. The order must not fill, but its trigger activation should persist. The new isolated test instead read `TRIGGER_PENDING`. On a later price below the original trigger but inside the limit, direct execution can incorrectly require the trigger again. The background matcher uses a different activation path, so this is a direct-execution inconsistency, not proof that every stop order fails.

Do: separate durable activation from fill eligibility; commit OPEN without settlement when the limit does not match. Check save errors. Cover BUY/SELL, delivery/margin, gap-through then retracement, retries, and direct API versus matcher parity.

Reproduction artifact: `/tmp/stock-review-stop_test.go`. Output: `/tmp/stock-review-stop.log`.

### R2 — High: reduce-only is not durable idempotency

Evidence: `backend/internal/order/service/order_service.go:737`; close clamping in `execution_service.go:144` and `:317`.

The active-exit lookup and order creation are separate operations. Two requests may still create different orders; clamping protects against reversal in tested cases. There is no client request key/unique idempotency record to return the same completed result after a lost response. Exit orders are identified by symbol/product rather than binding the request to a specific position generation; a delayed exit needs protection if the same instrument is reopened.

Do: persist an idempotency key, original request fingerprint and result; bind exits to position identity/version. Test a lost response, duplicate in-flight calls and close → reopen → retry. This is a remaining design gap, not a claim that the fixed double-click reversal still reproduces.

### R3 — High: expiry processing cannot recover missing historical settlement data

Evidence: `backend/internal/order/service/fno_expiry.go:94` calls `currentQuote` and then constrains it to the expiry session.

Do: persist sourced, dated settlement references and resumable settlement progress. Exercise downtime through expiry, Redis eviction, restarts, duplicate processing and missing underlying reference. Do not substitute entry price or synthetic data in LIVE mode.

### R4 — High: UI still invents account values

Evidence: `frontend/src/app/(trading)/portfolio/page.tsx:161`, `:235`, `:312`, `:320`.

Wallet failures still become ₹10 lakh. Missing day-P&L inputs still become 10% of a holding's gain or 5% of unrealized position P&L. These are unrelated to real daily returns.

Do: explicit loading/unavailable/stale states and server-calculated daily P&L. Test outages and valid zero balances. Remove equivalent balance defaults from order-entry views.

### R5 — High: refresh-token race remains

Evidence: `frontend/src/lib/api.ts:34`; backend replay revocation in `backend/internal/auth/service/auth_service.go:63`.

Do: one shared in-flight refresh, cross-tab coordination and tests for simultaneous 401 responses and lost refresh responses. Keep genuine replay protection. Current additional API error diagnostics do not fix rotation races.

### R6 — High: margin estimates have multiple sources of truth

Evidence: `frontend/src/components/trading/FnoOrderModal.tsx:107` (including 18% overnight formula); `backend/internal/ai/service/mentor.go:129`; `backend/internal/product/rules.go`.

Do: server-side order preview sharing validation/margin calculations with execution. Include quote timestamp and unavailable reasons; validate both short options and futures, not only option purchases.

### R7 — High: news and market provenance remain misleading

Evidence: `backend/internal/news/service/news.go:67`, `:81`; `backend/internal/market/service/redis.go:586`; `backend/internal/market/websocket/handler.go:308`.

Do: demo-only news fixtures; real publication timestamps; ingestion health; source/mode metadata on candles; mode-switch cache policy; quote eligibility checks on streamed messages. Test synthetic → LIVE mode transition and a stopped news worker.

### R8 — Medium: migration, readiness and AI completion gaps

Evidence: `backend/internal/app/app.go:80`, `:99`; `backend/internal/handler/health_handler.go`; `backend/internal/ai/service/mentor.go:603`.

Do: ordered schema migrations with upgrade tests, explicit dependency/feed status, bounded server timeouts, and truthful AI context/source metadata. Do not infer release readiness from the new index commit alone.

### R9 — Medium: test tooling overstates isolation/reproducibility

Evidence: `frontend/package.json:10`; `backend/internal/testutil/disposable.go:27`; `scripts/run-disposable-tests.sh`.

Frontend tests depend on an unpinned runtime download of `tsx`. The disposable DB validator compares raw URL strings and blocks selected hosts/names; it does not establish that an arbitrary allowed server is disposable. The shell runner accepts an inherited test URL and prints it in full, potentially including credentials. It creates PostgreSQL only, despite describing a PostgreSQL/Redis environment.

Do: declare/lock the test runner; redact URLs; default to newly provisioned isolated services; require explicit opt-in for externally provided targets; canonicalize connection identity; start Redis when required; report skips distinctly. In this review, inherited URLs were explicitly removed before running the script.

## Next move

1. **Finish order lifecycle correctness:** fix R1 first with the failing reproduction, then durable idempotency/position binding from R2. Add the missing cases to the disposable suite.
2. **Fix account/data truthfulness:** R4 and R6 together; authoritative balance, daily P&L and margin preview. Fix refresh coordination alongside the shared API client (R5).
3. **Complete expiry/feed lifecycle:** R3 and R7; persist settlement data, enforce provenance and test worker outages/mode changes.
4. **Make verification reproducible:** R9, migration upgrade tests, readiness and explicit AI degraded states (R8). Add browser flows for the originally reported search, order and exit failures.
5. **Run a release check:** disposable integration + race checks, pinned frontend tests/lint/types/build, worker tests and real-provider/browser smoke tests. Run the reconciliation report read-only on existing accounts before proposing any historical repairs.

The recommended immediate batch is **R1 plus R2**, followed by the wallet/P&L/margin UI work. Historical account records should remain unchanged until a concrete reconciliation report identifies what needs repair.
