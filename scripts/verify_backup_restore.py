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


class RestoreFailure(RuntimeError):
    """Only curated phase/codes leave the verifier; never raw tool diagnostics."""
    def __init__(self, stage, code, exit_code=None):
        super().__init__(code)
        self.stage, self.code, self.exit_code = stage, code, exit_code


def failure_code(stderr, default):
    # Classify locally, without retaining or displaying lines that may contain
    # SQL row values, connection credentials or a registry authentication token.
    message = stderr.lower()
    if "cannot connect to the docker daemon" in message or "is the docker daemon running" in message:
        return "docker_unavailable"
    if "permission denied" in message and ("docker.sock" in message or "docker daemon" in message):
        return "docker_permission_denied"
    if "toomanyrequests" in message or "rate limit" in message or "pull access denied" in message:
        return "image_pull_failed"
    if "short-name" in message and ("resolve" in message or "tty" in message):
        return "image_name_resolution_failed"
    if "no matching manifest" in message or "manifest unknown" in message:
        return "image_unavailable"
    if "invalid locale" in message or "invalid lc_collate" in message or "invalid lc_ctype" in message:
        return "locale_unavailable"
    if "permission denied" in message and "backup.dump" in message:
        return "backup_not_readable"
    return default


def command(args, timeout=60, stage="docker_command"):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RestoreFailure(stage, "command_timeout") from None
    except FileNotFoundError:
        raise RestoreFailure(stage, "docker_not_found") from None
    if result.returncode:
        # pg_restore stderr may contain account rows; never put it into logs.
        raise RestoreFailure(stage, failure_code(result.stderr, "command_failed"), result.returncode)
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
            raise RestoreFailure("backup_checksum", "checksum_mismatch")
        if postgres_major != 18:
            raise ValueError("Oracle manifest restore requires PostgreSQL 18")
    name = "stocksim-restore-" + uuid.uuid4().hex
    # Fully qualify official images for Docker-compatible runtimes that do not
    # resolve unqualified registry names non-interactively (common on Fedora).
    image = "docker.io/library/postgres:" + str(postgres_major) + ("-bookworm" if manifest is not None else "-alpine")
    try:
        command(["docker", "run", "--detach", "--name", name, "--network", "none",
                 "--env", "POSTGRES_PASSWORD=" + uuid.uuid4().hex,
                 image],
                timeout=300, stage="container_start")
        # Copy into the disposable container instead of bind-mounting a home
        # directory file. This avoids Fedora SELinux label restrictions without
        # relabeling the user's backup or disabling container isolation.
        command(["docker", "cp", str(backup), name + ":/backup.dump"], timeout=300, stage="backup_copy")
        for attempt in range(300):
            result = subprocess.run(["docker", "exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], capture_output=True, timeout=5)
            if result.returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RestoreFailure("database_start", "database_not_ready")
        database = "postgres"
        if manifest is not None:
            from oracle_postgres import create_database_sql
            database = "restore_validation"
            command(["docker", "exec", name, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
                     "-c", create_database_sql(database, "postgres", manifest["catalog"]["locale"])], stage="database_create")
        command(["docker", "exec", name, "pg_restore", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "-U", "postgres", "-d", database, "/backup.dump"], timeout=1800, stage="database_restore")
        fingerprint = command(["docker", "exec", name, "psql", "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", FINGERPRINT_SQL], stage="accounting_fingerprint")
        if expected is not None and fingerprint != expected.strip():
            raise RestoreFailure("accounting_comparison", "accounting_content_mismatch")
        indexes = command(["docker", "exec", name, "psql", "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c",
                           "SELECT count(*) FROM pg_indexes WHERE tablename='orders' AND indexname='idx_order_intent_key'"], stage="idempotency_index")
        if indexes != "1":
            raise RestoreFailure("idempotency_index", "index_missing")
        full_match = False
        if manifest is not None:
            from oracle_postgres import CATALOG_SQL, TABLES_SQL, Migration, MigrationError, compare_manifest, manifest_sql
            def sql(query):
                return command(["docker", "exec", name, "psql", "-XqAt", "-U", "postgres", "-d", database,
                                "-v", "ON_ERROR_STOP=1", "-c", "SET timezone='UTC'; SET extra_float_digits=3; " + query], stage="manifest_query")
            names = json.loads(sql(TABLES_SQL))
            try:
                compare_manifest(manifest, json.loads(sql(manifest_sql(names))), json.loads(sql(CATALOG_SQL)))
            except MigrationError as error:
                codes = {"restored table counts/content differ from the exported source snapshot": "table_content_mismatch"}
                codes.update({"restored " + field + " differ from source": field + "_mismatch"
                              for field in ("indexes", "constraints", "extensions", "locale")})
                raise RestoreFailure("manifest_comparison", codes.get(str(error), "source_manifest_mismatch")) from None
            try:
                Migration(Path.cwd(), Path.cwd() / ".env").verify_sequences(name, database)
            except MigrationError:
                raise RestoreFailure("sequence_verification", "sequence_check_failed") from None
            full_match = True
        return {"restored": True, "isolated": True, "accounting_tables": len(TABLES), "source_fingerprint_matches": expected is not None or full_match,
                "all_public_tables_match": full_match, "postgres_major": postgres_major,
                "fingerprint_sha256": hashlib.sha256(fingerprint.encode()).hexdigest()}
    finally:
        try:
            subprocess.run(["docker", "rm", "--force", "--volumes", name], capture_output=True, timeout=30)
        except (OSError, subprocess.SubprocessError):
            # Never replace the actual failure with a secondary cleanup error.
            pass


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
    except RestoreFailure as error:
        print(json.dumps({"restored": False, "stage": error.stage, "code": error.code,
                          "exit_code": error.exit_code,
                          "error": "Restore verification failed; no existing database was modified"}))
        return 1
    except (OSError, RuntimeError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        print(json.dumps({"restored": False, "stage": "input_or_verification", "code": "validation_failed",
                          "error": "Restore verification failed; no existing database was modified"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
