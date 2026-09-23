package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/gin-gonic/gin"
)

func TestStockHandler_SearchValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := New()

	// 1. Missing q parameter
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest(http.MethodGet, "/stocks/search", nil)

	h.Search(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for empty q, got %d", w.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal error response: %v", err)
	}
	if res["message"] != "q is required" {
		t.Fatalf("expected 'q is required' message, got %v", res["message"])
	}

	// 2. Database disconnected
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request, _ = http.NewRequest(http.MethodGet, "/stocks/search?q=PRAJIND", nil)

	h.Search(c2)

	if w2.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503 for disconnected database, got %d", w2.Code)
	}
}

func TestStockHandler_AliasPatternResolution(t *testing.T) {
	// Verify that alias resolution for search targets maps canonical symbols
	tests := []struct {
		queryClean   string
		expectTarget string
	}{
		{"ZOMATO", "ETERNAL"},
		{"TATAMOTORS", "TMPV"},
		{"LTI", "LTIM"},
		{"MINDTREE", "LTIM"},
		{"PRAJIND", "PRAJIND"},
		{"ETERNAL", "ETERNAL"},
		{"TMPV", "TMPV"},
	}

	for _, tt := range tests {
		target := alias.ResolveCanonicalSymbol(tt.queryClean)
		if target != tt.expectTarget {
			t.Errorf("ResolveCanonicalSymbol(%q) = %q; want %q", tt.queryClean, target, tt.expectTarget)
		}
	}
}
