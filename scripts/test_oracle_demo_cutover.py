import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from oracle_demo_cutover import ACCOUNT_NAMES, DemoCutover, cleanup_sql
from oracle_postgres import Migration, MigrationError


class DemoCutoverTests(unittest.TestCase):
    def test_cleanup_is_transactional_and_checks_retained_rows(self):
        sql = cleanup_sql(["users", "wallets", "wallet_transactions", "instruments", "orders"], ["wallets", "orders"])
        self.assertTrue(sql.startswith("BEGIN;"))
        self.assertTrue(sql.endswith("COMMIT;"))
        self.assertIn("IN SHARE ROW EXCLUSIVE MODE", sql)
        self.assertIn("account identity guard failed", sql)
        self.assertIn("lower(u.email) LIKE 'dhiraj%'", sql)
        self.assertIn("retained rows changed", sql)
        self.assertLess(sql.index('DELETE FROM public."wallet_transactions"'), sql.index('DELETE FROM public."wallets"'))
        self.assertNotIn('DELETE FROM public."instruments"', sql)
        self.assertEqual(set(ACCOUNT_NAMES), {1, 3, 6, 15, 16, 17})

    def test_unknown_user_table_is_rejected_before_deletion(self):
        with self.assertRaises(MigrationError):
            cleanup_sql(["users", "wallets", "wallet_transactions", "new_user_data"], ["wallets", "new_user_data"])

    def test_missing_link_column_fails_closed(self):
        with self.assertRaises(MigrationError):
            cleanup_sql(["users", "wallets", "wallet_transactions", "orders"], ["wallets"])

    def test_already_local_source_never_stops_services(self):
        migration = Mock()
        migration.root = Path("/repo")
        migration.env_file = Path("/repo/.env")
        migration.source_url.side_effect = MigrationError("already local")
        with self.assertRaises(MigrationError):
            DemoCutover(migration).run(True)
        migration.compose.assert_not_called()

    def test_failed_snapshot_keeps_original_env_and_private_recovery_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = "DATABASE_URL=postgresql://secret@source/db\n"
            (root / ".env").write_text(original)
            migration = Migration(root, root / ".env")
            config = json.dumps({"services": {"caddy": {"environment": {"API_DOMAIN": "api.example.org"}}}})
            def compose(*args, **kwargs):
                return config if args[0] == "config" else ("" if args[0] == "stop" else "container")
            cutover = DemoCutover(migration)
            running = iter([True] * 6 + [False] * 4)
            def inspect(*args, **kwargs):
                return json.dumps([{"Image": "sha256:running", "State": {"Running": next(running)}}])
            with patch.object(migration, "prepare"), patch.object(migration, "source_url"), \
                 patch.object(migration, "compose", side_effect=compose), patch.object(migration, "run", side_effect=inspect), \
                 patch.object(cutover, "systemctl", return_value="inactive"), \
                 patch.object(migration, "stage", side_effect=MigrationError("snapshot failed")), \
                 patch.object(cutover, "runtime") as runtime:
                with self.assertRaises(MigrationError):
                    cutover.run(True)
            self.assertEqual((root / ".env").read_text(), original)
            self.assertEqual((cutover.record / "neon-fallback.env").read_text(), original)
            self.assertEqual((cutover.record / "neon-fallback.env").stat().st_mode & 0o777, 0o600)
            self.assertFalse(cutover.state["production_env_changed"])
            runtime.assert_not_called()
            self.assertEqual(json.loads((cutover.record / "journal.json").read_text())["phase"], "fresh_snapshot")

    def run_failure(self, failure):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = "DATABASE_URL=postgresql://original@remote/db\n"
            (root / ".env").write_text(original)
            migration = Migration(root, root / ".env")
            config = json.dumps({"services": {"caddy": {"environment": {"API_DOMAIN": "api.example.org"}}}})
            cutover = DemoCutover(migration)
            running = iter([True] * 6 + [False] * 4)
            def compose(*args, **kwargs):
                return config if args[0] == "config" else ("" if args[0] == "stop" else "container")
            def inspect(*args, **kwargs):
                return json.dumps([{"Image": "sha256:existing", "State": {"Running": next(running)}}])
            def candidate(bundle, output):
                output.write_text("DATABASE_URL=postgresql://local@postgres/stocksim_candidate_new\n")
            local = Mock()
            local.backup.return_value = {"bundle": "backups/cleaned"}
            with patch.object(migration, "prepare"), patch.object(migration, "source_url"), \
                 patch.object(migration, "compose", side_effect=compose), patch.object(migration, "run", side_effect=inspect), \
                 patch.object(cutover, "systemctl", return_value="inactive"), \
                 patch.object(migration, "stage", return_value={"bundle": "backups/final", "database": "stocksim_candidate_new"}), \
                 patch.object(migration, "validate_source"), patch.object(migration, "candidate_env", side_effect=candidate), \
                 patch("oracle_demo_cutover.cleanup", side_effect=MigrationError("identity mismatch") if failure == "cleanup" else None,
                       return_value={"other_data_unchanged": True}), \
                 patch("oracle_demo_cutover.Migration", return_value=local), \
                 patch.object(cutover, "host", side_effect=MigrationError("restore failed") if failure == "restore" else None,
                              return_value=json.dumps({"all_public_tables_match": True})), \
                 patch.object(cutover, "runtime", side_effect=MigrationError("startup failed")) as runtime:
                with self.assertRaises(MigrationError):
                    cutover.run(True)
            changed = failure == "startup"
            self.assertEqual(cutover.state["production_env_changed"], changed)
            self.assertEqual(cutover.state["application_start_attempted"], changed)
            if changed:
                self.assertIn("@postgres/", (root / ".env").read_text())
                runtime.assert_called_once()
            else:
                self.assertEqual((root / ".env").read_text(), original)
                runtime.assert_not_called()

    def test_cleanup_failure_never_installs_new_env(self):
        self.run_failure("cleanup")

    def test_independent_restore_failure_never_starts_apps(self):
        self.run_failure("restore")

    def test_after_start_attempt_failure_never_repoints_to_stale_neon(self):
        self.run_failure("startup")


if __name__ == "__main__":
    unittest.main()
