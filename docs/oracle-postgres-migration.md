# Oracle PostgreSQL migration: stage first, switch only after verification

The current VM has one visible CPU, 5.8 GiB RAM (4.4 GiB available in the supplied
idle snapshot), and 33 GiB free root disk. This supports a staging trial, not a
claim of peak capacity. Keep Neon until the entire migration is verified.

## What the tooling does

`deploy/oracle/docker-compose.postgres.yml` is an opt-in overlay. It adds PostgreSQL
18 on the private `stock_sim_net`, without publishing 5432 or changing backend or
worker `DATABASE_URL` values. A named volume mounts `/var/lib/postgresql`, the
correct parent of PostgreSQL 18's version-specific data directory. The initial
budget is 1 GiB container memory, 128 MiB shared buffers, 4 MiB work memory,
40 connections and no parallel query workers. Reassess during actual market load.
It does not impose an aggressive CPU cap on order execution's database.

The application role `stocksim` is not a superuser and cannot create roles or
databases. A separate random admin password is generated on the VM. Both passwords
remain in mode-0600 `.env.oracle-db`; do not regenerate this file for an existing
volume. The existing app pool allows 25 connections, leaving headroom under the
40-connection database cap for the two worker paths, backups and administration.

`scripts/oracle_postgres.py stage`:

1. Reads the source DSN privately through Compose. If a running backend uses a
   different DSN, aborts. Never prints rendered config, credentials or account rows.
2. Starts only the new PostgreSQL service. Other production containers stay running.
3. Requires PostgreSQL 18 at source and checks extension availability. Preserves
   database encoding and libc/builtin locale; compares collation versions. ICU
   rules, unavailable locales/extensions, or non-public application tables require
   review, not silent omission or a change to text sort/uniqueness semantics.
4. Holds a read-only repeatable-read transaction and exports its snapshot. Both
   all-public-table fingerprints and `pg_dump` use that SAME snapshot, so production
   can continue writing during staging without causing false comparisons.
5. Restores into a unique NEW database. Never uses `DROP`, `--clean` or an existing
   target. Compares all public table counts/content, indexes, constraints and
   extension versions. Checks sequence ID safety and application-role read access.
6. Saves a private custom-format dump, checksum, manifest and verification report in
   `backups/stocksim_backup_*`. They contain sensitive application data; never commit,
   publish, upload to CI artifacts, or paste dumps into chat.

PostgreSQL sequences are not MVCC data: their exact values may advance during a
live staging dump. The check verifies restored owned sequences cannot collide
with restored IDs rather than claiming their values came from the table snapshot.

## Run staging on the existing Oracle VM

Use your existing SSH session (`ubuntu@stock-market-worker`). No private key or
database password needs to be sent to an assistant.

```bash
cd ~/stock-simulator-prod
git status --short
git fetch origin
git switch codex/oracle-postgres-migration
python3 scripts/oracle_postgres.py --sudo-docker prepare
python3 scripts/oracle_postgres.py --sudo-docker stage
```

Resolve tracked worktree changes before switching; do not discard local work.
Git may set up the branch from its matching remote automatically. The tool assumes
the existing production project directory and `.env` have not moved. Do not run
from a second checkout with a different Compose project name against the live VM.
`--sudo-docker` executes Docker via sudo while keeping generated files owned by
the current user. Omit it if Docker already works without sudo. If production uses
an alternate env file, pass its path with `--env-file` BEFORE the subcommand.

A failed stage never switches production; retain the candidate/bundle to diagnose.
There is intentionally no automatic cleanup of candidate databases or backups.
Budget disk space and remove obsolete candidates only after confirming they are
not used by the runtime DSN and an independent backup is recoverable. Do not use
`docker compose down --volumes` on production.

## Independent off-VM restore

Use the exact bundle path printed by `stage`. On Fedora, from a checkout containing
these scripts (Docker required):

```bash
mkdir -p backups/oracle
chmod 700 backups backups/oracle
scp -r ubuntu@129.154.241.137:~/stock-simulator-prod/backups/PRINTED_BUNDLE_NAME backups/oracle/
python3 scripts/verify_backup_restore.py backups/oracle/PRINTED_BUNDLE_NAME/source.dump \
  --postgres-major 18 --manifest backups/oracle/PRINTED_BUNDLE_NAME/manifest.json
```

The verifier uses a NEW disposable PostgreSQL container with `--network none`,
compares the full migration manifest and checks owned sequences. It does not
connect to production or the source database. Require `all_public_tables_match`
and `source_fingerprint_matches` to be true (the latter covers either a legacy
fingerprint or the full manifest). Keep the dump plus manifest somewhere outside
the Oracle VM, with access controls. An on-VM dump by itself is not disaster recovery.

On Fedora, the verifier copies the dump into the disposable container rather than
bind-mounting a home-directory file. This avoids SELinux file-label restrictions
without disabling SELinux or changing the backup's labels. Images are explicitly
qualified with `docker.io/library/` for Docker-compatible runtime name resolution.
If verification fails, share only its JSON `stage`/`code`/`exit_code`. For example,
`container_start/docker_unavailable` means Docker startup failed; it is not evidence
of a bad database backup. No raw SQL errors or account rows are emitted.

## Database profiling and application acceptance

After staging prints a successful result, generate a separate candidate env:

```bash
python3 scripts/oracle_postgres.py --sudo-docker candidate-env \
  backups/PRINTED_BUNDLE_NAME --output .env.oracle-candidate
```

