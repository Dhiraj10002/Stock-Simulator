import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from install_monitoring import Installer, SetupError, render_units, UNITS
from oracle_postgres import ROOT, Migration, MigrationError


class InstallMonitoringTests(unittest.TestCase):
    def test_render_preserves_read_only_and_uses_primary_domain(self):
        units = render_units(ROOT, "api.stock-simulator.in")
        service = units["stocksim-monitor.service"]
        self.assertIn("--read-only", service)
        self.assertNotIn("--restart-worker", service)
        self.assertIn("StandardOutput=journal", service)
        self.assertIn("StateDirectoryMode=0700", service)
        self.assertIn(str(ROOT / "scripts/check_production.py"), service)
        self.assertEqual(set(units), set(UNITS))

    def test_bad_project_path_is_rejected_before_writing_units(self):
        with self.assertRaises(SetupError):
            render_units(Path("/project/%n"), "api.valid.test")

    def test_wrong_machine_or_database_is_rejected_before_admin_operations(self):
        installer = Installer(ROOT)
        with patch.object(Migration, "source_url", side_effect=MigrationError("not Oracle")), \
             patch.object(installer, "run") as run:
            with self.assertRaises(MigrationError):
                installer.install()
        run.assert_not_called()

    def test_failed_initial_check_does_not_install_or_enable_services(self):
        installer = Installer(ROOT)
        config = json.dumps({"services": {"caddy": {"environment": {"API_DOMAIN": "api.stock-simulator.in, stocksim-api.duckdns.org"}}}})
        def run(args, **kwargs):
            if "check_production.py" in " ".join(args):
                raise SetupError("health unavailable")
            return ""
        with patch.object(Migration, "source_url"), patch.object(Migration, "compose", return_value=config), \
             patch.object(installer, "run", side_effect=run) as commands:
            with self.assertRaises(SetupError):
                installer.install()
        self.assertFalse(any("install" in call.args[0] or "enable" in call.args[0] for call in commands.call_args_list))

    def test_repeat_install_replaces_same_units_without_application_mutation(self):
        installer = Installer(ROOT)
        config = json.dumps({"services": {"caddy": {"environment": {"API_DOMAIN": "api.stock-simulator.in, stocksim-api.duckdns.org"}}}})
        installed = {}
        commands = []
        def run(args, **kwargs):
            commands.append(args)
            if "install" in args:
                installed[args[-1]] = Path(args[-2]).read_text()
            if "is-active" in args:
                return "active"
            if "list-unit-files" in args:
                return "stocksim-monitor.timer enabled enabled\nstocksim-monitor.service static -"
            return ""
        with patch.object(Migration, "source_url"), patch.object(Migration, "compose", return_value=config), \
             patch.object(installer, "run", side_effect=run):
            self.assertTrue(installer.install()["timer_active"])
            first = dict(installed)
            self.assertTrue(installer.install()["timer_active"])
        self.assertEqual(installed, first)
        self.assertEqual(len(installed), 3)
        self.assertFalse(any("restart" in args for args in commands))
        self.assertFalse(any("--restart-worker" in args for args in commands))
        self.assertFalse(any("oracle_postgres.py" in " ".join(args) for args in commands))


if __name__ == "__main__":
    unittest.main()
