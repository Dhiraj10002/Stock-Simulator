# Accounting corrections — 2026-09-29

This batch fixes three defects without modifying historical account records:

- Futures expiry calculates signed P&L before deriving cash movement, so short
  profits credit cash and short losses debit it. Options retain premium/intrinsic
  settlement behavior.
- Delivery execution selects positions by user, symbol **and product**; newly
  created delivery positions explicitly record that product.
- Margin-product execution uses the slippage-adjusted fill for position entry
  cost, realized P&L, trade price/total, recorded order price and execution logging.
  Margin is recalculated from the resulting entry price.

## Regression coverage

`backend/internal/order/service/accounting_regression_test.go` exercises the real
transaction functions against PostgreSQL. It requires an explicit
`TEST_DATABASE_URL`; use a disposable database only.

Cases cover long/short futures and options at expiry, positive/negative P&L,
settlement retry, same-symbol delivery/intraday isolation, delivery partial sale,
and long/short intraday/futures/options round trips with nonzero slippage.
Assertions reconcile trade totals, order prices, position cost, realized P&L,
wallet movements, released margin and ledger entries. The existing intraday
reversal integration test now expects the actual slippage-adjusted fills.

The new tests reproduced the pre-fix futures cash, product-mixing and margin-fill
inconsistencies. Following the fixes the order-service suite passed against a
fresh disposable PostgreSQL 16 container, with no host data mounts. No live broker
or account database was used. Tests requiring other services retain their existing
skip conditions; this is not a full browser/provider end-to-end test.

## Remaining work

Stop-trigger enforcement and reduce-only/idempotent exits are the next batch.
Expiry parsing, durable settlement references, historical-data repair and UI data
accuracy remain separate tasks. These fixes affect future executions; existing
incorrect records require a read-only reconciliation report before any repair.
