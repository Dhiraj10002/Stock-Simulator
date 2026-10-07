import unittest
from check_production import recovery_decision, operational
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
