#!/usr/bin/env python3
"""Install only read-only VM health checks and local journal logs.

Uses existing Docker access and running Oracle config. Does not start, stop or
restart application containers, create backups, or configure remote alerts.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from oracle_postgres import Migration, MigrationError, ROOT
from production_addresses import primary_api_hostname

UNITS = ("stocksim-monitor.service", "stocksim-monitor.timer", "stocksim-alert.service")
DEFAULT_ROOT = "/home/ubuntu/stock-simulator-prod"
DEFAULT_URL = "https://api.stock-simulator.in/api/v1/ready"


class SetupError(RuntimeError):
    pass


def render_units(root, domain):
    if not re.fullmatch(r"/[A-Za-z0-9_./-]+", str(root)):
        raise SetupError("project path must not contain spaces or systemd expansion characters")
    result = {}
    for name in UNITS:
        content = (root / "deploy/oracle" / name).read_text()
        content = content.replace(DEFAULT_ROOT, str(root)).replace(DEFAULT_URL, "https://" + domain + "/api/v1/ready")
        if name == "stocksim-monitor.service" and ("--read-only" not in content or "--restart-worker" in content):
            raise SetupError("installer requires a read-only monitoring unit")
        result[name] = content
    return result


class Installer:
    def __init__(self, root):
        self.root = root.resolve()
        self.admin = [] if os.geteuid() == 0 else ["sudo", "-n"]
        self.phase = "preflight"

    def run(self, args, timeout=60):
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        if result.returncode:
            raise SetupError("monitoring setup failed during " + self.phase + "; raw diagnostics suppressed")
        return result.stdout.strip()

    def install(self):
        migration = Migration(self.root, self.root / ".env")
        migration.docker = self.admin + ["docker"]
        migration.source_url(allow_local=True)  # Guard against the wrong checkout/machine.
        config = json.loads(migration.compose("config", "--format", "json"))
        domain = primary_api_hostname(config["services"]["caddy"]["environment"]["API_DOMAIN"])
        units = render_units(self.root, domain)
        with tempfile.TemporaryDirectory(prefix="stocksim-monitor-") as directory:
            staging = Path(directory)
            for name, content in units.items():
                (staging / name).write_text(content)
            self.phase = "validate_units"
            self.run(["systemd-analyze", "verify", *[str(staging / name) for name in UNITS]])
            self.phase = "read_only_initial_check"
            self.run(self.admin + ["/usr/bin/python3", str(self.root / "scripts/check_production.py"),
                "--root", str(self.root), "--url", "https://" + domain + "/api/v1/ready", "--read-only",
                "--state", str(staging / "initial-state.json")])
            self.phase = "replace_monitor_units"
            available = self.run(["systemctl", "list-unit-files", "--no-legend", "--no-pager", *UNITS]).splitlines()
            loaded = [line.split()[0] for line in available if line.split() and line.split()[0] in UNITS[:2]]
            if loaded:
                self.run(self.admin + ["systemctl", "stop", *loaded])
            for name in UNITS:
                self.run(self.admin + ["install", "-m", "0644", str(staging / name), "/etc/systemd/system/" + name])
            self.run(self.admin + ["systemctl", "daemon-reload"])
            self.phase = "enable_read_only_monitor"
            self.run(self.admin + ["systemctl", "enable", "--now", "stocksim-monitor.timer"])
            self.run(self.admin + ["systemctl", "start", "stocksim-monitor.service"])
            active = self.run(["systemctl", "is-active", "stocksim-monitor.timer"]) == "active"
            if not active:
                raise SetupError("monitor timer is not active")
        return {"installed": True, "timer_active": True, "mode": "read_only", "interval": "one minute",
                "health_host": domain, "application_containers_changed": False,
                "backup_automation_enabled": False, "external_notifications_enabled": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    installer = Installer(args.root)
    try:
        print(json.dumps(installer.install()))
        return 0
    except (SetupError, MigrationError, OSError, RuntimeError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print(json.dumps({"installed": False, "phase": installer.phase, "application_containers_changed": False,
                          "error": "Monitoring setup stopped; share this JSON and inspect the monitor journal. Do not change the database."}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
