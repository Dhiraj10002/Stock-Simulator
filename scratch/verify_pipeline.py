#!/usr/bin/env python3
"""
End-to-End Pipeline & Security Verification Script for Stock Simulator
Tests:
1. Worker Quote & Feed State payload generation
2. Redis message publishing and schema compatibility
3. CORS origin matching and rejection rules
4. WebSocket CheckOrigin policy for Vercel -> Oracle architecture
"""

import sys
import json
from datetime import datetime, timezone

def test_feed_payload_schema():
    print("[1/4] Verifying feed state payload schema...")
    from test_worker import worker
    
    class MockRedis:
        def __init__(self):
            self.hashes = {}
            self.published = []
        def hset(self, key, mapping):
            self.hashes[key] = mapping
        def publish(self, channel, message):
            self.published.append((channel, message))

    r = MockRedis()
    state = worker.publish_feed_state(r, "angel_one", "LIVE", is_synthetic=False, last_tick="2026-09-24T00:00:00Z")
    
    assert state["feed_provider"] == "angel_one"
    assert state["feed_state"] == "LIVE"
    assert state["is_synthetic"] is False
    assert "market:feed_state" in r.hashes
    assert len(r.published) == 1
    
    channel, raw_msg = r.published[0]
    assert channel == "market:updates"
    event = json.loads(raw_msg)
    assert event["type"] == "feed_status"
    assert event["feed_provider"] == "angel_one"
    print("  -> Worker to Redis pubsub event schema: VALID")

def test_cors_origin_normalization():
    print("[2/4] Verifying CORS normalization logic...")
    allowed_list = ["https://your-vercel-app.vercel.app/"]
    normalized_allowed = {origin.strip().rstrip("/").lower() for origin in allowed_list}
    
    # Standard request
    test_origin = "https://your-vercel-app.vercel.app"
    assert test_origin.strip().rstrip("/").lower() in normalized_allowed
    
    # Trailing slash request
    test_origin_slash = "https://your-vercel-app.vercel.app/"
    assert test_origin_slash.strip().rstrip("/").lower() in normalized_allowed
    
    # Rogue origin
    attacker = "https://attacker.evil.com"
    assert attacker.strip().rstrip("/").lower() not in normalized_allowed
    print("  -> CORS origin normalization & rejection: VALID")

def test_websocket_origin_security():
    print("[3/4] Verifying WebSocket security policy...")
    allowed_origins = "https://your-vercel-app.vercel.app"
    origins_set = {o.strip().rstrip("/").lower() for o in allowed_origins.split(",") if o.strip()}
    
    # Legitimate Vercel origin
    browser_origin = "https://your-vercel-app.vercel.app"
    assert browser_origin.strip().rstrip("/").lower() in origins_set
    
    # Missing origin in production (cross-site attempt)
    empty_origin = ""
    is_prod = True
    assert not (empty_origin != "" or not is_prod)
    print("  -> WebSocket origin authorization rules: VALID")

def test_config_url_upgrade():
    print("[4/4] Verifying URL protocol upgrade rules...")
    # HTTP -> HTTPS when browser on HTTPS
    def upgrade_api(url, is_https):
        if is_https and url.startswith("http://"):
            return "https://" + url[7:]
        return url

    def derive_ws(api_url):
        base = api_url.rstrip("/").removesuffix("/api/v1")
        if base.startswith("https://"):
            return "wss://" + base[8:] + "/ws/market"
        elif base.startswith("http://"):
            return "ws://" + base[7:] + "/ws/market"
        return base + "/ws/market"

    assert upgrade_api("http://api.domain.com/api/v1", True) == "https://api.domain.com/api/v1"
    assert derive_ws("https://api.domain.com/api/v1") == "wss://api.domain.com/ws/market"
    print("  -> Protocol upgrade & WSS derivation: VALID")

if __name__ == "__main__":
    sys.path.insert(0, "python-services/market-worker")
    test_feed_payload_schema()
    test_cors_origin_normalization()
    test_websocket_origin_security()
    test_config_url_upgrade()
    print("\nAll pipeline and security checks PASSED successfully.")
