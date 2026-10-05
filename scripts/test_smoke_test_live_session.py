import contextlib
import io
import json
import sys
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import patch

import smoke_test_live_session as smoke


def args(**overrides):
    return SimpleNamespace(**dict(base_url='http://localhost:8080/api/v1', token_env='STOCK_SIM_SMOKE_TOKEN', equity='RELIANCE', underlying='NIFTY', expect_open=True, paper_orders=False) | overrides)


class LiveSmokeEvidenceTest(unittest.TestCase):
    def test_unready_503_retains_states_without_raw_errors(self):
        payload = {'ready': False, 'status': 'DEGRADED', 'services': {'market_feed': {'mode': 'LIVE', 'status': 'DEGRADED', 'error': 'private-dsn-or-session'}, 'calendar': {'market_state': 'OPEN'}}}
        error = urllib.error.HTTPError('http://localhost/ready', 503, 'Unavailable', {}, io.BytesIO(json.dumps(payload).encode()))
        report = {'passed': False, 'checks': [], 'paper_orders': []}
        with patch.object(smoke.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, 'readiness failed'):
                smoke.run(args(), report)
        self.assertEqual(report['readiness']['services']['market_feed']['status'], 'DEGRADED')
        self.assertNotIn('private-dsn-or-session', json.dumps(report))
        self.assertEqual(report['stage'], 'readiness')

    def test_closed_session_cannot_certify_open_or_submit_orders(self):
        ready = {'ready': True, 'services': {'market_feed': {'mode': 'LIVE'}, 'calendar': {'market_state': 'CLOSED'}}}
        with patch.object(smoke.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(ready).encode())) as requests:
            with self.assertRaisesRegex(RuntimeError, 'open session'):
                smoke.run(args())
        self.assertEqual(requests.call_count, 1)
        self.assertEqual(requests.call_args.args[0].get_method(), 'GET')

    def test_cli_preserves_partial_progress_and_marks_cleanup_on_failure(self):
        def fail(_args, report):
            report.update(stage='paper_FNO_SELL', readiness={'ready': True})
            report['paper_orders'].append({'symbol': 'EXAMPLECE', 'side': 'BUY', 'product': 'FNO'})
            raise RuntimeError('Paper order not executed; inspect account before retrying')
        output = io.StringIO()
        with patch.object(sys, 'argv', ['smoke', '--paper-orders']), patch.object(smoke, 'run', side_effect=fail), contextlib.redirect_stdout(output):
            self.assertEqual(smoke.main(), 1)
        report = json.loads(output.getvalue())
        self.assertEqual(len(report['paper_orders']), 1)
        self.assertTrue(report['cleanup_required'])
        self.assertFalse(report['passed'])

    def test_pending_account_preflight_prevents_all_order_posts(self):
        from datetime import datetime, timezone
        def response(request, **_kwargs):
            path = request.full_url.split('/api/v1', 1)[1]
            self.assertEqual(request.get_method(), 'GET')
            if path == '/ready':
                value = {'ready': True, 'services': {'market_feed': {'mode': 'LIVE'}, 'calendar': {'market_state': 'OPEN'}}}
                return io.BytesIO(json.dumps(value).encode())
            if path == '/instruments/snapshots/active':
                data = {'status': 'ACTIVE', 'total_instruments': 10, 'version': 'fixture-master'}
            elif path == '/instruments/futures' or path.startswith('/instruments?'):
                data = [{'instrument_type': 'FUTIDX', 'symbol': 'FUTURE', 'lot_size': 25, 'underlying': 'NIFTY', 'token': '1234', 'exchange': 'NFO', 'active': True, 'is_tradable': True, 'expiry': '2099-10-27'}]
            elif path.startswith('/fno/option-chain'):
                data = {'strikes': [{'is_atm': True, 'call': {'symbol': 'CALL', 'lot_size': 25}, 'put': {'symbol': 'PUT', 'lot_size': 25}}]}
            elif '/history?' in path:
                data = [{'source':'angelone_live', 'feed_mode':'LIVE', 'low_paise': 90, 'open_paise': 100, 'close_paise': 100, 'high_paise': 110}]
            elif path.startswith('/market/quotes/'):
                data = {'symbol':path.split('/')[3].split('?')[0], 'source':'angelone_live', 'price_paise':100, 'updated_at':datetime.now(timezone.utc).isoformat(), 'open_interest_available': True}
            elif path == '/portfolio':
                data = {'positions': []}
            elif path == '/orders':
                data = [{'status': 'TRIGGER_PENDING'}]
            else:
                self.fail('Unexpected request')
            return io.BytesIO(json.dumps({'success': True, 'data': data}).encode())
        report = {'passed': False, 'checks': [], 'paper_orders': []}
        with patch.dict(smoke.os.environ, STOCK_SIM_SMOKE_TOKEN='fixture-token'), patch.object(smoke.urllib.request, 'urlopen', side_effect=response):
            with self.assertRaisesRegex(RuntimeError, 'no pending orders'):
                smoke.run(args(paper_orders=True), report)
        self.assertEqual(report['stage'], 'paper_account_preflight')
        self.assertEqual(report['paper_orders'], [])

    def test_stale_quote_is_display_only(self):
        quote = {'symbol': 'RELIANCE', 'source': 'angelone_live', 'price_paise': 12345, 'updated_at': '2026-01-01T10:00:00+00:00', 'is_quote_stale': True}
        self.assertEqual(smoke.quote_check(quote, 'RELIANCE')['price_paise'], 12345)
        with self.assertRaisesRegex(RuntimeError, 'Stale execution'):
            smoke.quote_check(quote, 'RELIANCE', executable=True)

    def test_private_url_is_rejected_without_a_network_call(self):
        with patch.object(smoke.urllib.request, 'urlopen') as request:
            with self.assertRaisesRegex(RuntimeError, 'without credentials'):
                smoke.run(args(base_url='http://user:private-password@localhost:8080/api/v1'))
        request.assert_not_called()


