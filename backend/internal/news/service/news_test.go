package service

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/news/dto"
	"github.com/redis/go-redis/v9"
)

func getTestRedis(t *testing.T) (*redis.Client, string) {
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
			return c, u
		}
	}
	t.Skip("No test Redis instance reachable; skipping live Redis tests")
	return nil, ""
}

func TestNewsService_LimitValidation(t *testing.T) {
	_, redisURL := getTestRedis(t)
	svc, err := New(redisURL, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to initialize NewsService: %v", err)
	}

	if _, err := svc.List("", 0); err == nil {
		t.Errorf("Expected error for limit=0, got nil")
	}
	if _, err := svc.List("", 101); err == nil {
		t.Errorf("Expected error for limit=101, got nil")
	}
	if _, err := svc.ListWithFilters("", "", -5); err == nil {
		t.Errorf("Expected error for limit=-5, got nil")
	}
}

func TestNewsService_FallbackArticles(t *testing.T) {
	// Test fallback articles logic
	articles := getFallbackArticles("", "", 10)
	if len(articles) == 0 {
		t.Fatalf("Expected fallback articles, got 0")
	}

	// Verify sentiment filter on fallback
	positives := getFallbackArticles("", "POSITIVE", 10)
	for _, a := range positives {
		if a.Sentiment != "POSITIVE" {
			t.Errorf("Expected POSITIVE article, got %s", a.Sentiment)
		}
	}

	// Verify symbol filter on fallback
	relianceNews := getFallbackArticles("RELIANCE", "", 10)
	if len(relianceNews) == 0 {
		t.Fatalf("Expected fallback news for RELIANCE, got 0")
	}
	for _, a := range relianceNews {
		if !contains(a.Symbols, "RELIANCE") {
			t.Errorf("Expected article to contain RELIANCE symbol, got %v", a.Symbols)
		}
	}
}

func TestNewsService_LiveRedisIngestedItems(t *testing.T) {
	rClient, redisURL := getTestRedis(t)
	svc, err := New(redisURL, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to initialize NewsService: %v", err)
	}

	ctx := context.Background()
	testItem := dto.ArticleResponse{
		Title:       "Test Corp posts massive surge in profit and market rally",
		URL:         "https://example.com/test-news-1",
		Source:      "TestWire",
		PublishedAt: time.Now().UTC().Format(time.RFC3339),
		Sentiment:   "POSITIVE",
		Score:       3,
		Symbols:     []string{"TESTCORP", "RELIANCE"},
		Sectors:     []string{"IT"},
	}

	payload, err := json.Marshal(testItem)
	if err != nil {
		t.Fatalf("Failed to marshal test article: %v", err)
	}

	// Prepend test item
	if err := rClient.LPush(ctx, itemsKey, payload).Err(); err != nil {
		t.Fatalf("Failed to push test article to Redis: %v", err)
	}
	defer rClient.LRem(ctx, itemsKey, 0, payload)

	// Fetch without filter
	results, err := svc.List("", 20)
	if err != nil {
		t.Fatalf("svc.List failed: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("Expected at least 1 article, got 0")
	}

	// Fetch filtered by TESTCORP
	symbolResults, err := svc.ListWithFilters("TESTCORP", "POSITIVE", 5)
	if err != nil {
		t.Fatalf("svc.ListWithFilters failed: %v", err)
	}
	if len(symbolResults) == 0 {
		t.Fatalf("Expected article for symbol TESTCORP, got 0")
	}
	if symbolResults[0].Sentiment != "POSITIVE" {
		t.Errorf("Expected POSITIVE sentiment, got %s", symbolResults[0].Sentiment)
	}
}
