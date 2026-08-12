package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
	"github.com/gin-gonic/gin"
)

const testSecret = "test-secret"

func TestAuthenticateAcceptsAccessToken(t *testing.T) {
	accessToken, err := token.GenerateAccessToken(testSecret, "f47ac10b-58cc-4372-a567-0e02b2c3d479")
	if err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.GET("/protected", Authenticate(testSecret), func(c *gin.Context) {
		if c.GetString(UserIDKey) != "f47ac10b-58cc-4372-a567-0e02b2c3d479" {
			t.Fatal("expected user ID in context")
		}
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.Header.Set("Authorization", "Bearer "+accessToken)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected %d, got %d", http.StatusNoContent, response.Code)
	}
}

func TestAuthenticateRejectsRefreshToken(t *testing.T) {
	refreshToken, err := token.GenerateRefreshToken(testSecret, "f47ac10b-58cc-4372-a567-0e02b2c3d479")
	if err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.GET("/protected", Authenticate(testSecret), func(c *gin.Context) { c.Status(http.StatusNoContent) })

	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.Header.Set("Authorization", "Bearer "+refreshToken)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, response.Code)
	}
}
