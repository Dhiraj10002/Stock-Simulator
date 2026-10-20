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


def verify(backup, expected=None, postgres_major=16, manifest=None):
    if postgres_major not in (16, 17, 18):
        raise ValueError("unsupported PostgreSQL major")
    backup = backup.resolve(strict=True)
    if not backup.is_file():
        raise ValueError("backup must be a regular file")
    with backup.open("rb") as stream:
        if stream.read(5) != b"PGDMP":
            raise ValueError("use pg_dump --format=custom")
    if manifest is not None:
        from oracle_postgres import file_sha256
        if file_sha256(backup) != manifest["dump_sha256"]:
            raise RuntimeError("backup checksum mismatch")
        if postgres_major != 18:
            raise ValueError("Oracle manifest restore requires PostgreSQL 18")
    name = "stocksim-restore-" + uuid.uuid4().hex
    try:
        command(["docker", "run", "--detach", "--name", name, "--network", "none",
                 "--env", "POSTGRES_PASSWORD=" + uuid.uuid4().hex,
                 "--mount", "type=bind,source=" + str(backup) + ",target=/backup.dump,readonly",
                 "postgres:18-bookworm" if manifest is not None else "postgres:" + str(postgres_major) + "-alpine"])
        for attempt in range(300):
            result = subprocess.run(["docker", "exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], capture_output=True, timeout=5)
            if result.returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("disposable database did not start")
        database = "postgres"
        if manifest is not None:
            from oracle_postgres import create_database_sql
            database = "restore_validation"
            command(["docker", "exec", name, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
                     "-c", create_database_sql(database, "postgres", manifest["catalog"]["locale"])])
        command(["docker", "exec", name, "pg_restore", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "-U", "postgres", "-d", database, "/backup.dump"], timeout=1800)
        fingerprint = command(["docker", "exec", name, "psql", "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", FINGERPRINT_SQL])
        if expected is not None and fingerprint != expected.strip():
            raise RuntimeError("restored accounting rows differ from backup source")
        indexes = command(["docker", "exec", name, "psql", "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c",
                           "SELECT count(*) FROM pg_indexes WHERE tablename='orders' AND indexname='idx_order_intent_key'"])
        if indexes != "1":
            raise RuntimeError("idempotency index missing after restore")
        full_match = False
        if manifest is not None:
            from oracle_postgres import CATALOG_SQL, TABLES_SQL, Migration, compare_manifest, manifest_sql
            def sql(query):
                return command(["docker", "exec", name, "psql", "-XqAt", "-U", "postgres", "-d", database,
                                "-v", "ON_ERROR_STOP=1", "-c", "SET timezone='UTC'; SET extra_float_digits=3; " + query])
            names = json.loads(sql(TABLES_SQL))
            compare_manifest(manifest, json.loads(sql(manifest_sql(names))), json.loads(sql(CATALOG_SQL)))
            Migration(Path.cwd(), Path.cwd() / ".env").verify_sequences(name, database)
            full_match = True
        return {"restored": True, "isolated": True, "accounting_tables": len(TABLES), "source_fingerprint_matches": expected is not None or full_match,
                "all_public_tables_match": full_match, "postgres_major": postgres_major,
                "fingerprint_sha256": hashlib.sha256(fingerprint.encode()).hexdigest()}
    finally:
        subprocess.run(["docker", "rm", "--force", "--volumes", name], capture_output=True, timeout=30)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path)
    parser.add_argument("--expected-fingerprint", type=Path)
    parser.add_argument("--postgres-major", type=int, choices=(16, 17, 18), default=16)
    parser.add_argument("--manifest", type=Path, help="Compare every public table/index/constraint from an Oracle migration bundle")
    args = parser.parse_args()
    try:
        expected = args.expected_fingerprint.read_text() if args.expected_fingerprint else None
        manifest = json.loads(args.manifest.read_text()) if args.manifest else None
        print(json.dumps(verify(args.backup, expected, args.postgres_major, manifest)))
        return 0
    except (OSError, RuntimeError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        print(json.dumps({"restored": False, "error": "Restore verification failed; no existing database was modified"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
