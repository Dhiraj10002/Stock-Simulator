#!/usr/bin/env python3
"""Start the Oracle stack in order; never use trading readiness as liveness."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def fetch_json(url):
    with urlopen(url, timeout=5) as response:
        return json.load(response)


def wait_json(url, predicate, timeout):
    deadline = time.monotonic() + timeout
    while True:
        try:
            payload = fetch_json(url)
            if predicate(payload):
                return payload
        except (HTTPError, URLError, TimeoutError, ValueError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Timed out waiting for {url}; inspect Compose logs and /ready diagnostics")
        time.sleep(2)


def bootstrap(env_file, sync_master=False, timeout=180):
    env_file = Path(env_file).resolve()
    if not env_file.is_file():
        raise RuntimeError("Production env file is missing; copy .env.prod.example to .env and configure it")
    if timeout <= 0:
        raise RuntimeError("Timeout must be positive")
    environment = {**os.environ, "PRODUCTION_ENV_FILE": str(env_file)}
    command = ["docker", "compose", "--project-directory", str(ROOT), "--env-file", str(env_file),
               "-f", str(ROOT / "docker-compose.prod.yml")]

    def compose(*args, capture=False):
        return subprocess.run(command + list(args), cwd=ROOT, env=environment,
                              check=True, text=True, capture_output=capture)

    # Capture rendered configuration privately: it contains secrets and must
    # never be dumped to terminal logs or committed as a deployment artifact.
    config = json.loads(compose("config", "--format", "json", capture=True).stdout)
    domain = config["services"]["caddy"]["environment"]["API_DOMAIN"]
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", domain) or "." not in domain:
        raise RuntimeError("API_DOMAIN must be a DNS hostname without scheme, port or path")
    if domain == "example.com" or domain.endswith(".example.com"):
        raise RuntimeError("Replace the API_DOMAIN placeholder with your own DNS hostname")
    base = f"https://{domain}"

    print("Starting Redis, backend liveness and Caddy...", flush=True)
    compose("up", "-d", "--build", "--wait", "--wait-timeout", str(timeout), "redis", "backend", "caddy")
    wait_json(base + "/health", lambda body: body.get("success") is True, timeout)

    if sync_master:
        print("Synchronizing and activating the canonical instrument master...", flush=True)
        compose("run", "--rm", "--no-deps", "--entrypoint", "/sync-instruments", "backend")
    master = fetch_json(base + "/api/v1/instruments/master/status").get("data", {})
    if (master.get("status") != "ACTIVE" or not master.get("activated_at")
            or not master.get("active_version") or master.get("total_instruments", 0) <= 0):
        raise RuntimeError("No activated master; rerun with --sync-master before starting LIVE workers")

    print("Starting market and news workers...", flush=True)
    compose("up", "-d", "--build", "--wait", "--wait-timeout", str(timeout), "market-worker", "news-worker")
    wait_json(base + "/ready", lambda body: body.get("ready") is True, timeout)
    print(f"Stack is ready at {base}; open-market trading acceptance is still required.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=os.environ.get("PRODUCTION_ENV_FILE", str(ROOT / ".env")))
    parser.add_argument("--sync-master", action="store_true", help="Sync/activate the official master before starting workers")
    parser.add_argument("--timeout", type=int, default=180, help="Health/readiness timeout in seconds")
    args = parser.parse_args()
    try:
        bootstrap(args.env_file, args.sync_master, args.timeout)
    except (RuntimeError, subprocess.CalledProcessError, HTTPError, URLError, ValueError) as error:
        parser.exit(1, f"Production bootstrap failed: {error}\n")


if __name__ == "__main__":
    main()
