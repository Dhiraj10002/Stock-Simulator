package dto

import "strings"

// QuoteSource represents the authoritative source classification of a market quote.
type QuoteSource string

const (
	// QuoteSourceAngelOneLive is genuine live market data streamed or fetched from Angel One.
	// Only executable in LIVE feed mode.
	QuoteSourceAngelOneLive QuoteSource = "angelone_live"

	// QuoteSourceSyntheticGBM is synthetic worker-generated market data (Geometric Brownian Motion).
	// Only executable in SYNTHETIC feed mode.
	QuoteSourceSyntheticGBM QuoteSource = "synthetic_gbm"

	// QuoteSourceFNOEngine is derived or simulated F&O pricing engine data (e.g., Black-Scholes).
	// Only executable in SYNTHETIC feed mode or where explicitly supported.
	QuoteSourceFNOEngine QuoteSource = "fno_engine"

	// QuoteSourceSeed represents initial, demo, static benchmark, or test placeholder data.
	// Never executable.
	QuoteSourceSeed QuoteSource = "seed"

	// QuoteSourceUnavailable indicates that no valid quote is present or available.
	// Never executable.
	QuoteSourceUnavailable QuoteSource = "unavailable"
)

// NormalizeQuoteSource normalizes an arbitrary source string into the authoritative QuoteSource taxonomy.
func NormalizeQuoteSource(source string) QuoteSource {
	clean := strings.ToLower(strings.TrimSpace(source))
	switch clean {
	case string(QuoteSourceAngelOneLive):
		return QuoteSourceAngelOneLive
	case string(QuoteSourceSyntheticGBM), "synthetic", "fallback_synthetic":
		return QuoteSourceSyntheticGBM
	case string(QuoteSourceFNOEngine), "simulated_deriv":
		return QuoteSourceFNOEngine
	case string(QuoteSourceSeed), "auto_seeded", "initial_seed", "benchmark_fallback", "static_fallback", "mock":
		return QuoteSourceSeed
	case string(QuoteSourceUnavailable), "":
		return QuoteSourceUnavailable
	default:
		return QuoteSourceUnavailable
	}
}

// IsSeeded returns true if the quote source represents a static seed placeholder.
func (qs QuoteSource) IsSeeded() bool {
	return qs == QuoteSourceSeed
}

// FeedMode represents the operational market feed mode.
type FeedMode string

const (
	// FeedModeLive indicates the market feed expects authoritative live market data from Angel One.
	FeedModeLive FeedMode = "LIVE"

	// FeedModeSynthetic indicates paper-trading simulation mode with synthetic ticks.
	FeedModeSynthetic FeedMode = "SYNTHETIC"

	// FeedModeUnavailable indicates no valid market source is operational.
	FeedModeUnavailable FeedMode = "UNAVAILABLE"
)

// NormalizeFeedMode normalizes a feed mode string to one of the canonical FeedModes.
func NormalizeFeedMode(m string) FeedMode {
	clean := strings.ToUpper(strings.TrimSpace(m))
	switch clean {
	case string(FeedModeLive):
		return FeedModeLive
	case string(FeedModeSynthetic):
		return FeedModeSynthetic
	case string(FeedModeUnavailable):
		return FeedModeUnavailable
	default:
		return FeedModeUnavailable
	}
}

// IsSourceExecutableInMode determines if a given quote source is eligible for execution in the given feed mode.
// Recommended matrix from Phase A:
// - LIVE: angelone_live only
// - SYNTHETIC: synthetic_gbm, fno_engine only
// - UNAVAILABLE: none
func IsSourceExecutableInMode(source QuoteSource, mode FeedMode) bool {
	switch mode {
	case FeedModeLive:
		return source == QuoteSourceAngelOneLive
	case FeedModeSynthetic:
		return source == QuoteSourceSyntheticGBM || source == QuoteSourceFNOEngine
	case FeedModeUnavailable:
		return false
	default:
		return false
	}
}