class CanonicalFutureSelectionTest(unittest.TestCase):
    def setUp(self):
        self.now = smoke.datetime(2026, 10, 6, 12, 0, tzinfo=smoke.IST)
        self.row = dict(symbol="NIFTY06OCT26FUT", underlying="NIFTY", token="1234", instrument_type="FUTIDX", exchange="NFO", lot_size=65, active=True, is_tradable=True, expiry="06OCT2026")

    def test_exact_underlying_and_expiry_day_remain_eligible(self):
        wrong = self.row | dict(underlying="NIFTYBANK", symbol="NIFTYBANK06OCT26FUT")
        later = self.row | dict(symbol="NIFTY13OCT26FUT", expiry="2026-10-13")
        self.assertEqual(smoke.select_live_future([wrong, later, self.row], "NIFTY", self.now), self.row)
        before_close = self.now.replace(hour=15, minute=35)
        self.assertEqual(smoke.select_live_future([later, self.row], "NIFTY", before_close), self.row)
        at_close = self.now.replace(hour=15, minute=40)
        self.assertEqual(smoke.select_live_future([later, self.row], "NIFTY", at_close), later)

    def test_invalid_metadata_cannot_be_used_as_fallback(self):
        for patch_value in [dict(expiry="nonsense"), dict(expiry="2026-10-01"), dict(token="NIFTY"), dict(token="١٢٣"), dict(active=False), dict(is_tradable=False), dict(lot_size=0), dict(lot_size=True), dict(exchange="NSE"), dict(underlying="NIFTYBANK"), dict(instrument_type="OPTIDX")]:
            with self.subTest(patch=patch_value), self.assertRaisesRegex(RuntimeError, "Current canonical future missing"):
                smoke.select_live_future([self.row | patch_value], "NIFTY", self.now)


if __name__ == '__main__':
    unittest.main()
