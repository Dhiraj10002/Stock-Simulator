import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from oracle_postgres import Migration, MigrationError, compare_manifest, manifest_sql, private_write


class OracleMigrationTests(unittest.TestCase):
    def test_manifest_detects_changed_balances_even_when_counts_match(self):
        expected = {"tables": {"public.wallets": {"rows": 2, "digest": "before"}},
                    "catalog": {"indexes": [], "constraints": [], "extensions": []}}
        with self.assertRaises(MigrationError):
            compare_manifest(expected, {"public.wallets": {"rows": 2, "digest": "after"}}, expected["catalog"])

    def test_manifest_rejects_missing_empty_table_and_changed_constraints(self):
        expected = {"tables": {"public.positions": {"rows": 0, "digest": "empty"}},
                    "catalog": {"indexes": [], "constraints": ["unique"], "extensions": []}}
        with self.assertRaises(MigrationError):
            compare_manifest(expected, {}, expected["catalog"])
        with self.assertRaises(MigrationError):
            compare_manifest(expected, expected["tables"], {**expected["catalog"], "constraints": []})

    def test_private_files_are_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "secret.env"
            private_write(file, "existing")
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                private_write(file, "replacement")
            self.assertEqual(file.read_text(), "existing")

    def test_prepare_keeps_existing_password_and_production_env(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / ".env"
            source.write_text("DATABASE_URL=postgresql://original\n")
            migration = Migration(root, source)
            with patch.object(migration, "compose", return_value=""):
                migration.prepare()
                secret = migration.secret_file.read_text()
                migration.prepare()
            self.assertEqual(secret, migration.secret_file.read_text())
            self.assertEqual(source.read_text(), "DATABASE_URL=postgresql://original\n")
            self.assertEqual(migration.secret_file.stat().st_mode & 0o777, 0o600)

    def test_prepare_rejects_readable_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").touch()
            secret = root / ".env.oracle-db"
            secret.write_text("ORACLE_PG_ADMIN_PASSWORD=old")
            secret.chmod(0o644)
            with self.assertRaises(MigrationError):
                Migration(root, root / ".env").prepare()

    def test_refuses_dump_from_local_database_or_mismatched_running_backend(self):
        migration = Migration(Path("/repo"), Path("/repo/.env"))
        config = {"services": {"backend": {"environment": {"DATABASE_URL": "postgresql://u:p@postgres/db"}}}}
        with patch.object(migration, "compose", return_value=json.dumps(config)):
            with self.assertRaises(MigrationError):
                migration.source_url()
        config["services"]["backend"]["environment"]["DATABASE_URL"] = "postgresql://u:p@source/db"
        with patch.object(migration, "compose", side_effect=[json.dumps(config), "running-backend"]), \
             patch.object(migration, "run", return_value=json.dumps([{"Config": {"Env": ["DATABASE_URL=other"]}}])):
            with self.assertRaises(MigrationError):
                migration.source_url()

    def test_candidate_env_is_explicit_private_and_never_changes_original(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = "JWT_SECRET=unchanged\nDATABASE_URL=postgresql://source-secret@remote/db\n"
            (root / ".env").write_text(original)
            migration = Migration(root, root / ".env")
            result = {"database": "stocksim_candidate_test"}
            config = {"services": {"postgres": {"environment": {"STOCKSIM_APP_PASSWORD": "a" * 64}}}}
            output = root / ".env.oracle-candidate"
            with patch.object(migration, "verify", return_value=result), \
                 patch.object(migration, "compose", return_value=json.dumps(config)):
                migration.candidate_env(root, output)
                with self.assertRaises(FileExistsError):
                    migration.candidate_env(root, output)
            self.assertEqual((root / ".env").read_text(), original)
            self.assertNotIn("source-secret", output.read_text())
            self.assertIn("JWT_SECRET=unchanged", output.read_text())
            self.assertIn("ORACLE_POSTGRES_ENABLED=true", output.read_text())
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)

    def test_manifest_quotes_database_identifiers(self):
        sql = manifest_sql(['a"b', "normal"])
        self.assertIn('public."a""b"', sql)
        self.assertIn('COLLATE "C"', sql)
        with self.assertRaises(MigrationError):
            manifest_sql([])

    def test_unapproved_database_name_rejected_before_queries(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "manifest.json").write_text(json.dumps({"database": "production"}))
            migration = Migration(folder, folder / ".env")
            with patch.object(migration, "target_sql") as query:
                with self.assertRaises(MigrationError):
                    migration.verify(folder)
                query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
