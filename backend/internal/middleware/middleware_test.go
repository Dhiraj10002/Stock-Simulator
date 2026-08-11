package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequestIDUsesProvidedValue(t *testing.T) {
	router := gin.New()
	router.Use(RequestID())
	router.GET("/", func(c *gin.Context) {
		if c.GetString(RequestIDKey) != "request-123" {
			t.Fatal("request ID was not stored in the context")
		}
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("X-Request-ID", "request-123")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Header().Get("X-Request-ID") != "request-123" {
		t.Fatal("request ID was not returned in the response")
	}
}

func TestCORSHandlesPreflight(t *testing.T) {
	router := gin.New()
	router.Use(CORS("http://localhost:3000"))
	router.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	request := httptest.NewRequest(http.MethodOptions, "/", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected %d, got %d", http.StatusNoContent, response.Code)
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatal("expected allowed origin response header")
	}
}

func TestRecoveryReturnsSafeError(t *testing.T) {
	router := gin.New()
	router.Use(Recovery())
	router.GET("/", func(c *gin.Context) { panic("unexpected failure") })

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected %d, got %d", http.StatusInternalServerError, response.Code)
	}
	if response.Body.String() == "" {
		t.Fatal("expected an error response body")
	}
}
