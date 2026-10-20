#!/usr/bin/env python3
"""Exercise the real PG18 snapshot/restore/verification path using disposable data.

No host ports, .env loading, production endpoints or live broker requests.
"""
import json
from pathlib import Path
import secrets
import shutil
import tempfile
import time

from oracle_postgres import Migration, MigrationError, ROOT, private_write
from verify_backup_restore import verify


FIXTURE = """
CREATE EXTENSION pgcrypto;
CREATE TABLE users (id bigserial PRIMARY KEY, name text NOT NULL);
CREATE TABLE wallets (id bigserial PRIMARY KEY, user_id bigint REFERENCES users(id), cash_balance_paise bigint NOT NULL, blocked_paise bigint NOT NULL CHECK (blocked_paise >= 0));
CREATE TABLE orders (id bigserial PRIMARY KEY, user_id bigint REFERENCES users(id), intent_key text, status text);
CREATE UNIQUE INDEX idx_order_intent_key ON orders(user_id,intent_key);
CREATE TABLE trades (id bigserial PRIMARY KEY, value_paise bigint);
CREATE TABLE positions (id bigserial PRIMARY KEY, quantity bigint);
CREATE TABLE wallet_transactions (id bigserial PRIMARY KEY, amount_paise bigint);
CREATE TABLE instrument_snapshots (id bigserial PRIMARY KEY, version text);
CREATE TABLE instruments (id bigserial PRIMARY KEY, symbol text);
INSERT INTO users(name) VALUES ('learner'), ('सीखने वाला');
INSERT INTO wallets(user_id,cash_balance_paise,blocked_paise) VALUES (1,100000001,100), (2,99999999,0);
INSERT INTO orders(user_id,intent_key,status) VALUES (1,'intent-1','OPEN');
INSERT INTO positions(quantity) VALUES (7);
INSERT INTO trades(value_paise) VALUES (1234567890123);
INSERT INTO wallet_transactions(amount_paise) VALUES (-12345);
INSERT INTO instruments(symbol) VALUES ('RELIANCE-EQ');
"""


def main():
    source_name = "stocksim-pg-source-" + secrets.token_hex(6)
    with tempfile.TemporaryDirectory(prefix="stocksim-pg-smoke-") as directory:
        root = Path(directory)
        overlay = root / "deploy/oracle"
        (overlay / "postgres").mkdir(parents=True)
        shutil.copy(ROOT / "deploy/oracle/docker-compose.postgres.yml", overlay)
        shutil.copy(ROOT / "deploy/oracle/postgres/init-app.sh", overlay / "postgres")
        password = secrets.token_hex(24)
        private_write(root / ".env", "DATABASE_URL=postgresql://postgres:" + password + "@" + source_name + ":5432/postgres?sslmode=disable\n")
        (root / "docker-compose.prod.yml").write_text("""services:
  backend:
    image: postgres:18-bookworm
    environment:
      DATABASE_URL: ${DATABASE_URL:?required}
    networks: [stock_sim_net]
networks:
  stock_sim_net:
""")
        migration = Migration(root, root / ".env")
        source_env = root / "source.env"
        private_write(source_env, "POSTGRES_PASSWORD=" + password + "\n")
        try:
            container = migration.start_database()
            network = next(iter(json.loads(migration.run(["inspect", container]))[0]["NetworkSettings"]["Networks"]))
            migration.run(["run", "--detach", "--name", source_name, "--network", network,
                           "--env-file", str(source_env), "postgres:18-bookworm"])
            for _ in range(90):
                try:
                    migration.run(["exec", source_name, "pg_isready", "-U", "postgres"])
                    break
                except MigrationError:
                    time.sleep(1)
            else:
                raise RuntimeError("disposable source failed to start")
            migration.target_sql(source_name, "postgres", FIXTURE)
            original = (root / ".env").read_text()
            run = migration.run
            concurrent_write = []
            def during_dump(args, **kwargs):
                if "pg_dump" in args and not concurrent_write:
                    concurrent_write.append(True)
                    migration.target_sql(source_name, "postgres", "UPDATE wallets SET cash_balance_paise=cash_balance_paise+100 WHERE id=1;")
                return run(args, **kwargs)
            migration.run = during_dump
            result = migration.stage()
            assert concurrent_write and result["accounting_content_matches"]
            bundle = root / result["bundle"]
            assert (root / ".env").read_text() == original
            migration.candidate_env(bundle, root / ".env.oracle-candidate")
            # Persistent volume survives an actual stop/start of the database.
            migration.compose("stop", "postgres")
            migration.start_database()
            assert migration.verify(bundle)["verified"]
            manifest = json.loads((bundle / "manifest.json").read_text())
            assert verify(bundle / "source.dump", postgres_major=18, manifest=manifest)["all_public_tables_match"]
            database = result["database"]
            migration.target_sql(container, database, "UPDATE wallets SET cash_balance_paise=0 WHERE id=1;")
            try:
                migration.verify(bundle)
            except MigrationError:
                pass
            else:
                raise AssertionError("modified balances incorrectly verified")
            print(json.dumps({"postgres_major": 18, "snapshot_during_concurrent_write": True,
                              "persistent_restart": True, "independent_restore": True,
                              "tampered_balance_rejected": True, "production_config_unchanged": True}))
        finally:
            migration.run(["rm", "--force", "--volumes", source_name])
            migration.compose("down", "--volumes", "--remove-orphans")


if __name__ == "__main__":
    main()
