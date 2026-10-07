#!/usr/bin/env python3
"""Read-only readiness monitoring; optional bounded market-worker recovery.
No credentials, database URLs or broker sessions are emitted. Run from a VM timer.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def inspect(root, url):
    command = ["docker", "compose", "--project-directory", str(root), "--env-file", str(root / ".env"), "-f", str(root / "docker-compose.prod.yml")]
    process = subprocess.run(command + ["ps", "--all", "--format", "json"], capture_output=True, text=True, timeout=15)
    if process.returncode:
        raise RuntimeError("compose inspection failed")
    text = process.stdout.strip()
    rows = json.loads(text) if text.startswith("[") else [json.loads(line) for line in text.splitlines() if line]
    states = {row["Service"]: {"state": row.get("State"), "health": row.get("Health", "")} for row in rows}
    readiness = {}
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            readiness = json.loads(response.read(128 * 1024))
    except urllib.error.HTTPError as error:
        try:
            readiness = json.loads(error.read(128 * 1024))
        except (ValueError, OSError):
            pass
    except (ValueError, OSError):
        pass
    if not isinstance(readiness, dict):
        readiness = {}
    services = readiness.get("services")
    services = services if isinstance(services, dict) else {}
    worker = services.get("worker")
    worker = worker if isinstance(worker, dict) else {}
    stage = worker.get("initialization_stage")
    if stage == "BROKER_PROXY_UNAVAILABLE" and "market-worker" in states:
        states["market-worker"]["broker_proxy_unavailable"] = True
    return command, states, operational(states, readiness)


def operational(states, readiness):
    # An old readiness response must not mask a stopped/unhealthy container.
    required = {"backend", "caddy", "market-worker"}
    return (
        isinstance(readiness, dict)
        and readiness.get("ready") is True
        and required.issubset(states)
        and all(states[name].get("state") == "running" and states[name].get("health") in {"", "healthy"} for name in required)
        and all(row.get("state") == "running" and row.get("health") in {"", "healthy"} for name, row in states.items() if name in {"redis", "broker-proxy"})
    )


def recovery_decision(states, ready, previous, now):
    failures = 0 if ready else int(previous.get("failures", 0)) + 1
    last_restart = float(previous.get("last_restart", 0))
    worker = states.get("market-worker", {})
    proxy = states.get("broker-proxy")
    # Docker won't restart an alive-but-unhealthy process. Retry only the worker,
    # and avoid restart storms when the configured proxy is unhealthy too.
    recover = failures >= 3 and now - last_restart >= 600 and worker.get("health") == "unhealthy" and not worker.get("broker_proxy_unavailable") and (not proxy or proxy.get("health") == "healthy")
    return {"failures": failures, "last_restart": last_restart}, recover


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--url", required=True)
    parser.add_argument("--state", type=Path, default=Path("/var/lib/stocksim-monitor/state.json"))
    parser.add_argument("--restart-worker", action="store_true")
    args = parser.parse_args()
    url = urlsplit(args.url)
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        parser.error("--url must be a public HTTPS readiness URL without credentials")
    try:
        command, states, ready = inspect(args.root.resolve(), args.url)
        try:
            previous = json.loads(args.state.read_text())
        except (OSError, ValueError):
            previous = {}
        state, recover = recovery_decision(states, ready, previous, time.time())
        restarted = False
        if recover and args.restart_worker:
            result = subprocess.run(command + ["restart", "market-worker"], capture_output=True, timeout=45)
            restarted = result.returncode == 0
            # Apply a cooldown even to failed restart attempts.
            state["last_restart"] = time.time()
        args.state.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", dir=args.state.parent, delete=False) as tmp:
            json.dump(state, tmp)
            name = tmp.name
        os.replace(name, args.state)
        print(json.dumps({"event": "production_ready" if ready else "production_unavailable", "ready": ready, "consecutive_failures": state["failures"], "services": states, "worker_restarted": restarted}))
        return 0 if ready else 1
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError):
        print(json.dumps({"event": "production_monitor_failed", "ready": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
