#!/usr/bin/env bash

echo "========================================================="
echo "   Stock Simulator — Stopping All Platform Services     "
echo "========================================================="

echo "[-] Freeing ports 8080 (backend) and 3000 (frontend)..."
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

echo "[-] Stopping python worker processes..."
pkill -f "python.*worker.py" 2>/dev/null || true

echo "[-] Stopping Docker containers..."
docker compose down 2>/dev/null || true
docker stop stock-sim-redis 2>/dev/null || true
docker rm stock-sim-redis 2>/dev/null || true

echo "[✓] All services and ports stopped successfully."
