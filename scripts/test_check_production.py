import unittest
import io
import json
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch

from check_production import recovery_decision, operational, compose_command, inspect, main
class RecoveryTests(unittest.TestCase):
    def test_requires_three_failures_and_cooldown(self):
        states = {"market-worker": {"health": "unhealthy"}}
        self.assertFalse(recovery_decision(states, False, {"failures": 1}, 1000)[1])
        self.assertTrue(recovery_decision(states, False, {"failures": 2}, 1000)[1])
        self.assertFalse(recovery_decision(states, False, {"failures": 5, "last_restart": 900}, 1000)[1])
    def test_does_not_restart_healthy_worker_or_unhealthy_proxy(self):
        self.assertFalse(recovery_decision({"market-worker": {"health": "healthy"}}, False, {"failures": 5}, 1000)[1])
        self.assertFalse(recovery_decision({"market-worker": {"health": "unhealthy"}, "broker-proxy": {"health": "unhealthy"}}, False, {"failures": 5}, 1000)[1])
    def test_known_proxy_failure_does_not_restart_worker(self):
        self.assertFalse(recovery_decision({"market-worker": {"health": "unhealthy", "broker_proxy_unavailable": True}}, False, {"failures": 5}, 1000)[1])
    def test_success_resets_failures(self):
        state, restart = recovery_decision({}, True, {"failures": 5}, 1000)
        self.assertEqual(state["failures"], 0)
        self.assertFalse(restart)

class MonitorAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.states = {name: {"state": "running", "health": "healthy"} for name in ("backend", "caddy", "market-worker", "redis")}
    def test_requires_readiness_and_running_services(self):
        self.assertTrue(operational(self.states, {"ready": True}))
        self.assertFalse(operational(self.states, {"ready": False}))
        self.states["market-worker"]["health"] = "unhealthy"
        self.assertFalse(operational(self.states, {"ready": True}))
    def test_missing_worker_and_invalid_response_fail_closed(self):
        self.states.pop("market-worker")
        self.assertFalse(operational(self.states, {"ready": True}))
        self.assertFalse(operational(self.states, []))
    def test_proxy_outage_is_unavailable_without_worker_restart(self):
        self.states["broker-proxy"] = {"state": "running", "health": "unhealthy"}
        self.assertFalse(operational(self.states, {"ready": True}))
        self.assertFalse(recovery_decision(self.states, False, {"failures": 8}, 2000)[1])

    def test_oracle_requires_postgres_even_when_api_claims_ready(self):
        self.assertFalse(operational(self.states, {"ready": True}, require_postgres=True))
        self.states["postgres"] = {"state": "running", "health": "unhealthy"}
        self.assertFalse(operational(self.states, {"ready": True}, require_postgres=True))
        self.states["postgres"]["health"] = "healthy"
        self.assertTrue(operational(self.states, {"ready": True}, require_postgres=True))


class ReadOnlyMonitorTests(unittest.TestCase):
    def test_oracle_compose_overlay_is_included_without_exposing_env(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text("DATABASE_URL=private-secret\nORACLE_POSTGRES_ENABLED=true\n")
            command, local = compose_command(root)
            self.assertTrue(local)
            self.assertIn(str(root / ".env.oracle-db"), command)
            self.assertIn(str(root / "deploy/oracle/docker-compose.postgres.yml"), command)
            self.assertNotIn("private-secret", " ".join(command))

    def probe(self, payload, http_status=200, missing_postgres=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text("ORACLE_POSTGRES_ENABLED=true\n")
            services = ["backend", "caddy", "market-worker", "redis"] + ([] if missing_postgres else ["postgres"])
            rows = [{"Name": "prod-" + name + "-1", "Service": name, "State": "running", "Health": "healthy"} for name in services]
            rows.append({"Name": "prod-backend-run-old", "Service": "backend", "State": "exited", "Health": ""})
            responses = [subprocess.CompletedProcess([], 0, json.dumps(rows), ""),
                         subprocess.CompletedProcess([], 0, json.dumps(payload) + "\n" + str(http_status), "")]
            with patch("check_production.subprocess.run", side_effect=responses) as run:
                result = inspect(root, "https://api.valid.test/api/v1/ready")
            curl = run.call_args_list[1].args[0]
            self.assertNotIn("-k", curl)
            self.assertNotIn("--insecure", curl)
            return result

    def test_holiday_response_is_ready_and_logs_exclude_raw_errors(self):
        payload = {"ready": True, "services": {"database": {"status": "UP", "error": "postgresql://secret@private/db"},
                   "calendar": {"status": "UP", "market_state": "HOLIDAY"}, "market_feed": {"last_tick_age_seconds": 105625}}}
        _, states, ready, api = self.probe(payload)
        self.assertTrue(ready)
        self.assertEqual(states["backend"]["state"], "running")
        self.assertEqual(api["services"]["calendar"]["market_state"], "HOLIDAY")
        self.assertNotIn("secret", json.dumps(api))

    def test_missing_database_and_http_error_fail_closed(self):
        self.assertFalse(self.probe({"ready": True}, missing_postgres=True)[2])
        self.assertFalse(self.probe({"ready": True}, http_status=503)[2])
        self.assertFalse(self.probe([])[2])

    def test_read_only_mode_never_restarts_an_unhealthy_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            state.write_text('{"failures": 8}')
            args = ["monitor", "--url", "https://api.valid.test/ready", "--state", str(state), "--read-only"]
            services = {"market-worker": {"state": "running", "health": "unhealthy"}}
            output = io.StringIO()
            with patch("sys.argv", args), patch("check_production.inspect", return_value=(["docker"], services, False, {})), \
                 patch("check_production.subprocess.run") as run, patch("sys.stdout", output):
                self.assertEqual(main(), 1)
            run.assert_not_called()
            result = json.loads(output.getvalue())
            self.assertEqual(result["mode"], "read_only")
            self.assertFalse(result["worker_restarted"])
            self.assertEqual(result["consecutive_failures"], 9)

    def test_read_only_rejects_recovery_flag_before_docker_access(self):
        with patch("sys.argv", ["monitor", "--url", "https://api.valid.test/ready", "--read-only", "--restart-worker"]), \
             patch("check_production.inspect") as read, patch("sys.stderr", io.StringIO()):
            with self.assertRaises(SystemExit):
                main()
        read.assert_not_called()
