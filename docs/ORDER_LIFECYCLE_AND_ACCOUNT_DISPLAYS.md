# Order lifecycle and account display fixes

Implemented 2026-09-30.

## Stop activation

A triggered SL/SL-M order commits its transition from `TRIGGER_PENDING` to `OPEN` independently of settlement. An out-of-limit quote or failed settlement cannot roll back activation. Both direct execution and quote matching refresh the active-order cache. An activated stop-limit remains eligible when price later retraces inside its limit, without requiring another trigger crossing.

## Durable exits

`POST /api/v1/portfolio/positions/{uuid}/squareoff` requires an `Idempotency-Key` header (1–128 characters). The browser retains the same key in session storage through failed requests and page reloads. A terminal response completes that browser attempt; a subsequent deliberate exit receives a new key.

The server stores the key, position UUID and position revision on an order under the wallet/position locks. Retrying an existing key returns the original order, including after the position closes or reopens. Reusing the key for another position returns 409. A pending exit cancels if the position revision changes before execution. An exit created during a quote outage remains pending and can recover through quote matching or a request retry. New exit intents retain the new-order session check.

Order-history clearing and automatic history hiding now hide terminal orders rather than deleting orders or trades. This retains retry identity and financial history. Previously deleted records are not reconstructed.

Backend startup performs an additive Order migration for the nullable exit fields, history visibility field, and unique `(user_uuid, exit_key)` index. Migration failure stops startup. Restart the backend before using the updated frontend. Other square-off API clients must also send the header.

## Account displays

- Wallet displays use an authenticated shared wallet query. Failed/missing responses display `Unavailable`; a valid zero balance remains zero.
- Stock and F&O tickets obtain required additional funds and available balance from `POST /api/v1/orders/preview`. Preview validates without creating an order or reserving funds. Submission revalidates; preview is an estimate, not a price guarantee.
- Margin allocation uses actual position blocked margin instead of fixed percentages.
- Missing/stale quotes suppress affected portfolio valuation and return totals.
- Gross position value is labeled separately from cash; derivative notional is not presented as account equity.
- Invented daily returns and synthetic equity curves were removed. `daily_pnl_paise` is now nullable and returns null until a trustworthy session baseline is implemented. Daily P&L and the equity curve display unavailable.

## Verification

- Go order/portfolio tests and vet passed.
- Disposable PostgreSQL regressions passed for stop activation, concurrent duplicate exits, retries after reopen/history clear, changed-position cancellation, configured preview margins, accounting, and reports.
- Added matcher-specific tests for stop-limit retracement and exit recovery when quotes return.
- Frontend tests: 48 passed. ESLint and TypeScript checks passed.

No live broker execution or manual browser session was used for this verification. No existing account balances, positions, or credentials were edited.
