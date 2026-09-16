package app

import (
	"context"
	"net/http"
	"os"
	"testing"
	"time"
)

func TestApp_GracefulShutdown(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL required for App integration test")
	}

	// Set temporary random port for test
	os.Setenv("PORT", "18099")
	os.Setenv("DATABASE_URL", databaseURL)
	os.Setenv("JWT_SECRET", "testsecret_graceful_shutdown_32chars!")

	app := New()

	ctx, cancel := context.WithCancel(context.Background())

	errCh := make(chan error, 1)
	go func() {
		errCh <- app.RunWithContext(ctx)
	}()

	// Wait for server to start accepting connections (accommodating remote Neon DEV migration latency)
	var started bool
	for i := 0; i < 900; i++ {
		time.Sleep(100 * time.Millisecond)
		resp, err := http.Get("http://localhost:18099/api/v1/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				started = true
				break
			}
		}
	}

	if !started {
		cancel()
		t.Fatalf("server failed to start within timeout: %v", <-errCh)
	}

	// Trigger graceful shutdown by canceling context
	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("expected clean shutdown, got: %v", err)
		}
	case <-time.After(12 * time.Second):
		t.Fatal("graceful shutdown timed out")
	}
}
