#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT_DIR"

MODE="${1:-full}"

# -------------------------------------------------------------
# 0. Check for Frontend-Only flag
# -------------------------------------------------------------
if [ "$MODE" = "--frontend-only" ] || [ "$MODE" = "-f" ] || [ "$MODE" = "frontend" ]; then
  echo "========================================================="
  echo "   Stock Simulator — Frontend Only Mode (Lightweight)    "
  echo "========================================================="
  echo "[-] Freeing port 3000..."
  if fuser 3000/tcp >/dev/null 2>&1; then
    echo "[!] Port 3000 is in use. Stop the existing frontend before restarting." >&2
    exit 1
  fi
  echo "[✓] Launching Next.js on http://localhost:3000..."
  echo "     (Zero CPU overhead from Go, Docker, or Python)"
  echo "========================================================="
  cd "$ROOT_DIR/frontend"
  PORT=3000 npm run dev
  exit 0
fi

# -------------------------------------------------------------
# Help text
# -------------------------------------------------------------
if [ "$MODE" = "--help" ] || [ "$MODE" = "-h" ]; then
  echo "Usage: ./start-dev.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -f, --frontend-only   Run only Next.js frontend (Super light, saves CPU/battery)"
  echo "  -l, --light           Run Go Backend + Frontend only (No heavy Python workers or Docker)"
  echo "  -h, --help            Show this help menu"
  echo "  (default)             Run full platform services (Go + Redis + 2 Python Workers + Next.js)"
  exit 0
fi
if [[ "$MODE" != full && "$MODE" != --light && "$MODE" != -l ]]; then
  echo "[!] Unknown option: $MODE. Use --help for supported modes." >&2
  exit 1
fi

echo "========================================================="
echo "   Stock Simulator — Starting Platform Services          "
if [ "$MODE" = "--light" ] || [ "$MODE" = "-l" ]; then
  echo "   Mode: LIGHT (Go Backend + Next.js Frontend)          "
else
  echo "   Mode: FULL (Docker + Go + Python Workers + Frontend) "
  echo "   TIP: If your laptop gets hot, use:                   "
  echo "        ./start-dev.sh --frontend-only                   "
  echo "        OR ./start-frontend.sh                           "
fi
echo "========================================================="

# Fail before starting services when required tools or ports are unavailable.
for command in go npm python3 curl setsid fuser; do
  command -v "$command" >/dev/null || { echo "[!] Required command missing: $command" >&2; exit 1; }
done
for port in 8080 8085 3000; do
  if fuser "$port/tcp" >/dev/null 2>&1; then
    echo "[!] Port $port is in use. Stop the existing service before restarting." >&2
    exit 1
  fi
done

# 2. Load backend environment variables safely
if [ -f "$ROOT_DIR/backend/.env" ]; then
  echo "[-] Loading backend environment variables from backend/.env..."
  set -a
  while IFS= read -r line || [ -n "$line" ]; do
    line=$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      key="${line%%=*}"
      val="${line#*=}"
      val="${val%\"}"
      val="${val#\"}"
      val="${val%\'}"
      val="${val#\'}"
      if [ "$key" != "PORT" ]; then
        export "$key"="$val"
      fi
    fi
  done < "$ROOT_DIR/backend/.env"
  set +a
fi

export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"