This is a config EXPORT, not a production switch. It preserves application settings,
replaces only the DSN and adds `ORACLE_POSTGRES_ENABLED=true`. It refuses overwrite.
Do not start production services with this old staging snapshot.

Use the existing backend image's read-only profiler, with the explicit candidate env:

```bash
sudo docker compose --env-file .env.oracle-candidate --env-file .env.oracle-db \
  --profile oracle-db -f docker-compose.prod.yml -f deploy/oracle/docker-compose.postgres.yml \
  run --rm --no-deps --entrypoint /profile-db backend -samples 20 -plans
sudo docker stats --no-stream
```

Run equivalent source profiles with `.env` and the base Compose file, keeping
sample count and conditions the same. Record warm/cold connection and SELECT 1
latency, query plans, CPU, available memory and disk. Repeat during an actual
market session while the existing production feed is active. Low off-hours CPU
does not prove a single CPU can handle peak feed, imports, analytics and queries.

CI runs existing accounting/order/race suites against both PostgreSQL 16 and 18.
Its separate PG18 migration smoke covers concurrent source writes, persistence
across restart, an independent restore and rejection of altered wallet content.
These are disposable fixtures, not proof about live wallets or broker execution.

Before promotion, separately verify Delivery, Intraday, F&O, cancellation, duplicate
intents, exits, wallet/position/ledger reconciliation, expiry and restart recovery
in an isolated application staging environment. That stack MUST have its own Redis
and broker session configuration. The `stage` command does not create it or contact
the broker. Never run destructive Go integration tests against restored user data.

## Controlled production cutover (operator-run; NOT part of stage)

Do this only after PG18 CI, live-session load/application acceptance and an off-VM
restore pass. Avoid exchange close/expiry/square-off windows. Book a maintenance
window; there will be downtime with this single VM. Do not change database and
application version simultaneously. Preserve the current backend/worker images.

1. Stop the monitor timer AND an already-running monitor service, so automatic
   recovery cannot restart a worker. Stop ALL writers to Neon: backend, market
   worker/settlement archive, news worker, operator scripts, local development and
   external clients. A read-only frontend alone is insufficient.

   ```bash
   sudo systemctl stop stocksim-monitor.timer stocksim-monitor.service
   sudo docker compose -f docker-compose.prod.yml stop backend market-worker news-worker
   ```

2. With `.env` still pointing to Neon, run `stage` AGAIN for a final consistent dump
   and new candidate. Keep writers stopped throughout. Use this NEW bundle for all
   remaining steps; the earlier staging dump is obsolete.
3. Copy and restore-verify that final bundle off the VM. Run `verify` and
   `validate-source` against the final bundle. The latter detects changes since
   the snapshot; it does NOT lock out future writes. Confirm all writers remain
   stopped. Resolve any mismatch before proceeding.
4. Export a NEW runtime env via `candidate-env FINAL_BUNDLE --output .env.oracle-runtime`.
   Keep a mode-0600 copy of the original `.env` outside Git as the Neon fallback.
   Retain `.env.oracle-db` securely too; it is required to start the existing volume.
5. Replace the root `.env` atomically with the reviewed runtime env. Start the local
   DB and recreate the existing app containers with the overlay and `--no-build`
   (do not rebuild application images during a database cutover):

   ```bash
   sudo docker compose --env-file .env --env-file .env.oracle-db --profile oracle-db \
     -f docker-compose.prod.yml -f deploy/oracle/docker-compose.postgres.yml \
     up -d --no-build --wait postgres redis backend caddy
   sudo docker compose --env-file .env --env-file .env.oracle-db --profile oracle-db \
     -f docker-compose.prod.yml -f deploy/oracle/docker-compose.postgres.yml \
     up -d --no-build --wait market-worker news-worker
   ```

6. Check HTTPS/WSS, DB/application-role access, activated master/worker agreement,
   real feed state, pending jobs, wallet/position/ledger consistency and actual
   paper-order idempotency. A closed-session readiness response is not open-market
   acceptance. Only resume the monitor once readiness is correct.
7. Future normal releases use `bootstrap_production.py`. The marker in `.env`
   automatically includes/starts the local database first. Keep the overlay in all
   explicit Compose commands. Never run `--sync-master` merely to make readiness green.

Before the target accepts ANY new writes, a rollback can stop all writers and
restore the original Neon env/images. AFTER the target accepts writes, Neon is
stale: DO NOT simply point back. Freeze writes and perform a new reverse dump,
restore and reconciliation into a fresh target. Keep both databases and backups;
never merge financial ledgers ad hoc. Record the exact cutover/recovery point.

## Backups after promotion

With root `.env` now pointing to the migrated local DB:

```bash
python3 scripts/oracle_postgres.py --sudo-docker backup
```

This uses the same consistent snapshot/fingerprint protocol without stopping
writers and does NOT claim an independent restore or off-VM copy succeeded.
Copy each chosen bundle off VM and run the verifier as above. Set a retention
policy only after an off-VM destination and restore process are configured. Until
an operator has enabled scheduling/off-VM transfer, these backups are MANUAL.
No backup automation, public PostgreSQL port or production switch is installed
by `prepare`, `stage`, `candidate-env` or this PR.

Reference behavior: [PostgreSQL pg_dump snapshots](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html), and the
[official PostgreSQL Docker image](https://hub.docker.com/_/postgres).
