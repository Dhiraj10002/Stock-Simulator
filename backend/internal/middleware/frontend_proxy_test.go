package middleware

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFrontendIPRequiresSecretAndValidIP(t *testing.T) {
	secret := strings.Repeat("s", 32)
	for _, test := range []struct{ key, ip, want string }{{"", "1.2.3.4", ""}, {"bad", "1.2.3.4", ""}, {secret, "invalid", ""}, {secret, "1.2.3.4", "1.2.3.4"}} {
		r := gin.New()
		r.Use(FrontendClientIP(secret))
		r.GET("/", func(c *gin.Context) { c.String(200, c.GetString("frontend_client_ip")) })
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Frontend-Proxy-Secret", test.key)
		req.Header.Set("X-Frontend-Client-IP", test.ip)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Body.String() != test.want {
			t.Fatalf("untrusted override: %q", w.Body.String())
		}
	}
}
