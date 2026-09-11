package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
)

func TestHealthIncludesRequestID(t *testing.T) {
	router := Setup(&config.Config{CORSAllowedOrigins: "http://localhost:3000"})
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
	router := Setup(&config.Config{CORSAllowedOrigins: "http://localhost:3000"})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(`{"email":"not-an-email"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, response.Code)
	}
}

func TestSimulationResetRequiresAuthentication(t *testing.T) {
	router := Setup(&config.Config{CORSAllowedOrigins: "http://localhost:3000"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/simulation/reset", nil))

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, response.Code)
	}
}

func TestWalletResetRouteIsNotExposed(t *testing.T) {
	router := Setup(&config.Config{CORSAllowedOrigins: "http://localhost:3000"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/wallet/reset", nil))

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, response.Code)
	}
}
