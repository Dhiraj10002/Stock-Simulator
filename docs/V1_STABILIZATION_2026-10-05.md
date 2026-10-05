# V1 trading and data-state stabilization

Based on upstream `main` commit `0b34a1ac84f1992a0ba0dbe4a2b4f5b8e4cc274f`.

## Changes

| Reported issue | Resolution |
| --- | --- |
| Instrument cache survives retirement/token updates | Trading lookups read the authoritative database each time, including aliases. Database failures propagate; a populated master cannot fall back to a removed built-in symbol. Returned objects are independent. |
| NFO close disagrees with expiry/retirement/settlement | Expiry and retirement use the segment calendar. NFO closing-window references and worker archiving use 15:39–15:40 after the 3 August 2026 schedule change; historical NFO dates retain 15:30. The closing instant rejects new orders and is the expiry boundary. |
| Legacy BSE/BFO rows can open trades | Shared opening policy enforces NSE equities/NFO derivatives and active/tradable flags, independent of snapshot version. Creation, previews and execution recheck policy. Managed exits retain their existing quantity, ownership, quote and accounting checks. |
| Stocks portfolio retains expired access token | Stocks uses the reactive auth-token hook and shared API client with refresh/retry. Query caches are token-scoped; failed refreshes retain the same account's last successful portfolio without carrying it across token/account changes. |
| Formatting and smoke-test CI failures | Both previously unformatted Go test files are formatted. Smoke acceptance tests cover an eligible 15:35 NFO contract and its 15:40 expiry. |
| Activation makes benchmarks tradable | Activation and DTO conversion keep benchmarks view-only. Explicit transactional updates prevent GORM's `default:true` from turning false benchmark/expired flags back on. Worker ingestion includes active benchmark indices so quotes remain available. |
| Unavailable values appear as zero | Initial portfolio loading/failure is distinct from empty holdings. Degraded P&L is unavailable; prior successful values after refresh failure are labelled last available. Stocks cards, index tickers and sector calculations respect day-movement availability. Missing day ranges remain unavailable. |

## Regression coverage

- SQLite-backed instrument alias/token/retirement changes, caller mutation and database outage.
- Complete master activation repeated with NSE/BSE benchmarks and NSE equity.
- Legacy exchange and retired-instrument order/preview rejection.
- NFO 15:30/15:35/15:39/15:40 session and expiry agreement; separate cash and derivative reference windows.
- Worker NFO closing-window archiving, historical schedule and benchmark-ingestion query.
- Browser scenarios for auth renewal followed by polling, failed refresh retention/retry, initial portfolio failure, degraded P&L and unknown day movement with a genuine quoted price.

Run the existing CI workflow, including its disposable PostgreSQL/Redis integration suite and accounting race checks, before merging. Local runs without these services do not establish database integration acceptance.

## Scope and rollout

Restart the backend and market worker after deployment. The frontend changes use the existing auth and quote APIs. No financial records are deleted and no schema migration is introduced.

The reference is a **paper-settlement closing-window proxy**, not an official settlement price. This change aligns NFO lifecycle timing; it does not implement the separate cash closing-auction matching/eligibility model. Live Angel One acceptance still requires the configured host and a dedicated paper account during an open market session.

Calendar source: [NSE closing auction/session schedule](https://www.nseindia.com/static/products-services/closing-auction-session), [NSE/FAOP/75472](https://nsearchives.nseindia.com/content/circulars/FAOP75472.pdf).