# Own every child process group; cleanup must never signal the caller's shell.
STARTED_REDIS=0
PIDS=()
cleanup() {
  local result=$?
  trap - EXIT INT TERM
  for pid in "${PIDS[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || true; done
  for _ in {1..100}; do
    local alive=0
    for pid in "${PIDS[@]}"; do
      if kill -0 -- "-$pid" 2>/dev/null; then alive=1; fi
    done
    [ "$alive" = 0 ] && break
    sleep 0.1
  done
  for pid in "${PIDS[@]}"; do kill -KILL -- "-$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  if [ "$STARTED_REDIS" = 1 ]; then
    docker rm -f stock-sim-redis >/dev/null 2>&1 || true
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

start_service() {
  local directory=$1
  shift
  setsid bash -c 'cd "$1"; shift; exec "$@"' _ "$directory" "$@" &
  SERVICE_PID=$!
  PIDS+=("$SERVICE_PID")
}

wait_for_service() {
  local url=$1 pid=$2 name=$3
  local deadline=$((SECONDS + STARTUP_TIMEOUT_SECONDS))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[!] $name exited before it became available. Check the service output above." >&2
      return 1
    fi
    for child in "${PIDS[@]}"; do
      if ! kill -0 "$child" 2>/dev/null; then
        echo "[!] A platform service exited during startup. Check its output above." >&2
        return 1
      fi
    done
    if curl --fail --silent --connect-timeout 1 --max-time 3 "$url" >/dev/null 2>&1; then
      echo "[✓] $name is available."
      return 0
    fi
    sleep 0.5
  done
  echo "[!] $name did not become available within ${STARTUP_TIMEOUT_SECONDS}s. Frontend startup aborted." >&2
  return 1
}

STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-180}"
if ! [[ "$STARTUP_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || [ "$STARTUP_TIMEOUT_SECONDS" -gt 900 ]; then
  echo "[!] STARTUP_TIMEOUT_SECONDS must be a whole number between 1 and 900." >&2
  exit 1
fi

# Auto-start Redis only for the default local configuration.
if [ "$MODE" != "--light" ] && [ "$MODE" != "-l" ] && [ "$REDIS_URL" = "redis://localhost:6379/0" ]; then
  if ! python3 -c 'import socket; socket.create_connection(("127.0.0.1",6379),1).close()' >/dev/null 2>&1; then
    echo "[-] Starting the local Redis container..."
    docker rm -f stock-sim-redis >/dev/null 2>&1 || true
    docker run -d --name stock-sim-redis -p 127.0.0.1:6379:6379 redis:7-alpine >/dev/null
    STARTED_REDIS=1
  fi
fi

echo "[1] Starting Go Backend on http://localhost:8080..."
start_service "$ROOT_DIR/backend" env PORT=8080 go run ./cmd/server
BACKEND_PID=$SERVICE_PID
# Migrations and remote DB initialization can exceed ten seconds. A successful
# HTTP liveness response is required before launching workers or the frontend.
wait_for_service http://127.0.0.1:8080/api/v1/health "$BACKEND_PID" "Go Backend"

if [ "$MODE" != "--light" ] && [ "$MODE" != "-l" ]; then
  for worker in market-worker news-worker; do
    directory="$ROOT_DIR/python-services/$worker"
    if [ ! -x "$directory/venv/bin/python" ]; then
      python3 -m venv "$directory/venv"
      "$directory/venv/bin/pip" install --quiet -r "$directory/requirements.txt"
    fi
    echo "[*] Starting Python $worker..."
    start_service "$directory" "$directory/venv/bin/python" worker.py
    if [ "$worker" = market-worker ]; then MARKET_WORKER_PID=$SERVICE_PID; fi
  done
  wait_for_service http://127.0.0.1:8085/health "$MARKET_WORKER_PID" "Market Worker"
fi

echo "[*] Starting Next.js Frontend on http://localhost:3000..."
start_service "$ROOT_DIR/frontend" env PORT=3000 npm run dev
wait_for_service http://127.0.0.1:3000/login "$SERVICE_PID" "Frontend"

if ! curl --fail --silent --connect-timeout 1 --max-time 5 http://127.0.0.1:8080/api/v1/ready >/dev/null 2>&1; then
  echo "[!] UI/API are available; trading readiness is degraded. Inspect http://localhost:8080/api/v1/ready."
fi
echo "[✓] Platform processes are available: http://localhost:3000 (UI), http://localhost:8080/api/v1 (API)."
echo "Press Ctrl+C to terminate."
# A child exit must stop the remaining stack rather than leave a half-running platform.
result=0
wait -n "${PIDS[@]}" || result=$?
echo "[!] A platform service stopped; shutting down the remaining services." >&2
[ "$result" -ne 0 ] || result=1
exit "$result"
