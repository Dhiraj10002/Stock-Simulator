import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from verify_backup_restore import verify

class BackupIsolationTests(unittest.TestCase):
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
            self.assertTrue(args[3].startswith("stocksim-restore-"))
