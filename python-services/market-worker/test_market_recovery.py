import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from test_worker import worker


class MarketRecoveryTest(unittest.TestCase):
    def test_rest_resolves_the_current_session_instead_of_captured_expired_api(self):
        old, renewed = MagicMock(), MagicMock()
        renewed.getMarketData.return_value = {'status': True, 'data': {'fetched': []}}
        with patch.object(worker, 'GLOBAL_SMART_API', old), patch.object(worker, 'smart_api_session', return_value=(renewed, {})) as session, patch.object(worker, 'broker_call', side_effect=lambda call: call()):
            worker.fetch_full_snapshots(None, [worker.Subscription('NIFTY', '99926000', 'NSE', 1)])
        session.assert_called_once()
        old.getMarketData.assert_not_called()
        renewed.getMarketData.assert_called_once_with('FULL', {'NSE': ['99926000']})

    def test_expired_auth_invalidates_session_without_printing_provider_payload(self):
        api = MagicMock()
        api.getMarketData.return_value = {'status': False, 'errorcode': 'AG8002', 'message': 'private-value'}
        with patch.object(worker, 'GLOBAL_SMART_API', api), patch.object(worker, 'SMART_API_SESSION', {'jwtToken': 'private-value'}), patch.object(worker, 'SMART_API_SESSION_EXPIRES', 999999), patch.object(worker, 'smart_api_session', return_value=(api, {})), patch.object(worker, 'broker_call', side_effect=lambda call: call()):
            with self.assertRaisesRegex(RuntimeError, 'session expired') as error:
                worker.fetch_full_snapshots(None, [worker.Subscription('FUT', '123', 'NFO', 2)])
            self.assertNotIn('private-value', str(error.exception))
            self.assertIsNone(worker.GLOBAL_SMART_API)
            self.assertIsNone(worker.SMART_API_SESSION)
            self.assertEqual(worker.SMART_API_SESSION_EXPIRES, 0)

    def test_cold_derivative_recovers_from_full_data_without_websocket_connection(self):
        store, writer = MagicMock(), MagicMock()
        epoch = ('active-master', 'signature')
        store.canonical_epoch.return_value = epoch
        sub = worker.Subscription('TCS26OCTFUT', '123', 'NFO', 2)
        store.demanded_subscriptions.return_value = [sub]
        writer.client.hget.return_value = None
        stamp = datetime.now(timezone.utc) - timedelta(seconds=3)
        data = {'ltp': 3709, 'close': 3700, 'exchFeedTime': stamp.isoformat(), 'tradeVolume': 10}
        with patch.object(worker, 'fetch_full_snapshots', return_value={('NFO', '123'): data}) as fetch:
            self.assertTrue(worker.recover_quote_snapshots(store, writer, {}, epoch))
        fetch.assert_called_once_with(None, [sub])
        self.assertEqual(writer.write.call_args.args[1], 370900)
        self.assertEqual(writer.write.call_args.kwargs['event_time'], stamp)
        self.assertFalse(writer.write.call_args.kwargs['build_history'])

    def test_cold_contracts_precede_retried_core_universe_and_fresh_quotes_are_skipped(self):
        store, writer = MagicMock(), MagicMock()
        epoch = ('master', 'signature')
        store.canonical_epoch.return_value = epoch
        base = [worker.Subscription(f'BASE{i}', str(i), 'NSE', 1) for i in range(50)]
        cold = worker.Subscription('OPTION', '100', 'NFO', 2)
        fresh = worker.Subscription('FRESH', '101', 'NSE', 1)
        store.demanded_subscriptions.return_value = base + [fresh, cold]
        writer.client.hget.side_effect = lambda key, field: datetime.now(timezone.utc).isoformat() if key.endswith(':FRESH') else None
        attempts = {sub.symbol: worker.time.monotonic() - 30 for sub in base}
        with patch.object(worker, 'fetch_full_snapshots', return_value={}) as fetch:
            worker.recover_quote_snapshots(store, writer, attempts, epoch)
        batch = fetch.call_args.args[1]
        self.assertEqual(batch[0], cold)
        self.assertEqual(len(batch), 50)
        self.assertNotIn(fresh, batch)

    def test_master_change_discards_inflight_rest_quote(self):
        store, writer = MagicMock(), MagicMock()
        sub = worker.Subscription('FUT', '123', 'NFO', 2)
        store.demanded_subscriptions.return_value = [sub]
        store.canonical_epoch.return_value = ('new-master', 'signature')
        writer.client.hget.return_value = None
        with patch.object(worker, 'fetch_full_snapshots', return_value={('NFO', '123'): {'ltp': 100, 'exchFeedTime': datetime.now(timezone.utc).isoformat()}}):
            self.assertFalse(worker.recover_quote_snapshots(store, writer, {}, ('old-master', 'signature')))
        writer.write.assert_not_called()

    def test_failed_or_empty_history_has_safe_diagnostics_and_preserves_cache(self):
        for result, state in [({'status': False, 'message': 'private-value'}, 'REJECTED'), ({'status': True, 'data': []}, 'EMPTY')]:
            with self.subTest(state=state):
                client, api = MagicMock(), MagicMock()
                api.getCandleData.return_value = result
                writer = worker.QuoteWriter(client, 300, 86400, 500, feed_mode='live')
                with patch.object(worker, 'broker_call', side_effect=lambda call: call()):
                    self.assertFalse(worker.backfill_history(writer, api, worker.Subscription('SENSEX', '99919000', 'BSE', 3), 'ONE_HOUR'))
                self.assertEqual(client.hset.call_args.kwargs['mapping']['state'], state)
                self.assertNotIn('private-value', str(client.hset.call_args))
                client.pipeline.assert_not_called()
                self.assertEqual(api.getCandleData.call_args.args[0]['exchange'], 'BSE')

    def test_history_from_previous_master_cannot_replace_new_identity_bars(self):
        client, api = MagicMock(), MagicMock()
        stamp = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
        api.getCandleData.return_value = {'status': True, 'data': [[stamp, 100, 102, 99, 101, 0]]}
        writer = worker.QuoteWriter(client, 300, 86400, 500, feed_mode='live')
        with patch.object(worker, 'broker_call', side_effect=lambda call: call()):
            self.assertFalse(worker.backfill_history(writer, api, worker.Subscription('SENSEX', '99919000', 'BSE', 3), 'ONE_HOUR', still_current=lambda: False))
        client.pipeline.assert_not_called()
        self.assertEqual(client.hset.call_args.kwargs['mapping']['state'], 'IDENTITY_CHANGED')
