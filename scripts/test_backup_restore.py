import tempfile
import unittest
import contextlib
import io
import json
import subprocess
from pathlib import Path
from unittest.mock import patch
from verify_backup_restore import RestoreFailure, command, main, verify

class BackupIsolationTests(unittest.TestCase):
    def test_docker_failure_reports_safe_stage_without_sql_values_or_secrets(self):
        diagnostic = "Cannot connect to the Docker daemon. secret-password customer-row-data"
        failed = subprocess.CompletedProcess([], 125, "private stdout", diagnostic)
        with patch("verify_backup_restore.subprocess.run", return_value=failed):
            with self.assertRaises(RestoreFailure) as raised:
                command(["docker", "run"], stage="container_start")
        self.assertEqual(raised.exception.stage, "container_start")
        self.assertEqual(raised.exception.code, "docker_unavailable")
        self.assertNotIn("secret-password", str(raised.exception))
        self.assertNotIn("customer-row-data", str(raised.exception))

    def test_container_start_timeout_is_distinguished_from_a_restore_error(self):
        with patch("verify_backup_restore.subprocess.run", side_effect=subprocess.TimeoutExpired("private-command", 300)):
            with self.assertRaises(RestoreFailure) as raised:
                command(["docker", "run"], timeout=300, stage="container_start")
        self.assertEqual(raised.exception.code, "command_timeout")
        self.assertEqual(raised.exception.stage, "container_start")

    def test_cli_emits_only_curated_error_fields(self):
        with patch("sys.argv", ["verify_backup_restore.py", "backup.dump"]), \
             patch("verify_backup_restore.verify", side_effect=RestoreFailure("database_restore", "command_failed", 1)), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(main(), 1)
        result = json.loads(output.getvalue())
        self.assertEqual(result["stage"], "database_restore")
        self.assertEqual(result["code"], "command_failed")
        self.assertFalse(result["restored"])

    def test_file_copy_failure_preserves_backup_and_cleans_disposable_container(self):
        with tempfile.TemporaryDirectory() as folder, patch("verify_backup_restore.command", side_effect=["container", RestoreFailure("backup_copy", "command_failed")]) as run_command, \
             patch("verify_backup_restore.subprocess.run") as cleanup:
            backup = Path(folder) / "backup.dump"
            backup.write_bytes(b"PGDMPfixture")
            with self.assertRaises(RestoreFailure) as raised:
                verify(backup, postgres_major=18)
            self.assertEqual(raised.exception.stage, "backup_copy")
            self.assertEqual(backup.read_bytes(), b"PGDMPfixture")
            # A host backup is never relabeled, modified or bind-mounted.
            start = run_command.call_args_list[0].args[0]
            self.assertNotIn("--mount", start)
            self.assertEqual(run_command.call_args_list[1].args[0][:2], ["docker", "cp"])
            self.assertEqual(cleanup.call_args.args[0][:3], ["docker", "rm", "--force"])

    def test_checksum_mismatch_stops_before_docker(self):
        with tempfile.TemporaryDirectory() as folder, patch("verify_backup_restore.subprocess.run") as run:
            backup = Path(folder) / "backup.dump"
            backup.write_bytes(b"PGDMPdamaged")
            with self.assertRaisesRegex(RuntimeError, "checksum"):
                verify(backup, postgres_major=18, manifest={"dump_sha256": "wrong"})
            run.assert_not_called()

    def test_rejects_plain_sql_without_starting_docker(self):
        with tempfile.TemporaryDirectory() as folder, patch("verify_backup_restore.subprocess.run") as run:
            backup = Path(folder) / "backup.dump"
            backup.write_bytes(b"DROP DATABASE production;")
            with self.assertRaises(ValueError):
                verify(backup)
            run.assert_not_called()

    def test_removes_disposable_container_when_restore_fails(self):
        with tempfile.TemporaryDirectory() as folder, patch("verify_backup_restore.command", side_effect=RuntimeError("failed")), patch("verify_backup_restore.subprocess.run") as run:
            backup = Path(folder) / "backup.dump"
            backup.write_bytes(b"PGDMP")
            with self.assertRaises(RuntimeError):
                verify(backup)
            args = run.call_args.args[0]
            self.assertEqual(args[:3], ["docker", "rm", "--force"])
            self.assertIn("--volumes", args)
            self.assertTrue(args[-1].startswith("stocksim-restore-"))
