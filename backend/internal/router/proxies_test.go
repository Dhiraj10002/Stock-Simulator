package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func TestProxyClientIPBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		name      string
		proxies   []string
		remote    string
		forwarded string
		realIP    string
		want      string
	}{
		{"native ignores forged headers", nil, "198.51.100.1:1234", "203.0.113.5", "203.0.113.6", "198.51.100.1"},
		{"gateway forwards client", []string{"172.30.250.2"}, "172.30.250.2:1234", "198.51.100.1", "203.0.113.6", "198.51.100.1"},
		{"worker is not trusted", []string{"172.30.250.2"}, "172.30.250.3:1234", "203.0.113.5", "203.0.113.6", "172.30.250.3"},
		{"client cannot prepend a forged IP", []string{"172.30.250.2"}, "172.30.250.2:1234", "203.0.113.5, 198.51.100.1", "203.0.113.6", "198.51.100.1"},
		{"malformed header cannot use X-Real-IP", []string{"172.30.250.2"}, "172.30.250.2:1234", "malformed", "203.0.113.6", "172.30.250.2"},
		{"IPv6 gateway", []string{"::1"}, "[::1]:1234", "2001:db8::1", "203.0.113.6", "2001:db8::1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			configureProxyTrust(r, &config.Config{TrustedProxies: tc.proxies})
			r.GET("/ip", func(c *gin.Context) { c.String(http.StatusOK, c.ClientIP()) })
			req := httptest.NewRequest(http.MethodGet, "/ip", nil)
			req.RemoteAddr = tc.remote
			req.Header.Set("X-Forwarded-For", tc.forwarded)
			req.Header.Set("X-Real-IP", tc.realIP)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusOK || w.Body.String() != tc.want {
				t.Fatalf("client IP = %q, want %q", w.Body.String(), tc.want)
			}
		})
	}
}

func TestGatewayRateLimitsSeparateClients(t *testing.T) {
	redisURL := os.Getenv("TEST_REDIS_URL")
	if redisURL == "" {
		t.Skip("TEST_REDIS_URL is required for the Redis integration test")
	}
	options, err := redis.ParseURL(redisURL)
	if err != nil {
		t.Fatal(err)
	}
	client := redis.NewClient(options)
	t.Cleanup(func() { client.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatal(err)
	}
	scope := "proxy-test-" + uuid.NewString()
	t.Cleanup(func() {
		client.Del(context.Background(), "rate_limit:"+scope+":ip:198.51.100.1", "rate_limit:"+scope+":ip:198.51.100.2", "rate_limit:"+scope+":ip:198.51.100.3")
	})
	r := gin.New()
	configureProxyTrust(r, &config.Config{TrustedProxies: []string{"172.30.250.2"}})
	r.GET("/limited", middleware.NewRateLimiter(client, time.Second).Limit(scope, 1, time.Hour), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	request := func(remote, forwarded string) int {
		req := httptest.NewRequest(http.MethodGet, "/limited", nil)
		req.RemoteAddr = remote
		req.Header.Set("X-Forwarded-For", forwarded)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if got := request("172.30.250.2:1234", "198.51.100.1"); got != http.StatusNoContent {
		t.Fatalf("first client: %d", got)
	}
	if got := request("172.30.250.2:1234", "203.0.113.9, 198.51.100.1"); got != http.StatusTooManyRequests {
		t.Fatalf("forged prefix bypassed first client's bucket: %d", got)
	}
	if got := request("172.30.250.2:1234", "198.51.100.2"); got != http.StatusNoContent {
		t.Fatalf("second client shared the gateway's bucket: %d", got)
	}
	if got := request("198.51.100.3:1234", "203.0.113.10"); got != http.StatusNoContent {
		t.Fatalf("direct client: %d", got)
	}
	if got := request("198.51.100.3:1234", "203.0.113.11"); got != http.StatusTooManyRequests {
		t.Fatalf("direct client bypassed rate limit with forged header: %d", got)
	}
}
