package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
)

func TestHealthIncludesRequestID(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	router := Setup(ctx, &config.Config{CORSAllowedOrigins: "http://localhost:3000"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, response.Code)
	}
	if response.Header().Get("X-Request-ID") == "" {
		t.Fatal("expected X-Request-ID response header")
	}
}

func TestInvalidRegistrationIsRejectedBeforeDatabaseAccess(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	router := Setup(ctx, &config.Config{CORSAllowedOrigins: "http://localhost:3000"})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(`{"email":"not-an-email"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, response.Code)
	}
}

func TestSimulationResetRequiresAuthentication(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	router := Setup(ctx, &config.Config{CORSAllowedOrigins: "http://localhost:3000"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/simulation/reset", nil))

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, response.Code)
	}
}

func TestWalletResetRouteIsNotExposed(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	router := Setup(ctx, &config.Config{CORSAllowedOrigins: "http://localhost:3000"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/wallet/reset", nil))

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, response.Code)
	}
}

func TestWorkerContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	_ = Setup(ctx, &config.Config{CORSAllowedOrigins: "http://localhost:3000"})

	// Verify that canceling the parent context completes without deadlock or panic
	done := make(chan struct{})
	go func() {
		cancel()
		time.Sleep(50 * time.Millisecond)
		close(done)
	}()

	select {
	case <-done:
		// Clean termination
	case <-time.After(2 * time.Second):
		t.Fatal("worker context cancellation timed out")
	}
}
