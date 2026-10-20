#!/usr/bin/env python3
"""Opt-in Oracle PostgreSQL staging. Never stops production or changes its DSN.

Uses Docker's PostgreSQL 18 tools, not host packages. Connection credentials are
read privately from Compose and passed through a mode-0600 temporary env file.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import select
import subprocess
import tempfile
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "postgres:18-bookworm"
class MigrationError(RuntimeError):
    """A curated diagnostic safe to show without connection credentials."""


DATABASE_NAME = re.compile(r"stocksim_candidate_[a-z0-9_]{1,48}\Z")


def private_write(path, value):
    with open(path, "x", opener=lambda p, flags: os.open(p, flags, 0o600)) as stream:
        stream.write(value)


def quote_ident(value):
    return '"' + value.replace('"', '""') + '"'


def quote_literal(value):
    return "'" + value.replace("'", "''") + "'"


def manifest_sql(tables):
    """Hash every public table, including empty tables, without emitting rows."""
    if not tables:
        raise MigrationError("source has no public application tables")
    parts = []
    for table in tables:
        name = "public." + table
        parts.append(
            "SELECT " + quote_literal(name) + " AS name, count(*) AS rows, "
            "md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY "
            "md5(to_jsonb(t)::text) COLLATE \"C\"), '')) AS digest FROM public."
            + quote_ident(table) + " t")
    return (
        "SELECT jsonb_object_agg(name, jsonb_build_object('rows', rows, 'digest', digest)) "
        "FROM (" + " UNION ALL ".join(parts) + ") hashes;")


TABLES_SQL = """SELECT COALESCE(json_agg(tablename ORDER BY tablename COLLATE "C"), '[]')
FROM pg_tables WHERE schemaname='public';"""
CATALOG_SQL = """SELECT json_build_object(
'version', current_setting('server_version_num')::int,
'extensions', (SELECT json_agg(json_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),
'other_tables', (SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('public','pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%'),
'indexes', (SELECT COALESCE(json_agg(indexdef ORDER BY indexname), '[]') FROM pg_indexes WHERE schemaname='public'),
'constraints', (SELECT COALESCE(json_agg(json_build_object('table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) ORDER BY r.relname,c.conname), '[]') FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'));
"""


def compare_manifest(expected, tables, catalog):
    if expected["tables"] != tables:
        raise MigrationError("restored table counts/content differ from the exported source snapshot")
    for field in ("indexes", "constraints", "extensions"):
        if expected["catalog"][field] != catalog[field]:
            raise MigrationError("restored " + field + " differ from source")


class Migration:
    def __init__(self, root, env_file, sudo_docker=False):
        self.root = root.resolve()
        self.env_file = env_file.resolve()
        self.secret_file = self.root / ".env.oracle-db"
        self.docker = ["sudo", "docker"] if sudo_docker else ["docker"]
        self.environment = {**os.environ, "PRODUCTION_ENV_FILE": str(self.env_file)}

    def run(self, args, *, data=None, timeout=600):
        result = subprocess.run(self.docker + args, input=data, capture_output=True,
                                text=True, timeout=timeout, env=self.environment)
        if result.returncode:
            # Tool stderr/config output can contain DSNs, SQL values or account rows.
            raise MigrationError("Docker/PostgreSQL operation failed; sensitive diagnostics suppressed")
        return result.stdout.strip()

    def compose(self, *args, database=True):
        prefix = ["compose", "--project-directory", str(self.root), "--env-file", str(self.env_file)]
        if database:
            prefix += ["--env-file", str(self.secret_file), "--profile", "oracle-db"]
        prefix += ["-f", str(self.root / "docker-compose.prod.yml")]
        if database:
            prefix += ["-f", str(self.root / "deploy/oracle/docker-compose.postgres.yml")]
        return self.run(prefix + list(args))

    def prepare(self):
        if not self.env_file.is_file():
            raise MigrationError("production env file is missing")
        if not self.secret_file.exists():
            private_write(self.secret_file, "ORACLE_PG_ADMIN_PASSWORD=" + secrets.token_hex(32)
                          + "\nORACLE_PG_APP_PASSWORD=" + secrets.token_hex(32) + "\n")
        if self.secret_file.stat().st_mode & 0o077:
            raise MigrationError("chmod 600 .env.oracle-db before continuing")
        self.compose("config", "--quiet")
        return {"prepared": True, "production_changed": False}

    def source_url(self, allow_local=False):
        config = json.loads(self.compose("config", "--format", "json", database=False))
        source = config["services"]["backend"]["environment"]["DATABASE_URL"]
        parsed = urlsplit(source)
        if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname or "\n" in source or "\r" in source:
            raise MigrationError("invalid source DATABASE_URL")
        if parsed.hostname == "postgres" and not allow_local:
            raise MigrationError("source already points to the local PostgreSQL service")
        if allow_local and (parsed.hostname != "postgres" or not DATABASE_NAME.fullmatch(parsed.path.lstrip('/'))):
            raise MigrationError("backup requires a migrated local candidate DATABASE_URL")
        # Do not silently dump a .env that differs from the currently running backend.
        existing = self.compose("ps", "--quiet", "backend", database=False)
        if existing:
            for container in existing.splitlines():
                actual = json.loads(self.run(["inspect", container]))[0]["Config"]["Env"]
                urls = [value.split("=", 1)[1] for value in actual if value.startswith("DATABASE_URL=")]
                if urls != [source]:
                    raise MigrationError("running backend DATABASE_URL differs from source env; reconcile privately first")
        return source

    def start_database(self):
        self.prepare()
        self.compose("up", "-d", "--no-deps", "--wait", "--wait-timeout", "180", "postgres")
        container = self.compose("ps", "--quiet", "postgres")
        if not container or "\n" in container:
            raise MigrationError("expected exactly one local PostgreSQL container")
        return container

    def target_sql(self, container, database, sql):
        return self.run(["exec", "-i", container, "psql", "-XqAt", "-U", "postgres", "-d", database,
                         "-v", "ON_ERROR_STOP=1"], data="SET timezone='UTC'; SET extra_float_digits=3;\n" + sql)

    def verify_sequences(self, container, database):
        owners = json.loads(self.target_sql(container, database, """SELECT COALESCE(json_agg(json_build_object(
        'sequence',s.relname,'table',t.relname,'column',a.attname,'increment',q.seqincrement)), '[]')
        FROM pg_class s JOIN pg_sequence q ON q.seqrelid=s.oid JOIN pg_namespace n ON n.oid=s.relnamespace
        JOIN pg_depend d ON d.objid=s.oid AND d.deptype IN ('a','i')
        JOIN pg_class t ON t.oid=d.refobjid JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
        WHERE s.relkind='S' AND n.nspname='public';"""))
        for owner in owners:
            if owner["increment"] <= 0:
                raise MigrationError("non-positive sequence increments require manual compatibility review")
            seq = "public." + quote_ident(owner["sequence"])
            table = "public." + quote_ident(owner["table"])
            column = quote_ident(owner["column"])
            safe = self.target_sql(container, database,
                "SELECT COALESCE((SELECT max(" + column + ") FROM " + table + ") < last_value OR "
                "((SELECT max(" + column + ") FROM " + table + ") = last_value AND is_called), true) FROM " + seq + ";")
            if safe != "t":
                raise MigrationError("restored sequence could collide with existing IDs")
        return len(owners)

    @contextmanager
    def client(self, container, source, folder):
        networks = json.loads(self.run(["inspect", container]))[0]["NetworkSettings"]["Networks"]
        if len(networks) != 1:
            raise MigrationError("PostgreSQL must have exactly one private Docker network")
        name = "stocksim-pg-client-" + secrets.token_hex(6)
        with tempfile.TemporaryDirectory(prefix="stocksim-pg-") as private:
            env = Path(private) / "client.env"
            private_write(env, "PGDATABASE=" + source + "\nPGCONNECT_TIMEOUT=15\nPGOPTIONS=-c timezone=UTC\n")
            try:
                self.run(["run", "--detach", "--name", name, "--network", next(iter(networks)),
                          "--user", str(os.getuid()) + ":" + str(os.getgid()),
                          "--env-file", str(env), "--mount", "type=bind,source=" + str(folder) + ",target=/backup",
                          IMAGE, "sleep", "infinity"])
                yield name
            finally:
                self.run(["rm", "--force", "--volumes", name])

    @contextmanager
    def snapshot(self, client):
        args = self.docker + ["exec", "-i", client, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1"]
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, text=True, env=self.environment)
        def query(sql):
            process.stdin.write(sql + "\n")
            process.stdin.flush()
            if not select.select([process.stdout], [], [], 300)[0]:
                raise MigrationError("source snapshot query timed out")
            line = process.stdout.readline().strip()
            if not line:
                raise MigrationError("source snapshot connection failed")
            return line
        try:
            snapshot = query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();")
            if not re.fullmatch(r"[0-9A-Fa-f-]+", snapshot):
                raise MigrationError("invalid exported snapshot")
            yield snapshot, query
        finally:
            try:
                process.stdin.write("ROLLBACK;\n\\q\n")
                process.stdin.flush()
                process.communicate(timeout=15)
            except (BrokenPipeError, OSError, subprocess.TimeoutExpired):
                process.kill()
                process.communicate()

    def export(self, container, source, name):
        bundle_name = "stocksim_backup_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_") + secrets.token_hex(3)
        folder = self.root / "backups" / bundle_name
        folder.mkdir(parents=True, mode=0o700)
        os.chmod(folder, 0o700)
        with self.client(container, source, folder) as client:
            with self.snapshot(client) as (snapshot, query):
                catalog = json.loads(query(CATALOG_SQL))
                if catalog["version"] // 10000 != 18:
                    raise MigrationError("this migration requires PostgreSQL 18 source; no downgrade is attempted")
                if catalog["other_tables"]:
                    raise MigrationError("non-public application tables require an expanded verification policy")
                available = json.loads(self.target_sql(container, "postgres", "SELECT json_agg(name) FROM pg_available_extensions;"))
                missing = [item["name"] for item in catalog["extensions"] if item["name"] not in available]
                if missing:
                    raise MigrationError("source extensions unavailable locally: " + ", ".join(missing))
                tables = json.loads(query(TABLES_SQL))
                fingerprint = json.loads(query(manifest_sql(tables)))
                self.run(["exec", client, "pg_dump", "--format=custom", "--no-owner", "--no-privileges",
                          "--snapshot=" + snapshot, "--file=/backup/source.dump"], timeout=1800)
        backup = folder / "source.dump"
        os.chmod(backup, 0o600)
        manifest = {"format": 1, "database": name, "catalog": catalog, "tables": fingerprint,
                    "dump_sha256": file_sha256(backup), "created_at": datetime.now(timezone.utc).isoformat()}
        private_write(folder / "manifest.json", json.dumps(manifest, indent=2) + "\n")
        return folder

    def backup(self):
        source = self.source_url(allow_local=True)
        name = urlsplit(source).path.lstrip('/')
        container = self.compose("ps", "--quiet", "postgres")
        if not container or "\n" in container:
            raise MigrationError("local PostgreSQL is not running")
        folder = self.export(container, source, name)
        return {"backup_created": True, "bundle": str(folder.relative_to(self.root)),
                "independent_restore_verified": False, "off_vm_copy_verified": False}

    def stage(self):
        source = self.source_url()
        container = self.start_database()
        name = "stocksim_candidate_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_") + secrets.token_hex(3)
        print("Creating a consistent source snapshot and isolated candidate; production stays on Neon.", flush=True)
        folder = self.export(container, source, name)
        backup = folder / "source.dump"
        # CREATE DATABASE fails if it already exists. No --clean, DROP or existing-target restore.
        self.target_sql(container, "postgres", "CREATE DATABASE " + quote_ident(name) + " OWNER stocksim;")
        with backup.open("rb") as stream:
            result = subprocess.run(self.docker + ["exec", "-i", container, "pg_restore", "--exit-on-error",
                "--single-transaction", "--no-owner", "--no-privileges", "--role=stocksim", "-U", "postgres", "-d", name],
                stdin=stream, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1800)
            if result.returncode:
                raise MigrationError("candidate restore failed; production is unchanged, retain bundle for investigation")
        result = self.verify(folder)
        private_write(folder / "verified.json", json.dumps(result, indent=2) + "\n")
        return {**result, "bundle": str(folder.relative_to(self.root)), "production_changed": False}

    def verify(self, folder):
        folder = folder.resolve(strict=True)
        manifest = json.loads((folder / "manifest.json").read_text())
        name = manifest["database"]
        if not DATABASE_NAME.fullmatch(name):
            raise MigrationError("only migration-created candidate databases may be inspected")
        if file_sha256(folder / "source.dump") != manifest["dump_sha256"]:
            raise MigrationError("backup checksum mismatch")
        container = self.compose("ps", "--quiet", "postgres")
        catalog = json.loads(self.target_sql(container, name, CATALOG_SQL))
        names = json.loads(self.target_sql(container, name, TABLES_SQL))
        tables = json.loads(self.target_sql(container, name, manifest_sql(names)))
        compare_manifest(manifest, tables, catalog)
        indexes = self.target_sql(container, name,
            "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_order_intent_key';")
        if indexes != "1":
            raise MigrationError("order idempotency index is missing")
        sequences = self.verify_sequences(container, name)
        # Reject broken restored FK/CHECK constraints even if they were broken at source.
        if any(not value["validated"] for value in catalog["constraints"]):
            raise MigrationError("unvalidated constraints require manual review")
        # Verify the non-superuser application can actually read restored tables.
        self.target_sql(container, name, "SET ROLE stocksim; " + manifest_sql(names))
        return {"verified": True, "database": name, "tables_compared": len(tables),
                "sequences_checked": sequences, "dump_sha256": manifest["dump_sha256"],
                "accounting_content_matches": True, "open_market_verified": False,
                "off_vm_restore_verified": False}

    def validate_source(self, folder):
        # A staging snapshot becomes obsolete as soon as production accepts writes.
        # This read-only check is useful only after ALL writers have been stopped.
        folder = folder.resolve(strict=True)
        manifest = json.loads((folder / "manifest.json").read_text())
        source = self.source_url()
        container = self.compose("ps", "--quiet", "postgres")
        with self.client(container, source, folder) as client:
            with self.snapshot(client) as (_, query):
                names = json.loads(query(TABLES_SQL))
                compare_manifest(manifest, json.loads(query(manifest_sql(names))), json.loads(query(CATALOG_SQL)))
        return {"source_unchanged_since_snapshot": True,
                "warning": "all writers must remain stopped until cutover; this does not lock out future writes"}

    def candidate_env(self, folder, output):
        # Export config only; never alters .env, recreates services or accepts live orders.
        result = self.verify(folder)
        config = json.loads(self.compose("config", "--format", "json"))
        password = config["services"]["postgres"]["environment"]["STOCKSIM_APP_PASSWORD"]
        source = self.env_file.read_text()
        if re.search(r"(?m)^\s*(?:export\s+)?(?:COMPOSE_FILE|COMPOSE_PROFILES|ORACLE_POSTGRES_ENABLED)\s*=", source):
            raise MigrationError("source contains Compose overrides; review manually")
        filtered = "\n".join(line for line in source.splitlines()
                             if not re.match(r"^\s*(?:export\s+)?DATABASE_URL\s*=", line))
        url = "postgresql://stocksim:" + password + "@postgres:5432/" + result["database"] + "?sslmode=disable"
        private_write(output, filtered + "\nDATABASE_URL=" + url + "\nORACLE_POSTGRES_ENABLED=true\n")
        return {"candidate_env_written": True, "production_changed": False,
                "note": "isolated app testing only; never switch production to an old staging snapshot"}


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--sudo-docker", action="store_true")
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("prepare")
    sub.add_parser("stage")
    sub.add_parser("backup", help="Snapshot the local database after a completed production migration")
    for action in ("verify", "validate-source", "candidate-env"):
        command = sub.add_parser(action)
        command.add_argument("bundle", type=Path)
        if action == "candidate-env":
            command.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    migration = Migration(args.root, args.env_file or args.root / ".env", args.sudo_docker)
    try:
        if args.action == "prepare":
            result = migration.prepare()
        elif args.action == "stage":
            result = migration.stage()
        elif args.action == "backup":
            result = migration.backup()
        elif args.action == "verify":
            result = migration.verify(args.bundle)
        elif args.action == "validate-source":
            result = migration.validate_source(args.bundle)
        else:
            result = migration.candidate_env(args.bundle, args.output)
        print(json.dumps(result))
        return 0
    except MigrationError as error:
        print(json.dumps({"ok": False, "production_changed": False, "error": str(error)}))
        return 1
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError):
        # Do not stringify arbitrary exceptions: JSON/driver errors can contain secrets.
        print(json.dumps({"ok": False, "production_changed": False,
                          "error": "Migration failed; do not switch DATABASE_URL. Check file permissions, version/extensions and Docker access privately."}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
