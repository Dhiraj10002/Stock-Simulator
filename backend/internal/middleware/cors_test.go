package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestCORS_AllowedOrigin(t *testing.T) {
	r := gin.New()
	r.Use(CORS("https://your-vercel-app.vercel.app"))
	r.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Origin", "https://your-vercel-app.vercel.app")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://your-vercel-app.vercel.app" {
		t.Fatalf("expected Access-Control-Allow-Origin %q, got %q", "https://your-vercel-app.vercel.app", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("expected Access-Control-Allow-Credentials 'true', got %q", got)
	}
}

func TestCORS_TrailingSlashNormalization(t *testing.T) {
	r := gin.New()
	// Configured with trailing slash
	r.Use(CORS("https://your-vercel-app.vercel.app/"))
	r.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	// Request without trailing slash (RFC standard)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Origin", "https://your-vercel-app.vercel.app")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 with trailing slash normalization, got %d", w.Code)
	}
}

func TestCORS_UnauthorizedOriginRejected(t *testing.T) {
	r := gin.New()
	r.Use(CORS("https://your-vercel-app.vercel.app"))
	r.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Origin", "https://attacker.evil.com")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden for unauthorized origin, got %d", w.Code)
	}
}

func TestCORS_PreflightOptions(t *testing.T) {
	r := gin.New()
	r.Use(CORS("https://your-vercel-app.vercel.app"))
	r.POST("/api/v1/trade", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/trade", nil)
	req.Header.Set("Origin", "https://your-vercel-app.vercel.app")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 No Content for preflight OPTIONS, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Max-Age"); got != "86400" {
		t.Fatalf("expected Access-Control-Max-Age 86400, got %q", got)
	}
}
