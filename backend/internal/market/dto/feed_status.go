package dto

type FeedStatusResponse struct {
	FeedProvider          string `json:"feed_provider"`
	FeedState             string `json:"feed_state"`
	IsSynthetic           bool   `json:"is_synthetic"`
	LastTick              string `json:"last_tick,omitempty"`
	UpdatedAt             string `json:"updated_at,omitempty"`
	SubscribedTokensCount int    `json:"subscribed_tokens_count,omitempty"`
}

