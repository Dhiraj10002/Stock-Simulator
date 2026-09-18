#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "========================================================="
echo "   Stock Simulator — Starting Full Platform Services     "
echo "========================================================="

# 1. Clean up any lingering processes on ports 8080 and 3000
echo "[-] Checking and freeing ports 8080 and 3000..."
fuser -k 8080/tcp 2>/dev/null || true
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
      # Prevent backend PORT from overriding Next.js port
      if [ "$key" != "PORT" ]; then
        export "$key"="$val"
      fi
    fi
  done < "$ROOT_DIR/backend/.env"
  set +a
fi

# Ensure default URLs if not set
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"

# 3. Ensure Redis is up and ready
STARTED_REDIS=0
if ! nc -z localhost 6379 2>/dev/null; then
  echo "[-] Redis not detected on localhost:6379. Launching background Redis container..."
  docker rm -f stock-sim-redis 2>/dev/null || true
  docker run -d --name stock-sim-redis -p 6379:6379 redis:7-alpine >/dev/null
  STARTED_REDIS=1
  sleep 1
else
  echo "[✓] Redis is active on localhost:6379."
fi

# 4. Process management & cleanup trap
PIDS=()

cleanup() {
  echo ""
  echo "[-] Shutting down all Stock Simulator services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  # Kill any remaining child processes in our process group
  kill 0 2>/dev/null || true
  wait 2>/dev/null || true

  if [ "$STARTED_REDIS" = "1" ]; then
    echo "[-] Stopping temporary Redis container..."
    docker stop stock-sim-redis >/dev/null 2>&1 || true
    docker rm stock-sim-redis >/dev/null 2>&1 || true
  fi
  echo "[✓] All services terminated cleanly."
  exit 0
}

trap cleanup SIGINT SIGTERM

# 5. Start Go Backend on port 8080
echo "[1/4] Starting Go Backend on http://localhost:8080..."
(
  cd "$ROOT_DIR/backend"
  PORT=8080 go run ./cmd/server
) &
PIDS+=($!)

# 6. Prepare and start Python Market Worker
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

# 7. Prepare and start Python News Worker
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

# 8. Start Next.js Frontend on port 3000
echo "[4/4] Starting Next.js Frontend on http://localhost:3000..."
(
  cd "$ROOT_DIR/frontend"
  PORT=3000 npm run dev
) &
PIDS+=($!)

echo "========================================================="
echo " [✓] All services launched successfully!"
echo "     • Frontend Web UI:  http://localhost:3000"
echo "     • Go REST API:      http://localhost:8080/api/v1"
echo "     • Market WebSocket: ws://localhost:8080/ws/market"
echo "========================================================="
echo "Press Ctrl+C to terminate all services."

wait
