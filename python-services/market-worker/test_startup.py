"""Health must remain reachable while canonical loading or login is blocked."""
import http.client
import json
import os
import threading
import unittest
from unittest.mock import MagicMock, patch

from test_worker import worker


class StopBootstrap(BaseException):
    pass


class StartupLivenessTest(unittest.TestCase):
    def check_blocked_bootstrap(self, phase):
        entered, release = threading.Event(), threading.Event()
        real_thread = threading.Thread
        store = MagicMock(master_version="")
        client = MagicMock()
        writer = MagicMock(client=client)
        feed = {}
        client.hset.side_effect = lambda _key, mapping: feed.update(mapping)
        client.hgetall.side_effect = lambda _key: dict(feed)
        heartbeat_started = threading.Event()
        failure = []

        def blocked():
            entered.set()
            if not release.wait(5):
                failure.append("test did not release bootstrap")
            raise StopBootstrap()

        def refresh():
            if phase == "master":
                return blocked()
            store.master_version = "fixture-master"
            return True

        def thread_factory(*args, **kwargs):
            target = kwargs.get("target")
            if target and target.__name__ == "heartbeat":
                # Write one heartbeat without leaking the permanent daemon loop.
                thread = MagicMock()
                def start():
                    worker.write_worker_heartbeat(client, store)
                    heartbeat_started.set()
                thread.start.side_effect = start
                return thread
            return real_thread(*args, **kwargs)

        def run():
            try:
                worker.main()
            except StopBootstrap:
                pass
            except BaseException as error:
                failure.append(type(error).__name__)

        with patch.dict(os.environ, {"MARKET_FEED_MODE":"live", "MARKET_SYMBOLS":"NIFTY", "QUOTE_SERVER_HOST":"127.0.0.1", "QUOTE_SERVER_PORT":"0"}), \
             patch.object(worker, "GLOBAL_WRITER", None), patch.object(worker, "GLOBAL_SMART_API", None), \
             patch.object(worker, "GLOBAL_TOKEN_MAP", {}), patch.object(worker, "GLOBAL_QUOTE_SERVER", None), \
             patch.object(worker.redis, "from_url", return_value=client), \
             patch.object(worker, "InstrumentStore", return_value=store), patch.object(worker, "QuoteWriter", return_value=writer), \
             patch.object(worker, "load_canonical_aliases"), patch.object(worker, "init_global_token_map"), \
             patch.object(store, "refresh", side_effect=refresh), \
             patch.object(worker, "init_smart_api", side_effect=blocked) as auth, \
             patch.object(worker.threading, "Thread", side_effect=thread_factory):
            thread = real_thread(target=run)
            thread.start()
            server = None
            try:
                self.assertTrue(entered.wait(3), "bootstrap did not reach blocked dependency")
                self.assertTrue(heartbeat_started.is_set(), "heartbeat started after bootstrap")
                server = worker.GLOBAL_QUOTE_SERVER
                self.assertIsNotNone(server, "health listener was opened after bootstrap")
                connection = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=1)
                try:
                    connection.request("GET", "/health")
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertEqual(json.loads(response.read())["status"], "ok")
                    connection.request("GET", "/ready")
                    response = connection.getresponse()
                    self.assertEqual(response.status, 503)
                    self.assertFalse(json.loads(response.read())["ready"])
                    connection.request("GET", "/quote?symbol=NIFTY")
                    response = connection.getresponse()
                    self.assertEqual(response.status, 404)
                    response.read()
                finally:
                    connection.close()
                if phase == "master":
                    auth.assert_not_called()
                else:
                    auth.assert_called_once()
            finally:
                release.set()
                thread.join(3)
                server = server or worker.GLOBAL_QUOTE_SERVER
                if server:
                    server.shutdown()
                    server.server_close()
            self.assertFalse(thread.is_alive())
            self.assertEqual(failure, [])

    def test_health_precedes_large_canonical_master_load(self):
        self.check_blocked_bootstrap("master")

    def test_health_precedes_slow_broker_login(self):
        self.check_blocked_bootstrap("login")

    def test_listener_bind_failure_exits_before_dependencies_start(self):
        with patch.object(worker, "GLOBAL_WRITER", None), patch.object(worker, "start_quote_server", return_value=None), \
             patch.object(worker.redis, "from_url") as client, patch.object(worker, "InstrumentStore") as store:
            with self.assertRaisesRegex(RuntimeError, "listener failed to bind"):
                worker.main()
            client.assert_not_called()
            store.assert_not_called()

    def test_connecting_or_unavailable_provider_is_not_ready(self):
        from datetime import datetime, timezone
        client = MagicMock()
        with patch.object(worker, "GLOBAL_WRITER", MagicMock(client=client)), patch.dict(os.environ, MARKET_FEED_MODE="live"):
            for state in ("CONNECTING", "STOPPED", "FALLBACK", "", "UNAVAILABLE", "RETRYING"):
                client.hgetall.return_value = {"worker_heartbeat":datetime.now(timezone.utc).isoformat(), "worker_master_version":"fixture-master", "feed_state":state}
                self.assertFalse(worker.worker_readiness()[0], state)
            client.hgetall.return_value["feed_state"] = "LIVE"
            self.assertTrue(worker.worker_readiness()[0])


if __name__ == "__main__":
    unittest.main()
