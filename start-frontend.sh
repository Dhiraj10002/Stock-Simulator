#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR/frontend"

echo "========================================================="
echo "   Stock Simulator — Starting Frontend Only (Lightweight) "
echo "========================================================="
echo "[-] Checking and freeing port 3000..."
fuser -k 3000/tcp 2>/dev/null || true
sleep 0.5

echo "[✓] Launching Next.js UI on http://localhost:3000..."
echo "     (Zero backend/Docker/Python overhead — cool & fast)"
echo "========================================================="
echo "Press Ctrl+C to stop."

PORT=3000 npm run dev
