#!/usr/bin/env python3
"""Read-only readiness monitoring; optional bounded market-worker recovery.
No credentials, database URLs or broker sessions are emitted. Run from a VM timer.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urlsplit


def compose_command(root):
    local_postgres = bool(re.search(r"(?m)^ORACLE_POSTGRES_ENABLED=true\s*$", (root / ".env").read_text()))
    command = ["docker", "compose", "--project-directory", str(root), "--env-file", str(root / ".env")]
    if local_postgres:
        command += ["--env-file", str(root / ".env.oracle-db"), "--profile", "oracle-db"]
    command += ["-f", str(root / "docker-compose.prod.yml")]
    if local_postgres:
        command += ["-f", str(root / "deploy/oracle/docker-compose.postgres.yml")]
    return command, local_postgres


def inspect(root, url):
    command, local_postgres = compose_command(root)
    process = subprocess.run(command + ["ps", "--all", "--format", "json"], capture_output=True, text=True, timeout=15)
    if process.returncode:
        raise RuntimeError("compose inspection failed")
    text = process.stdout.strip()
    rows = json.loads(text) if text.startswith("[") else [json.loads(line) for line in text.splitlines() if line]
    states = {row["Service"]: {"state": row.get("State"), "health": row.get("Health", "")} for row in rows
              if "-run-" not in row.get("Name", "")}
    readiness = {}
    http_status = None
    try:
        response = subprocess.run(["curl", "--silent", "--show-error", "--max-time", "10", "--proto", "=https",
                                   "--max-filesize", "131072", "--write-out", "\n%{http_code}", "--", url],
                                  capture_output=True, text=True, timeout=15)
        if response.returncode == 0:
            body, status = response.stdout.rsplit("\n", 1)
            http_status = int(status.strip())
            readiness = json.loads(body)
            if isinstance(readiness, dict) and http_status != 200:
                readiness["ready"] = False
    except (ValueError, OSError, subprocess.TimeoutExpired):
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
    if local_postgres and "postgres" not in states:
        states["postgres"] = {"state": "missing", "health": ""}
    summary = {"http_status": http_status, "services": {
        name: {key: value for key, value in values.items()
               if key in ("status", "mode", "market_state", "supervisor_state", "initialization_stage", "latency_ms", "heartbeat_age_seconds")}
        for name, values in services.items() if isinstance(values, dict)}}
    return command, states, operational(states, readiness, require_postgres=local_postgres), summary


def operational(states, readiness, require_postgres=False):
    # An old readiness response must not mask a stopped/unhealthy container.
    required = {"backend", "caddy", "market-worker", "redis"}
    if require_postgres:
        required.add("postgres")
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
    parser.add_argument("--read-only", action="store_true", help="Explicitly disable worker recovery; checks and local logs only")
    args = parser.parse_args()
    url = urlsplit(args.url)
    if args.read_only and args.restart_worker:
        parser.error("--read-only cannot be combined with --restart-worker")
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment:
        parser.error("--url must be a public HTTPS readiness URL without credentials")
    try:
        command, states, ready, api = inspect(args.root.resolve(), args.url)
        try:
            previous = json.loads(args.state.read_text())
            if not isinstance(previous, dict):
                previous = {}
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
        print(json.dumps({"event": "production_ready" if ready else "production_unavailable", "ready": ready,
                          "consecutive_failures": state["failures"], "services": states,
                          "api": api,
                          "mode": "recovery" if args.restart_worker else "read_only", "worker_restarted": restarted}))
        return 0 if ready else 1
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError, KeyError, TypeError):
        print(json.dumps({"event": "production_monitor_failed", "ready": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
