package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

// Zero-dependency healthcheck utility for distroless Docker containers.
// Executes an HTTP GET request to /api/v1/health and exits 0 on HTTP 200.
func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	client := http.Client{
		Timeout: 3 * time.Second,
	}

	url := fmt.Sprintf("http://127.0.0.1:%s/api/v1/health", port)
	resp, err := client.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "healthcheck failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "healthcheck returned non-200 status: %d\n", resp.StatusCode)
		os.Exit(1)
	}

	os.Exit(0)
}
