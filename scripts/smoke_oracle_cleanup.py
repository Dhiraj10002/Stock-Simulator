"""Real PG18 cleanup acceptance using fictional accounts in a disposable DB."""
import json

from oracle_demo_cutover import cleanup
from oracle_postgres import MigrationError, manifest_sql


def exercise_cleanup(migration, container):
    database = "stocksim_candidate_cleanup_smoke"
    migration.target_sql(container, "postgres", 'CREATE DATABASE "' + database + '";')
    fixture = """
    CREATE TABLE users(id bigint PRIMARY KEY, uuid uuid UNIQUE NOT NULL, name text, email text);
    CREATE TABLE wallets(uuid uuid PRIMARY KEY, user_uuid uuid REFERENCES users(uuid), cash_balance_paise bigint);
    CREATE TABLE wallet_transactions(wallet_uuid uuid REFERENCES wallets(uuid), amount_paise bigint);
    CREATE TABLE orders(uuid uuid PRIMARY KEY, user_uuid uuid REFERENCES users(uuid));
    CREATE TABLE trades(user_uuid uuid REFERENCES users(uuid), order_uuid uuid REFERENCES orders(uuid));
    CREATE TABLE positions(user_uuid uuid REFERENCES users(uuid));
    CREATE TABLE watchlist_items(user_uuid uuid REFERENCES users(uuid), symbol text);
    CREATE TABLE refresh_sessions(user_uuid uuid REFERENCES users(uuid), token_hash text);
    CREATE TABLE risk_events(user_uuid uuid REFERENCES users(uuid));
    CREATE TABLE simulation_resets(user_uuid uuid REFERENCES users(uuid));
    CREATE TABLE account_daily_snapshots(user_uuid uuid REFERENCES users(uuid));
    CREATE TABLE instruments(symbol text);
    INSERT INTO instruments VALUES ('PRESERVE-MASTER');
    INSERT INTO users SELECT id, lpad(id::text,32,'0')::uuid, name, 'dhiraj-test-'||id||'@example.invalid'
      FROM (VALUES (1,'Dhiraj Gupta'),(3,'dhiraj'),(6,'dhiraj'),(15,'DHIRAJGUPTA'),(16,'Dhiraj'),(17,'dj')) u(id,name);
    INSERT INTO users VALUES (13,lpad('13',32,'0')::uuid,'Preserve other account','other@example.invalid');
    INSERT INTO wallets SELECT uuid,uuid,10000000+id FROM users;
    INSERT INTO wallet_transactions SELECT uuid,123 FROM wallets;
    INSERT INTO orders SELECT uuid,uuid FROM users;
    INSERT INTO trades SELECT user_uuid,uuid FROM orders;
    INSERT INTO positions SELECT uuid FROM users;
    INSERT INTO watchlist_items SELECT uuid,'TCS' FROM users;
    INSERT INTO refresh_sessions SELECT uuid,'fictional-session' FROM users;
    INSERT INTO risk_events SELECT uuid FROM users;
    INSERT INTO simulation_resets SELECT uuid FROM users;
    INSERT INTO account_daily_snapshots SELECT uuid FROM users;
    """
    migration.target_sql(container, database, fixture)
    # Reusing an ID for another identity MUST roll back without altering anything.
    migration.target_sql(container, database, "UPDATE users SET name='Another person' WHERE id=1;")
    before = migration.target_sql(container, database, manifest_sql(["users", "wallets", "orders", "trades", "wallet_transactions"]))
    try:
        cleanup(migration, container, database)
    except MigrationError:
        pass
    else:
        raise AssertionError("identity mismatch was deleted")
    assert migration.target_sql(container, database, manifest_sql(["users", "wallets", "orders", "trades", "wallet_transactions"])) == before
    migration.target_sql(container, database, "UPDATE users SET name='Dhiraj Gupta' WHERE id=1;")
    # An unexpected cascade into a protected table must roll the entire delete back.
    migration.target_sql(container, database, "CREATE TABLE extra_reference(id int PRIMARY KEY,owner_uuid uuid REFERENCES users(uuid) ON DELETE CASCADE); INSERT INTO extra_reference SELECT 1,uuid FROM users WHERE id=1;")
    try:
        cleanup(migration, container, database)
    except MigrationError:
        pass
    else:
        raise AssertionError("unexpected cascade was not rolled back")
    assert migration.target_sql(container, database, "SELECT count(*) FROM users;") == "7"
    assert migration.target_sql(container, database, "SELECT count(*) FROM extra_reference;") == "1"
    migration.target_sql(container, database, "DELETE FROM extra_reference;")
    result = cleanup(migration, container, database)
    assert result["deleted_rows"]["users"] == 6 and result["other_data_unchanged"]
    for table in result["deleted_rows"]:
        assert migration.target_sql(container, database, 'SELECT count(*) FROM "' + table + '";') == "1"
    assert migration.target_sql(container, database, "SELECT id FROM users;") == "13"
    assert migration.target_sql(container, database, "SELECT symbol FROM instruments;") == "PRESERVE-MASTER"
    print(json.dumps({"cleanup_six_accounts": True, "other_accounts_and_master_preserved": True,
                      "identity_mismatch_rolled_back": True, "unexpected_cascade_rolled_back": True}))
