#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
  fuser -k 3000/tcp 2>/dev/null || true
  sleep 0.5
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

# 1. Clean up lingering processes on ports 8080, 8085, and 3000
echo "[-] Checking and freeing ports 8080, 8085, and 3000..."
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 8085/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

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

# 2.5 Ensure Neon DB hostname resolves (handles cases where local router DNS returns REFUSED)
if ! host ep-gentle-cloud-ayae8gyh-pooler.c-5.us-east-2.aws.neon.tech >/dev/null 2>&1; then
  echo "[-] Neon DB DNS lookup failed with local router. Setting public DNS fallback (8.8.8.8, 1.1.1.1)..."
  ACTIVE_IFACE=$(ip route show default 2>/dev/null | awk '/default/ {print $5}' | head -n1)
  if [ -n "$ACTIVE_IFACE" ]; then
    resolvectl dns "$ACTIVE_IFACE" 8.8.8.8 1.1.1.1 2>/dev/null || true
  fi
fi

export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"

# 3. Redis Setup (only in full mode)
STARTED_REDIS=0
if [ "$MODE" != "--light" ] && [ "$MODE" != "-l" ]; then
  if ! nc -z localhost 6379 2>/dev/null; then
    echo "[-] Redis not detected on localhost:6379. Launching background Redis container..."
    docker rm -f stock-sim-redis 2>/dev/null || true
    docker run -d --name stock-sim-redis -p 6379:6379 redis:7-alpine >/dev/null
    STARTED_REDIS=1
    sleep 1
  else
    echo "[✓] Redis is active on localhost:6379."
  fi
fi

# 4. Process management & cleanup trap
PIDS=()

cleanup() {
  echo ""
  echo "[-] Shutting down services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  kill 0 2>/dev/null || true
  wait 2>/dev/null || true

  if [ "$STARTED_REDIS" = "1" ]; then
    echo "[-] Stopping temporary Redis container..."
    docker stop stock-sim-redis >/dev/null 2>&1 || true
    docker rm stock-sim-redis >/dev/null 2>&1 || true
  fi
  echo "[✓] Services terminated cleanly."
  exit 0
}

trap cleanup SIGINT SIGTERM

# 5. Start Go Backend on port 8080
echo "[1] Starting Go Backend on http://localhost:8080..."
(
  cd "$ROOT_DIR/backend"
  PORT=8080 go run ./cmd/server
) &
PIDS+=($!)

# 6. Optional Python Workers (only in full mode)
if [ "$MODE" != "--light" ] && [ "$MODE" != "-l" ]; then
  echo "[2] Starting Python Market Worker..."
  (
    cd "$ROOT_DIR/python-services/market-worker"
    if [ ! -d "venv" ]; then
      python3 -m venv venv
      venv/bin/pip install --quiet -r requirements.txt
    fi
    venv/bin/python worker.py
  ) &
  PIDS+=($!)

  echo "[3] Starting Python News Worker..."
  (
    cd "$ROOT_DIR/python-services/news-worker"
    if [ ! -d "venv" ]; then
      python3 -m venv venv
      venv/bin/pip install --quiet -r requirements.txt
    fi
    venv/bin/python worker.py
  ) &
  PIDS+=($!)
fi

# 7. Start Next.js Frontend on port 3000
echo "[*] Starting Next.js Frontend on http://localhost:3000..."
(
  cd "$ROOT_DIR/frontend"
  PORT=3000 npm run dev
) &
PIDS+=($!)

echo "========================================================="
echo " [✓] Platform running:"
echo "     • Frontend Web UI:  http://localhost:3000"
echo "     • Go REST API:      http://localhost:8080/api/v1"
echo "========================================================="
echo "Press Ctrl+C to terminate."

wait
