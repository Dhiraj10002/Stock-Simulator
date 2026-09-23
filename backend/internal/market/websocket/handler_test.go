package websocket

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCheckOrigin_Production_Allowed(t *testing.T) {
	allowed := "https://your-vercel-app.vercel.app"
	h := New(nil, allowed, true)

	req := httptest.NewRequest(http.MethodGet, "/ws/market", nil)
	req.Header.Set("Origin", "https://your-vercel-app.vercel.app")

	if !h.Upgrader().CheckOrigin(req) {
		t.Fatalf("expected origin %q to be allowed in production, but was rejected", "https://your-vercel-app.vercel.app")
	}
}

func TestCheckOrigin_Production_TrailingSlash(t *testing.T) {
	// Configuration without trailing slash, request with trailing slash
	allowed := "https://your-vercel-app.vercel.app"
	h := New(nil, allowed, true)

	req := httptest.NewRequest(http.MethodGet, "/ws/market", nil)
	req.Header.Set("Origin", "https://your-vercel-app.vercel.app/")

	if !h.Upgrader().CheckOrigin(req) {
		t.Fatalf("expected origin with trailing slash to be normalized and allowed, but was rejected")
	}
}

func TestCheckOrigin_Production_CaseInsensitive(t *testing.T) {
	allowed := "https://your-vercel-app.vercel.app"
	h := New(nil, allowed, true)

	req := httptest.NewRequest(http.MethodGet, "/ws/market", nil)
	req.Header.Set("Origin", "HTTPS://YOUR-VERCEL-APP.VERCEL.APP")

	if !h.Upgrader().CheckOrigin(req) {
		t.Fatalf("expected mixed-case origin to be allowed, but was rejected")
	}
}

func TestCheckOrigin_Production_UnauthorizedRejected(t *testing.T) {
	allowed := "https://your-vercel-app.vercel.app"
	h := New(nil, allowed, true)

	req := httptest.NewRequest(http.MethodGet, "/ws/market", nil)
	req.Header.Set("Origin", "https://attacker-domain.evil.com")

	if h.Upgrader().CheckOrigin(req) {
		t.Fatalf("expected rogue origin to be rejected in production, but was allowed")
	}
}

func TestCheckOrigin_Production_EmptyOriginRejected(t *testing.T) {
	allowed := "https://your-vercel-app.vercel.app"
	h := New(nil, allowed, true)

	req := httptest.NewRequest(http.MethodGet, "/ws/market", nil)
	// No Origin header

	if h.Upgrader().CheckOrigin(req) {
		t.Fatalf("expected empty Origin to be rejected in production, but was allowed")
	}
}

func TestCheckOrigin_Production_WildcardRejected(t *testing.T) {
	// In production, wildcard "*" must not allow arbitrary origins
	allowed := "*"
	h := New(nil, allowed, true)

	req := httptest.NewRequest(http.MethodGet, "/ws/market", nil)
	req.Header.Set("Origin", "https://attacker-domain.evil.com")

	if h.Upgrader().CheckOrigin(req) {
		t.Fatalf("expected wildcard to be rejected in production, but rogue origin was allowed")
	}
}

func TestCheckOrigin_Development_LocalhostAllowed(t *testing.T) {
	// In development with no explicit origins, localhost is allowed
	h := New(nil, "", false)

	req := httptest.NewRequest(http.MethodGet, "/ws/market", nil)
	req.Header.Set("Origin", "http://localhost:3000")

	if !h.Upgrader().CheckOrigin(req) {
		t.Fatalf("expected localhost:3000 to be allowed in development, but was rejected")
	}
}

func TestCheckOrigin_Development_EmptyOriginAllowed(t *testing.T) {
	// In development, non-browser clients (tests, curl) without Origin are allowed
	h := New(nil, "", false)

	req := httptest.NewRequest(http.MethodGet, "/ws/market", nil)
	// No Origin header

	if !h.Upgrader().CheckOrigin(req) {
		t.Fatalf("expected empty Origin to be allowed in development for tests/curl, but was rejected")
	}
}
