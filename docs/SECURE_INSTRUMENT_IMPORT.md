# Secure instrument import and configuration

Instrument synchronization is an operator-only CLI operation. The HTTP endpoint
`POST /api/v1/instruments/sync` has been removed, including from OpenAPI. Account
JWTs do not grant permission to replace the instrument master.

From `backend/`, with the intended database configuration loaded:

```sh
go run ./cmd/sync-instruments
# Or use a reviewed, locally saved master:
go run ./cmd/sync-instruments -source /absolute/path/OpenAPIScripMaster.json
```

These commands write instrument records. Review the target database and source
before running them. The default remote source is the exact official HTTPS URL
compiled into the service. Other remote URLs, URL parameters, alternative schemes
and redirects are rejected. Update the allowlist in code if the provider moves.
Downloads and local files are capped at 128 MiB and fully read into a private
temporary file before import. Temporary files are removed on normal completion
or error. Network reads have a 90-second client timeout; the CLI has a 15-minute
context deadline. Local file access requires operator filesystem permissions.

This change removes public import authority; it does not implement versioned
master snapshots or atomic activation of a complete import. Existing batch-upsert
semantics remain: a parsing/database failure during import can leave earlier
batches applied. Keep a database backup before operator imports until staged
activation and rollback are implemented in the instrument-lifecycle phase.

## Signing secrets

`JWT_SECRET` is required in every environment. Startup rejects values shorter
than 32 bytes, known placeholder patterns, repeated single-character values and
surrounding whitespace. These checks cannot prove randomness: generate 32 random
bytes encoded as hex with `openssl rand -hex 32`, and store the result only in the
ignored environment file or deployment secret store. Never commit it or paste it
into logs. The example environment intentionally contains a rejected placeholder.

Changing the signing secret invalidates existing access and refresh tokens after
restart. Users must sign in again. Set the same new secret on all backend replicas;
do not generate a new value on every startup. Local `.env` changes do not update
production secrets.

Rate limiting now defaults to enabled when `RATE_LIMIT_ENABLED` is absent. An
explicit `false` remains available for controlled local tests. Ensure Redis is
configured and healthy; this change does not add quotas to public market reads.

## Verification

Regression tests cover unsafe startup secrets, removal of the import HTTP route,
untrusted source rejection, redirects, failed reads and reviewed local imports.
Run the config/instrument tests and the focused router regression without a broker
connection or application database. Provider download availability and real database
imports must be checked separately in the intended operational environment.
