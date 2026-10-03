#!/usr/bin/env bash
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT_DIR"
STOP_PIDS=()

belongs_to_checkout() {
  local directory
  directory=$(readlink "/proc/$1/cwd" 2>/dev/null || true)
  [[ "$directory" = "$ROOT_DIR" || "$directory" = "$ROOT_DIR/"* ]]
}

stop_owned_process() {
  local pid=$1
  if belongs_to_checkout "$pid"; then
    STOP_PIDS+=("$pid")
    kill -TERM "$pid" 2>/dev/null || true
  fi
}

echo "========================================================="
echo "   Stock Simulator — Stopping All Platform Services     "
echo "========================================================="

echo "[-] Stopping project services on ports 8080, 8085 and 3000..."
for port in 8080 8085 3000; do
  for pid in $(fuser "$port/tcp" 2>/dev/null); do stop_owned_process "$pid"; done
done

echo "[-] Stopping python worker processes..."
for pid in $(pgrep -f 'python.*worker.py' 2>/dev/null); do stop_owned_process "$pid"; done

# Allow graceful HTTP shutdown before an immediate restart checks occupied ports.
for _ in {1..110}; do
  alive=0
  for pid in "${STOP_PIDS[@]}"; do
    if belongs_to_checkout "$pid"; then alive=1; fi
  done
  [ "$alive" = 0 ] && break
  sleep 0.1
done
for pid in "${STOP_PIDS[@]}"; do
  if belongs_to_checkout "$pid"; then kill -KILL "$pid" 2>/dev/null || true; fi
done

echo "[-] Stopping Docker containers..."
docker compose down 2>/dev/null || true
docker stop stock-sim-redis 2>/dev/null || true
docker rm stock-sim-redis 2>/dev/null || true

echo "[✓] Stop requests completed for this checkout's services."
