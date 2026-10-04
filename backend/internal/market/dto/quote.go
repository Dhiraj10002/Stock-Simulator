package dto

import (
	"errors"
	"strings"
	"time"
)

type DepthLevel struct {
	PricePaise int64  `json:"price_paise"`
	Quantity   int64  `json:"quantity"`
	Orders     *int64 `json:"orders,omitempty"`
}
type MarketDepth struct {
	Bids []DepthLevel `json:"bids"`
	Asks []DepthLevel `json:"asks"`
}
type QuoteResponse struct {
	OpenInterestAvailable bool         `json:"open_interest_available"`
	OpenPaise             int64        `json:"open_paise,omitempty"`
	HighPaise             int64        `json:"high_paise,omitempty"`
	LowPaise              int64        `json:"low_paise,omitempty"`
	Week52HighPaise       int64        `json:"week_52_high_paise,omitempty"`
	Week52LowPaise        int64        `json:"week_52_low_paise,omitempty"`
	TotalBuyQuantity      *int64       `json:"total_buy_quantity,omitempty"`
	TotalSellQuantity     *int64       `json:"total_sell_quantity,omitempty"`
	Depth                 *MarketDepth `json:"depth,omitempty"`
	IsQuoteStale          bool         `json:"is_quote_stale"`

	OpenInterest       int64   `json:"open_interest"`
	PreviousClosePaise int64   `json:"previous_close_paise"`
	DayChangeAvailable bool    `json:"day_change_available"`
	Symbol             string  `json:"symbol"`
	PricePaise         int64   `json:"price_paise"`
	ChangePaise        int64   `json:"change_paise"`
	ChangePercent      float64 `json:"change_percent"`
	LowerCircuitPaise  int64   `json:"lower_circuit_paise,omitempty"`
	UpperCircuitPaise  int64   `json:"upper_circuit_paise,omitempty"`
	Volume             int64   `json:"volume"`
	VolumeAvailable    *bool   `json:"volume_available,omitempty"`
	Source             string  `json:"source"`
	UpdatedAt          string  `json:"updated_at"`
}

type CandleResponse struct {
	Source     string `json:"source"`
	FeedMode   string `json:"feed_mode"`
	Timestamp  int64  `json:"timestamp"`
	OpenPaise  int64  `json:"open_paise"`
	HighPaise  int64  `json:"high_paise"`
	LowPaise   int64  `json:"low_paise"`
	ClosePaise int64  `json:"close_paise"`
	Volume     int64  `json:"volume"`
}

// ParseQuoteTime parses an ISO8601/RFC3339 timestamp with or without fractional seconds.
func ParseQuoteTime(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, errors.New("empty timestamp")
	}
	if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, raw)
}
