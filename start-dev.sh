#!/usr/bin/env bash
set -e

echo "========================================================="
echo "   Stock Simulator — Starting Full Platform Services     "
echo "========================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 1. Safely load environment variables without eval/source syntax issues
if [ -f "$ROOT_DIR/backend/.env" ]; then
  echo "[-] Loading environment variables from backend/.env..."
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
      export "$key"="$val"
    fi
  done < "$ROOT_DIR/backend/.env"
  set +a
fi

# 2. Check and start local Redis if needed
if ! nc -z localhost 6379 2>/dev/null; then
  echo "[-] Redis not detected on localhost:6379. Starting background Redis container..."
  docker run -d --name stock-sim-redis -p 6379:6379 redis:7-alpine 2>/dev/null || docker start stock-sim-redis 2>/dev/null || true
  sleep 1
fi

PIDS=()

cleanup() {
  echo ""
  echo "[-] Shutting down local Stock Simulator services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  docker stop stock-sim-redis 2>/dev/null || true
  docker rm stock-sim-redis 2>/dev/null || true
  echo "[✓] All processes terminated."
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 3. Start Go Backend
echo "[1/4] Starting Go Backend on http://localhost:8080..."
(cd "$ROOT_DIR/backend" && go run ./cmd/server) &
PIDS+=($!)

# 4. Prepare and start Python Market Worker
echo "[2/4] Starting Python Market Worker..."
(
  cd "$ROOT_DIR/python-services/market-worker"
  if [ ! -d "venv" ]; then
    echo "[-] Setting up python virtual environment for market worker..."
    python3 -m venv venv
    venv/bin/pip install --quiet -r requirements.txt
  fi
  venv/bin/python worker.py
) &
PIDS+=($!)

# 5. Prepare and start Python News Worker
echo "[3/4] Starting Python News Worker..."
(
  cd "$ROOT_DIR/python-services/news-worker"
  if [ ! -d "venv" ]; then
    echo "[-] Setting up python virtual environment for news worker..."
    python3 -m venv venv
    venv/bin/pip install --quiet -r requirements.txt
  fi
  venv/bin/python worker.py
) &
PIDS+=($!)

# 6. Start Next.js Frontend
echo "[4/4] Starting Next.js Frontend on http://localhost:3000..."
(cd "$ROOT_DIR/frontend" && npm run dev) &
PIDS+=($!)

echo "========================================================="
echo " [✓] All services launched successfully!"
echo "     • Frontend Web UI:  http://localhost:3000"
echo "     • Go REST API:      http://localhost:8080/api/v1"
echo "     • Market WebSocket: ws://localhost:8080/ws/market"
echo "========================================================="
echo "Press Ctrl+C to terminate all services."

wait
