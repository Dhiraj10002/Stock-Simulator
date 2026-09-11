# Redis cache policy

Redis is used only for temporary market/news data, live Pub/Sub, and request
rate-limit counters. PostgreSQL remains the source of truth for accounts,
wallets, orders, positions, trades, and audit history.

| Key family | TTL | Maximum retained | Purpose |
|---|---:|---:|---|
| `market:quote:<SYMBOL>` | 5 minutes | one value per symbol | Latest simulated quote |
| `market:history:<SYMBOL>` | 24 hours | 500 candles | Chart history |
| `news:items` | 7 days | 200 articles | Temporary news feed |
| `news:seen:<URL>` | 7 days | one per URL | News de-duplication |
| `rate_limit:<scope>:<client>` | configured window (1 minute by default) | one counter per client/scope/window | Abuse protection |

The worker TTLs and list limits are environment-configurable. Every cache key
has an expiry so it cannot become permanent business state or grow without
bound.

## Upstash production configuration

Set `REDIS_URL` to the TLS TCP URL copied from Upstash, for example
`rediss://:password@host:port/0`; never commit it. The Go and Python Redis
clients both accept `rediss://`. Keep Upstash eviction enabled for this
cache-oriented database: keys with TTLs are preferential candidates for
eviction. A Redis outage returns HTTP 503 for market/news reads and prevents
rate-limited sensitive writes, rather than returning misleading stale data.
