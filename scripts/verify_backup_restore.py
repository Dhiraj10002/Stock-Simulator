#!/usr/bin/env python3
"""Restore a custom-format pg_dump into a fresh isolated Docker database.

This command never connects to an existing database, publishes ports, loads .env
or sends the backup anywhere. The disposable container is removed on every exit.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import uuid

TABLES = ("users", "wallets", "orders", "trades", "positions", "wallet_transactions")
# This query verifies full row content without emitting balances or credentials.
FINGERPRINT_SQL = ";\n".join(
    "SELECT '" + table + "', count(*), md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM " + table + " t"
    for table in TABLES
) + ";"


def command(args, timeout=60):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        # pg_restore stderr may contain account rows; never put it into logs.
        raise RuntimeError("isolated restore command failed")
    return result.stdout.strip()


def verify(backup, expected=None):
    backup = backup.resolve(strict=True)
    if not backup.is_file():
        raise ValueError("backup must be a regular file")
    with backup.open("rb") as stream:
        if stream.read(5) != b"PGDMP":
            raise ValueError("use pg_dump --format=custom")
    name = "stocksim-restore-" + uuid.uuid4().hex
    try:
        command(["docker", "run", "--detach", "--name", name, "--network", "none",
                 "--env", "POSTGRES_PASSWORD=" + uuid.uuid4().hex,
                 "--mount", "type=bind,source=" + str(backup) + ",target=/backup.dump,readonly",
                 "postgres:16-alpine"])
        for attempt in range(100):
            result = subprocess.run(["docker", "exec", name, "pg_isready", "-U", "postgres"], capture_output=True, timeout=5)
            if result.returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("disposable database did not start")
        command(["docker", "exec", name, "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "-U", "postgres", "-d", "postgres", "/backup.dump"], timeout=300)
        fingerprint = command(["docker", "exec", name, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", FINGERPRINT_SQL])
        if expected is not None and fingerprint != expected.strip():
            raise RuntimeError("restored accounting rows differ from backup source")
        indexes = command(["docker", "exec", name, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c",
                           "SELECT count(*) FROM pg_indexes WHERE tablename='orders' AND indexname='idx_order_intent_key'"])
        if indexes != "1":
            raise RuntimeError("idempotency index missing after restore")
        return {"restored": True, "isolated": True, "accounting_tables": len(TABLES), "source_fingerprint_matches": expected is not None, "fingerprint_sha256": hashlib.sha256(fingerprint.encode()).hexdigest()}
    finally:
        subprocess.run(["docker", "rm", "--force", name], capture_output=True, timeout=30)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path)
    parser.add_argument("--expected-fingerprint", type=Path)
    args = parser.parse_args()
    try:
        expected = args.expected_fingerprint.read_text() if args.expected_fingerprint else None
        print(json.dumps(verify(args.backup, expected)))
        return 0
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired):
        print(json.dumps({"restored": False, "error": "Restore verification failed; no existing database was modified"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
