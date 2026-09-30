#!/usr/bin/env bash
set -euo pipefail

# Run backend accounting regressions against a disposable PostgreSQL/Redis environment.
# Guarantees that production and application account databases cannot be touched.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

CLEANUP_CONTAINER=0
REDIS_CONTAINER=""
CONTAINER_NAME="stock-sim-disposable-$(date +%s)-$RANDOM"

cleanup() {
  if [ -n "${REDIS_CONTAINER}" ]; then docker rm -f "${REDIS_CONTAINER}" >/dev/null 2>&1 || true; fi
  if [ "${CLEANUP_CONTAINER}" -eq 1 ]; then
    echo "Tearing down disposable test container ${CONTAINER_NAME}..."
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo "Spawning ephemeral disposable PostgreSQL container..."
  PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')
  docker run -d --name "${CONTAINER_NAME}" \
    -e POSTGRES_PASSWORD=disposable-test-password \
    -e POSTGRES_DB=stock_sim_test \
    -p "127.0.0.1:${PORT}:5432" \
    postgres:16-alpine >/dev/null

  CLEANUP_CONTAINER=1

  # Wait for postgres to be ready
  for i in {1..30}; do
    if docker exec "${CONTAINER_NAME}" pg_isready -U postgres -d stock_sim_test >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  export TEST_DATABASE_URL="postgresql://postgres:disposable-test-password@127.0.0.1:${PORT}/stock_sim_test?sslmode=disable"
fi

if [ -z "${TEST_REDIS_URL:-}" ]; then
  REDIS_CONTAINER="${CONTAINER_NAME}-redis"
  docker run -d --name "${REDIS_CONTAINER}" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
  REDIS_PORT=$(docker port "${REDIS_CONTAINER}" 6379/tcp | cut -d: -f2)
  export TEST_REDIS_URL="redis://127.0.0.1:${REDIS_PORT}/0"
fi
echo "Running tests against isolated test services (connection details omitted)"
cd "${BACKEND_DIR}"
go test -v ./internal/testutil/...
go test -v -run "TestAccounting|TestRegression|TestReconciliation" ./internal/order/service/...
go test -v ./internal/reports/service/...
go test -v ./internal/auth/... ./internal/news/... ./internal/market/... ./internal/wallet/...
go test -v ./internal/ai/...
echo "All disposable regressions passed successfully!"
