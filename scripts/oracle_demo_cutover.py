#!/usr/bin/env python3
"""Operator-run Neon -> Oracle cutover for the owner's non-public demo.

Pauses local writers, takes a NEW snapshot, optionally deletes only the six
screenshot accounts, verifies a post-cleanup backup, and reuses running images.
Never deletes the Neon project. Failures leave a private recovery journal.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from urllib.parse import urlsplit

from oracle_postgres import Migration, MigrationError, ROOT, TABLES_SQL, private_write, quote_ident, quote_literal
from production_addresses import primary_api_hostname


ACCOUNT_NAMES = {1: "dhirajgupta", 3: "dhiraj", 6: "dhiraj", 15: "dhirajgupta", 16: "dhiraj", 17: "dj"}
DELETE_ORDER = ("wallet_transactions", "trades", "positions", "orders", "refresh_sessions",
                "risk_events", "simulation_resets", "account_daily_snapshots", "watchlist_items", "wallets", "users")
APP_SERVICES = ("backend", "market-worker", "news-worker")
ALL_SERVICES = APP_SERVICES + ("caddy", "redis", "postgres")


def cleanup_sql(tables, user_tables):
    """One locked transaction; hash all retained rows before AND after deletion."""
    if not {"users", "wallets", "wallet_transactions"}.issubset(tables):
        raise MigrationError("cleanup requires the application user/wallet schema")
    if not set(user_tables).issubset(DELETE_ORDER):
        raise MigrationError("unknown user-linked table; cleanup policy needs review")
    expected = ",".join(f"({key},{quote_literal(value)})" for key, value in ACCOUNT_NAMES.items())
    ids = ",".join(str(key) for key in ACCOUNT_NAMES)
    conditions = {}
    for table in tables:
        if table == "users":
            conditions[table] = "t.uuid IN (SELECT uuid FROM cleanup_targets)"
        elif table == "wallet_transactions":
            conditions[table] = "t.wallet_uuid IN (SELECT uuid FROM cleanup_wallets)"
        elif table in user_tables:
            conditions[table] = "t.user_uuid IN (SELECT uuid FROM cleanup_targets)"
        else:
            conditions[table] = "false"

    def retained_hashes():
        parts = ["SELECT " + quote_literal(table) + " AS name, count(*) AS rows, "
                 "md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text) COLLATE \"C\"), '')) AS digest "
                 "FROM public." + quote_ident(table) + " t WHERE NOT COALESCE((" + conditions[table] + "), false)"
                 for table in sorted(tables)]
        return "SELECT jsonb_object_agg(name,jsonb_build_object('rows',rows,'digest',digest)) FROM (" + " UNION ALL ".join(parts) + ") h"

    sql = ["BEGIN; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='120s';",
           "LOCK TABLE " + ",".join("public." + quote_ident(table) for table in sorted(tables)) + " IN SHARE ROW EXCLUSIVE MODE;",
           "CREATE TEMP TABLE cleanup_targets ON COMMIT DROP AS SELECT u.id,u.uuid FROM public.users u "
           "JOIN (VALUES " + expected + ") e(id,name) ON u.id=e.id "
           "AND regexp_replace(lower(u.name),'[[:space:]]','','g')=e.name AND lower(u.email) LIKE 'dhiraj%';",
           "DO $$ BEGIN IF (SELECT count(*) FROM cleanup_targets) <> 6 THEN RAISE EXCEPTION 'account identity guard failed'; END IF; END $$;",
           "CREATE TEMP TABLE cleanup_wallets ON COMMIT DROP AS SELECT uuid FROM public.wallets WHERE user_uuid IN (SELECT uuid FROM cleanup_targets);",
           "CREATE TEMP TABLE cleanup_retained ON COMMIT DROP AS " + retained_hashes() + ";",
           "CREATE TEMP TABLE cleanup_counts(table_name text, rows bigint) ON COMMIT DROP;"]
    for table in DELETE_ORDER:
        if table in tables:
            if table not in ("users", "wallet_transactions") and table not in user_tables:
                raise MigrationError("known cleanup table is missing user_uuid")
            sql.append("WITH removed AS (DELETE FROM public." + quote_ident(table) + " t WHERE " + conditions[table]
                       + " RETURNING 1) INSERT INTO cleanup_counts SELECT " + quote_literal(table) + ",count(*) FROM removed;")
    sql += ["DO $$ BEGIN IF (SELECT * FROM cleanup_retained) IS DISTINCT FROM (" + retained_hashes()
            + ") THEN RAISE EXCEPTION 'retained rows changed'; END IF; END $$;",
            "SELECT json_build_object('deleted_user_ids',ARRAY[" + ids + "], 'deleted_rows',"
            "(SELECT json_object_agg(table_name,rows) FROM cleanup_counts),'other_data_unchanged',true);", "COMMIT;"]
    return "\n".join(sql)


def cleanup(migration, container, database):
    tables = json.loads(migration.target_sql(container, database, TABLES_SQL))
    user_tables = json.loads(migration.target_sql(container, database,
        "SELECT COALESCE(json_agg(table_name),'[]') FROM information_schema.columns WHERE table_schema='public' AND column_name='user_uuid';"))
    return json.loads(migration.target_sql(container, database, cleanup_sql(tables, user_tables)))


class DemoCutover:
    def __init__(self, migration):
        self.migration = migration
        self.record = None
        self.state = {"phase": "preflight", "production_env_changed": False, "application_start_attempted": False}

    def phase(self, value):
        self.state["phase"] = value
        if self.record:
            temporary = self.record / ("journal-" + secrets.token_hex(4) + ".json")
            private_write(temporary, json.dumps(self.state, indent=2) + "\n")
            os.replace(temporary, self.record / "journal.json")
        print(json.dumps({"phase": value}), flush=True)

    def host(self, args, timeout=60):
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        if result.returncode:
            raise MigrationError("host operation failed in " + self.state["phase"] + "; raw diagnostics suppressed")
        return result.stdout.strip()

    def systemctl(self, *args):
        prefix = ["sudo", "-n"] if self.migration.docker[0] == "sudo" else []
        return self.host(prefix + ["systemctl", *args])

    def runtime(self, *args):
        m = self.migration
        return m.run(["compose", "--project-directory", str(m.root), "--env-file", str(m.env_file),
                      "--env-file", str(m.secret_file), "--profile", "oracle-db", "-f", str(m.root / "docker-compose.prod.yml"),
                      "-f", str(m.root / "deploy/oracle/docker-compose.postgres.yml"),
                      "-f", str(self.record / "images.json"), *args])

    def preflight(self):
        m = self.migration
        self.state["preflight_check"] = "production_env_path"
        if m.env_file != m.root / ".env":
            raise MigrationError("cutover requires the root production .env")
        self.state["preflight_check"] = "postgres_compose_configuration"
        m.prepare()
        self.state["preflight_check"] = "source_database_and_running_backend"
        m.source_url()  # Reject already migrated or env/running-container mismatch.
        self.state["preflight_check"] = "api_domain"
        config = json.loads(m.compose("config", "--format", "json"))
        try:
            domain = primary_api_hostname(config["services"]["caddy"]["environment"]["API_DOMAIN"])
        except ValueError as error:
            raise MigrationError(str(error)) from None
        images, containers = {}, {}
        for service in ALL_SERVICES:
            self.state["preflight_check"] = "running_container_" + service
            container = m.compose("ps", "--quiet", service)
            if not container or "\n" in container:
                raise MigrationError("expected one running container for " + service)
            info = json.loads(m.run(["inspect", container]))[0]
            if not info["State"]["Running"]:
                raise MigrationError("service is not running: " + service)
            images[service] = {"image": info["Image"], "pull_policy": "never"}
            containers[service] = container
        self.state["preflight_check"] = "passed"
        return images, containers, domain

    def run(self, remove_dhiraj=False):
        m = self.migration
        images, containers, domain = self.preflight()
        self.state["preflight_check"] = "private_recovery_record"
        self.record = m.root / "backups" / ("demo_cutover_" + secrets.token_hex(8))
        self.record.mkdir(mode=0o700, parents=True)
        original = m.env_file.read_text()
        private_write(self.record / "neon-fallback.env", original)
        private_write(self.record / "images.json", json.dumps({"services": images}))
        self.state["preflight_check"] = "monitor_systemd_units"
        self.state["monitor_timer_active"] = self.systemctl("show", "stocksim-monitor.timer", "--property=ActiveState", "--value") == "active"
        loaded = [unit for unit in ("stocksim-monitor.timer", "stocksim-monitor.service")
                  if self.systemctl("show", unit, "--property=LoadState", "--value") == "loaded"]
        self.state["preflight_check"] = "passed"
        self.phase("pause_local_writers")
        if loaded:
            self.systemctl("stop", *loaded)
        m.compose("stop", "--timeout", "60", "caddy", *APP_SERVICES)
        for service in ("caddy", *APP_SERVICES):
            if json.loads(m.run(["inspect", containers[service]]))[0]["State"]["Running"]:
                raise MigrationError("writer pause did not complete")

        self.phase("fresh_snapshot")
        result = m.stage()
        source_bundle = m.root / result["bundle"]
        self.state["source_bundle"] = result["bundle"]
        m.validate_source(source_bundle)
        candidate = self.record / "oracle-runtime.env"
        m.candidate_env(source_bundle, candidate)
        self.state["database"] = result["database"]
        container = m.compose("ps", "--quiet", "postgres")
        if remove_dhiraj:
            self.phase("delete_six_dhiraj_test_accounts")
            self.state["cleanup"] = cleanup(m, container, result["database"])

        self.phase("verify_post_cleanup_backup")
        local = Migration(m.root, candidate, m.docker[0] == "sudo")
        backup = local.backup()
        self.state["backup_bundle"] = backup["bundle"]
        bundle = m.root / backup["bundle"]
        local.verify(bundle)
        prefix = ["sudo"] if m.docker[0] == "sudo" else []
        verified = json.loads(self.host(prefix + ["python3", str(ROOT / "scripts/verify_backup_restore.py"),
            str(bundle / "source.dump"), "--postgres-major", "18", "--manifest", str(bundle / "manifest.json")], timeout=1800))
        if verified.get("all_public_tables_match") is not True:
            raise MigrationError("independent restore did not match")
        self.state["independent_restore_verified"] = True
        # Still no production writes on the target; detect any source writer left outside this VM.
        m.validate_source(source_bundle)
        if m.env_file.read_text() != original:
            raise MigrationError("production env changed during migration")
        self.phase("install_oracle_configuration")
        os.replace(candidate, m.env_file)
        self.state["production_env_changed"] = True
        self.state["application_start_attempted"] = True
        self.phase("start_existing_application_images")
        self.runtime("up", "-d", "--no-build", "--no-deps", "--pull", "never", "--wait", "--wait-timeout", "180", "postgres", "redis", "backend", "caddy")
        self.runtime("up", "-d", "--no-build", "--no-deps", "--pull", "never", "market-worker", "news-worker")
        expected = json.loads(m.compose("config", "--format", "json"))["services"]["backend"]["environment"]["DATABASE_URL"]
        if urlsplit(expected).hostname != "postgres":
            raise MigrationError("runtime is not configured for Oracle PostgreSQL")
        for service in APP_SERVICES:
            current = m.compose("ps", "--quiet", service)
            info = json.loads(m.run(["inspect", current]))[0]
            actual = [item.split("=", 1)[1] for item in info["Config"]["Env"] if item.startswith("DATABASE_URL=")]
            if actual != [expected] or info["Image"] != images[service]["image"] or not info["State"]["Running"]:
                raise MigrationError("runtime database/image verification failed: " + service)
        self.phase("check_public_health")
        health, ready = {}, {}
        for attempt in range(12):
            try:
                with urlopen("https://" + domain + "/health", timeout=5) as response:
                    health = json.load(response)
                if health.get("success") is True:
                    break
            except (OSError, ValueError, HTTPError, URLError):
                pass
            time.sleep(2)
        if health.get("success") is not True:
            raise MigrationError("Oracle-configured application health check failed; do not repoint to stale Neon")
        self.phase("check_trading_readiness")
        for attempt in range(20):
            try:
                with urlopen("https://" + domain + "/api/v1/ready", timeout=5) as response:
                    ready = json.load(response)
            except HTTPError as error:
                try:
                    ready = json.loads(error.read(128 * 1024))
                except (OSError, ValueError):
                    pass
            except (OSError, ValueError):
                pass
            if ready.get("ready") is True:
                break
            if attempt % 5 == 4:
                print(json.dumps({"phase": "waiting_for_trading_readiness", "attempt": attempt + 1}), flush=True)
            time.sleep(2)
        self.state["ready"] = ready.get("ready") is True
        if self.state["ready"] and self.state["monitor_timer_active"]:
            self.systemctl("start", "stocksim-monitor.timer")
        self.state.update({"migrated": True, "runtime_database": "oracle_postgresql", "neon_project_deleted": False,
                           "off_vm_copy_of_final_backup_verified": False, "health": True})
        self.phase("complete")
        return {**self.state, "recovery_journal": str(self.record.relative_to(m.root) / "journal.json")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--sudo-docker", action="store_true")
    parser.add_argument("--remove-dhiraj-test-users", action="store_true", help="Delete screenshot IDs 1,3,6,15,16,17 and linked data only")
    parser.add_argument("--preflight-only", action="store_true", help="Check configuration and running services without pausing or switching production")
    args = parser.parse_args()
    migration = Migration(args.root, args.root / ".env", args.sudo_docker)
    cutover = DemoCutover(migration)
    try:
        (migration.root / "backups").mkdir(mode=0o700, exist_ok=True)
        with open(migration.root / "backups/.demo-cutover.lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.preflight_only:
                cutover.preflight()
                print(json.dumps({"preflight_passed": True, **cutover.state}))
            else:
                print(json.dumps(cutover.run(args.remove_dhiraj_test_users)))
        return 0
    except (MigrationError, OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError) as error:
        # Never render arbitrary exceptions: they may carry database credentials or rows.
        if isinstance(error, MigrationError):
            diagnostic = {"code": "guard_or_operation_failed", "reason": str(error)}
        elif isinstance(error, PermissionError):
            diagnostic = {"code": "file_permission_denied"}
        elif isinstance(error, FileNotFoundError):
            diagnostic = {"code": "file_or_executable_missing"}
        elif isinstance(error, subprocess.TimeoutExpired):
            diagnostic = {"code": "operation_timeout"}
        else:
            diagnostic = {"code": "invalid_configuration_or_operation", "error_type": type(error).__name__}
        print(json.dumps({"migrated": False, **cutover.state,
                          **diagnostic,
                          "recovery_journal": str(cutover.record.relative_to(migration.root) / "journal.json") if cutover.record else None,
                          "error": "Cutover stopped; keep backups and share this JSON. Do not manually switch databases or delete Neon."}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
