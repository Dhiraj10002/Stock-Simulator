package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/gin-gonic/gin"
)

func getHandlerTestRedis(t *testing.T) string {
	candidates := []string{
		os.Getenv("TEST_REDIS_URL"),
		"redis://127.0.0.1:6380/0",
		"redis://localhost:6379/0",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	for _, u := range candidates {
		if u == "" {
			continue
		}
		c, err := cache.NewRedisClient(u, 2*time.Second)
		if err == nil && c.Ping(ctx).Err() == nil {
			return u
		}
	}
	t.Skip("No test Redis reachable; skipping news handler live tests")
	return ""
}

func TestNewsHandler_List(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisURL := getHandlerTestRedis(t)

	h, err := New(redisURL, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to initialize NewsHandler: %v", err)
	}

	// 1. Invalid limit should return 400 Bad Request
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest(http.MethodGet, "/news?limit=abc", nil)

	h.List(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected status 400 for limit=abc, got %d", w.Code)
	}

	// 2. Successful fetch with limit and symbol
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request, _ = http.NewRequest(http.MethodGet, "/news?limit=5&symbol=RELIANCE", nil)

	h.List(c2)

	if w2.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w2.Code, w2.Body.String())
	}

	var resp struct {
		Success bool          `json:"success"`
		Message string        `json:"message"`
		Data    []interface{} `json:"data"`
	}
	if err := json.Unmarshal(w2.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if !resp.Success {
		t.Errorf("Expected success=true, got false")
	}
}
