# Deployment decision

Use the Oracle Cloud VM for the backend, Python workers, and PostgreSQL. Use
Upstash only for Redis (`REDIS_URL=rediss://:token@host:6379`); it supports the
project's Redis TCP client and Pub/Sub usage.

The displayed VM currently has no public IP. Attach a reserved public IPv4 or
place an OCI load balancer in front of it before publishing the service. Allow
only TCP 80/443 publicly; restrict TCP 22 to your own IP. Terminate TLS at
Caddy or Nginx and keep Docker ports other than the reverse proxy private.

Before deployment set a strong `JWT_SECRET`, production `DATABASE_URL`,
`REDIS_URL`, CORS origin, and Angel One/Gemini credentials as server-side
environment variables. Do not commit them.
