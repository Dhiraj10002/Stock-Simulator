import unittest
from check_production import recovery_decision
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
