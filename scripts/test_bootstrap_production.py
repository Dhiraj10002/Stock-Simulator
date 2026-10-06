"""Regression checks for production ordering and stopping on failed prerequisites."""

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("bootstrap_production", Path(__file__).with_name("bootstrap_production.py"))
BOOTSTRAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOOTSTRAP)


class ProductionBootstrapTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.env_file = Path(temp.name) / ".env"
        self.env_file.write_text("JWT_SECRET=private-test-value-not-for-output\n")
        self.calls = []
        self.master = {"data": {"status": "ACTIVE", "active_version": "test-master",
                                "activated_at": "2026-10-06T00:00:00Z", "total_instruments": 100}}
        self.wait = patch.object(BOOTSTRAP, "wait_json", side_effect=self.wait_json).start()
        self.addCleanup(patch.stopall)
        patch.object(BOOTSTRAP, "fetch_json", side_effect=self.fetch_json).start()
        patch.object(BOOTSTRAP.subprocess, "run", side_effect=self.compose_run).start()

    def compose_run(self, command, **kwargs):
        self.calls.append(command)
        self.assertEqual(kwargs["env"]["PRODUCTION_ENV_FILE"], str(self.env_file))
        if "config" in command:
            self.assertTrue(kwargs["capture_output"])
            config = {"services": {"caddy": {"environment": {"API_DOMAIN": "api.trading.test"}}}}
            return subprocess.CompletedProcess(command, 0, json.dumps(config), "")
        return subprocess.CompletedProcess(command, 0, "", "")

    def wait_json(self, url, predicate, timeout):
        self.calls.append(url)
        body = {"success": True} if url.endswith("/health") else {"ready": True}
        self.assertTrue(predicate(body))
        return body

    def fetch_json(self, url):
        self.calls.append(url)
        return self.master

    def worker_starts(self):
        return [call for call in self.calls if isinstance(call, list) and "market-worker" in call]

    def test_first_boot_activates_master_before_workers_and_readiness(self):
        BOOTSTRAP.bootstrap(self.env_file, sync_master=True, timeout=5)
        first_up = next(call for call in self.calls if isinstance(call, list) and "up" in call)
        self.assertEqual(first_up[-3:], ["redis", "backend", "caddy"])
        self.assertIn("--wait", first_up)
        sync = next(call for call in self.calls if isinstance(call, list) and "/sync-instruments" in call)
        workers = self.worker_starts()[0]
        self.assertLess(self.calls.index(sync), self.calls.index(workers))
        self.assertLess(self.calls.index("https://api.trading.test/api/v1/instruments/master/status"), self.calls.index(workers))
        self.assertGreater(self.calls.index("https://api.trading.test/ready"), self.calls.index(workers))

    def test_existing_activation_does_not_resync_on_each_deployment(self):
        BOOTSTRAP.bootstrap(self.env_file, timeout=5)
        self.assertFalse(any(isinstance(call, list) and "/sync-instruments" in call for call in self.calls))
        self.assertEqual(len(self.worker_starts()), 1)

    def test_missing_master_stops_before_workers(self):
        self.master["data"]["activated_at"] = None
        with self.assertRaisesRegex(RuntimeError, "--sync-master"):
            BOOTSTRAP.bootstrap(self.env_file, timeout=5)
        self.assertEqual(self.worker_starts(), [])

    def test_failed_sync_stops_before_workers(self):
        original = self.compose_run

        def failed_sync(command, **kwargs):
            if "/sync-instruments" in command:
                raise subprocess.CalledProcessError(1, command)
            return original(command, **kwargs)

        with patch.object(BOOTSTRAP.subprocess, "run", side_effect=failed_sync):
            with self.assertRaises(subprocess.CalledProcessError):
                BOOTSTRAP.bootstrap(self.env_file, sync_master=True, timeout=5)
        self.assertEqual(self.worker_starts(), [])

    def test_backend_health_failure_stops_before_sync_or_workers(self):
        self.wait.side_effect = RuntimeError("health timeout")
        with self.assertRaisesRegex(RuntimeError, "health timeout"):
            BOOTSTRAP.bootstrap(self.env_file, sync_master=True, timeout=5)
        self.assertEqual(self.worker_starts(), [])
        self.assertFalse(any(isinstance(call, list) and "/sync-instruments" in call for call in self.calls))

    def test_ready_timeout_is_not_reported_as_success(self):
        original = self.wait_json

        def failed_ready(url, predicate, timeout):
            if url.endswith("/ready"):
                raise RuntimeError("ready timeout")
            return original(url, predicate, timeout)

        self.wait.side_effect = failed_ready
        with self.assertRaisesRegex(RuntimeError, "ready timeout"):
            BOOTSTRAP.bootstrap(self.env_file, timeout=5)

    def test_missing_env_file_runs_no_containers(self):
        with self.assertRaisesRegex(RuntimeError, "env file is missing"):
            BOOTSTRAP.bootstrap(self.env_file.with_name("absent"))
        self.assertEqual(self.calls, [])


class ReadinessWaitTest(unittest.TestCase):
    def test_503_is_retried_until_ready(self):
        error = BOOTSTRAP.HTTPError("https://api.test/ready", 503, "unavailable", {}, None)
        with patch.object(BOOTSTRAP, "fetch_json", side_effect=[error, {"ready": False}, {"ready": True}]), patch.object(BOOTSTRAP.time, "sleep"):
            body = BOOTSTRAP.wait_json("https://api.test/ready", lambda body: body.get("ready") is True, 5)
        self.assertTrue(body["ready"])

    def test_503_eventually_times_out(self):
        error = BOOTSTRAP.HTTPError("https://api.test/ready", 503, "unavailable", {}, None)
        with patch.object(BOOTSTRAP, "fetch_json", side_effect=error), patch.object(BOOTSTRAP.time, "monotonic", side_effect=[0, 6]):
            with self.assertRaisesRegex(RuntimeError, "Timed out"):
                BOOTSTRAP.wait_json("https://api.test/ready", lambda body: body.get("ready") is True, 5)


if __name__ == "__main__":
    unittest.main()
