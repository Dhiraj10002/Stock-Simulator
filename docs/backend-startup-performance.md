# Backend startup and database performance

The October 6 development logs showed roughly 56 seconds of schema verification,
a 6.25-second preload of 44,468 instrument symbols, and database pings of
762–1,424 ms. Those are observations from the user's Fedora environment, not
measurements of this branch. The local comparisons below isolate the code changes.
The homepage and trading screen design are unchanged.

## What changed

- Startup records schema versions in `app_schema_migrations`. An already-current
  installation can adopt the ledger without GORM model introspection. Legacy
  schemas still receive the existing instrument duplicate archive/quarantine,
  token-index repair and daily-snapshot epoch upgrade before model migration.
- Migration DDL and its version record commit atomically under the same advisory
  lock used by master activation. Concurrent API starts recheck the version after
  acquiring the lock. Required index errors now fail startup instead of being ignored.
- A normal restart performs three read-only queries: ledger existence, latest
  version and bulk schema validation. The last query checks model columns,
  required nullability, integer-paise storage, primary/unique indexes (including
  exit idempotency) and the nonunique instrument token index. A newer schema
  version is rejected by an older binary.
- Performance indexes are created together in one SQL batch during migration or
  explicit repair. They are not recreated on every normal restart.
- Router construction no longer loads the entire instrument universe. Quote and
  history existence checks resolve requested symbols with an indexed query,
  deduplicate concurrent requests and cache results for 30 seconds, with at most
  2,048 entries. Database errors are not cached as absence. This display cache
  does not authorize orders or cache executable tokens/prices.
- Readiness selects only active snapshot versions (at most two, so duplicate
  activation still fails). Snapshot metadata/list endpoints omit the private
  master payload. Activation and canonical identity verification still read the
  payload where it is required.
- Logs report database connection, schema verification, router initialization,
  total API startup, worker master load and broker login attempt durations.
  Worker progress stages are `LOADING_MASTER`, `CONNECTING`, `RUNNING` and
  `UNAVAILABLE`; the actual feed state remains separately reported.
- The worker publishes its version immediately after master loading and on
  connection progress, instead of waiting for the next 20-second heartbeat.
  Readiness still checks the master version and feed state using the existing rules.
- Database readiness exposes cumulative pool wait count/time and maximum pool
  size. A single idle-pool snapshot alone cannot rule out earlier contention.

## Repeatable comparison

Environment: local disposable PostgreSQL 16.15, Go 1.25.8, Linux amd64,
AMD EPYC 9V74. Three repetitions, three operations per benchmark, same database
and fixtures for both paths. Values are the medians of the three reported results.
These are small component comparisons, not a production load test or a claim
that the user's remote database latency has improved.

| Component | Previous path | New path |
| --- | ---: | ---: |
| Warm schema preparation | 34.81 ms, 188 SQL calls | 3.49 ms, 3 SQL calls |
| Finder construction with 44,500 instruments | 35.65 ms, ~17.7 MB allocated | 0.018 ms, ~7.7 KB allocated |
| Snapshot read with a 20 MiB fixture payload | 40.14 ms | 0.185 ms |

Finder construction now performs zero database reads. A first request for a
nondefault symbol pays for one bounded existence query; warm requests use the
cache. The metadata fixture uses a synthetic payload to demonstrate avoided
transfer/allocation; it is not the user's master payload.

[Raw benchmark output](performance/backend-startup-benchmarks.txt)

Reproduce against an explicitly disposable database:

```bash
cd backend
TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/testdb?sslmode=disable' \
  go test -run '^$' \
  -bench 'BenchmarkWarmSchemaStartup|BenchmarkMasterMetadataProjection|BenchmarkInstrumentFinderBootstrap' \
  -benchtime=3x -count=3 ./internal/app ./internal/router
```

Benchmarks reject known production database targets and use temporary schemas
inside transactions that are rolled back. CI runs the comparison and uploads
`backend-performance-measurements` with benchmark output and a database profile.

## Diagnose the actual database connection

From `backend`, the command reads the existing `.env` without printing its URL
or credentials. It reports initial connection time and warm ping/`SELECT 1`
round-trip distributions. Five samples are a quick diagnostic, not an SLO estimate.
The profiler uses IPv4 dialing, matching the API transport policy.

```bash
go run ./cmd/profile-db -samples 5
go run ./cmd/profile-db -samples 5 -plans
```

`-plans` runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` only for fixed SELECT
queries, in a read-only transaction. It reports master-refresh metadata,
instrument existence and pending intraday-order plans. It never applies migrations
or performs order/wallet writes.

If warm ping and `SELECT 1` are both high, investigate connection/network/service
latency before changing indexes. Compare those round trips with execution time
in the plans to determine whether query work is also material. Pool wait values
are cumulative since process start; compare their changes across requests.

## Migration operation and future changes

First startup on an older installation may still take longer while pending
upgrades run. After the ledger is adopted, leave `RUN_MIGRATION` unset or false
for the fast restart path. `RUN_MIGRATION=true` explicitly runs full schema
repair/index checks and retains the previous slower behavior. A validation
failure prevents the HTTP server from starting; repair its reported schema issue
before proceeding. Invalid legacy financial data is not silently replaced.

When models or indexes change, append a new entry to `schemaMigrations` and
advance `currentSchemaVersion`. Keep applied entries immutable and provide a
migration for existing installations. Test new installation, old-schema upgrade,
rollback, concurrent starts and the three-read warm path. Editing a model alone
will cause schema validation to reject missing required objects.

## Validation and remaining environment checks

Local validation covers the full Go integration suite against disposable
PostgreSQL/Redis, race checks for app/router/order accounting, worker tests,
launcher cleanup tests, and the benchmark comparisons. Regression cases cover
legacy token reuse and duplicate archiving, preserved daily baselines/reset epochs,
unchanged wallet balances, failed migration rollback, missing exit uniqueness,
invalid money types, and request-time lookup recovery after database failure.

Actual remote database and API latency must be measured again on Fedora after
checking out this branch. In an open-market session, confirm matching master
versions, fresh ticks and delivery/intraday/futures/options entry and exit with
wallet/P&L updates. Broker credentials and the user's live machine are not
available in this execution environment. Production-host mobile performance and
field interaction metrics remain separate deployment acceptance checks.
