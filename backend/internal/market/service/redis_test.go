package service

import (
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
)

func TestQuoteAgeValidation(t *testing.T) {
	tests := []struct {
		name        string
		updatedAt   time.Time
		shouldError bool
	}{
		{name: "recent quote", updatedAt: time.Now().Add(-time.Minute)},
		{name: "stale quote", updatedAt: time.Now().Add(-maxExecutableQuoteAge - time.Second), shouldError: true},
		{name: "future quote", updatedAt: time.Now().Add(time.Minute), shouldError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateExecutableQuote(&dto.QuoteResponse{PricePaise: 1, UpdatedAt: test.updatedAt.UTC().Format(time.RFC3339)}, time.Now())
			if (err != nil) != test.shouldError {
				t.Fatalf("err=%v, shouldError=%v", err, test.shouldError)
			}
		})
	}
}

func TestQuoteValidationRejectsInvalidPriceAndTimestamp(t *testing.T) {
	now := time.Now()
	if err := validateExecutableQuote(&dto.QuoteResponse{PricePaise: 0, UpdatedAt: now.UTC().Format(time.RFC3339)}, now); err == nil {
		t.Fatal("expected zero price to be rejected")
	}
	if err := validateExecutableQuote(&dto.QuoteResponse{PricePaise: 1, UpdatedAt: "not-a-time"}, now); err == nil {
		t.Fatal("expected malformed timestamp to be rejected")
	}
}
