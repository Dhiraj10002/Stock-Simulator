package service

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/news/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/redis/go-redis/v9"
)

func getTestRedis(t *testing.T) (*redis.Client, string) {
	return testutil.RequireDisposableRedis(t), os.Getenv("TEST_REDIS_URL")
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

func TestNewsEmptyAndStaleIngestion(t *testing.T) {
	c, url := getTestRedis(t)
	ctx := context.Background()
	c.Del(ctx, itemsKey, "news:health")
	defer c.Del(ctx, itemsKey, "news:health")
	s, err := New(url, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer s.client.Close()
	items, err := s.List("", 20)
	if err != nil || len(items) != 0 {
		t.Fatalf("empty feed invented news: %v %v", items, err)
	}
	c.HSet(ctx, "news:health", map[string]any{"last_poll": time.Now().Add(-time.Hour).Format(time.RFC3339), "last_success": time.Now().Add(-time.Hour).Format(time.RFC3339), "poll_interval_seconds": 60})
	status, err := s.Status()
	if err != nil || status["status"] != "STALE" {
		t.Fatalf("stopped worker: %v %v", status, err)
	}
}
