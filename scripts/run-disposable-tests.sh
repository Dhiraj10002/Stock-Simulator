#!/usr/bin/env bash
set -euo pipefail

# Run backend accounting regressions against a disposable PostgreSQL/Redis environment.
# Guarantees that production and application account databases cannot be touched.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

CLEANUP_CONTAINER=0
CONTAINER_NAME="stock-sim-disposable-$(date +%s)-$RANDOM"

cleanup() {
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

echo "Running tests with TEST_DATABASE_URL: ${TEST_DATABASE_URL}"
cd "${BACKEND_DIR}"
go test -v ./internal/testutil/...
go test -v -run "TestAccounting|TestRegression" ./internal/order/service/...
echo "All disposable regressions passed successfully!"
