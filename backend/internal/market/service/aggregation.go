package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/redis/go-redis/v9"
)

// EquityUniverseItem represents an equity instrument considered for market aggregation.
type EquityUniverseItem struct {
	Symbol   string `json:"symbol"`
	Name     string `json:"name"`
	Exchange string `json:"exchange"`
}

// DefaultEquityUniverse represents the benchmark institutional equities evaluated when
// running in standalone or initial-bootstrap environments without a populated database.
var DefaultEquityUniverse = []EquityUniverseItem{
	{Symbol: "RELIANCE", Name: "Reliance Industries", Exchange: "NSE"},
	{Symbol: "TCS", Name: "Tata Consultancy Services", Exchange: "NSE"},
	{Symbol: "INFY", Name: "Infosys Ltd", Exchange: "NSE"},
	{Symbol: "HDFCBANK", Name: "HDFC Bank Ltd", Exchange: "NSE"},
	{Symbol: "TATAMOTORS", Name: "Tata Motors Ltd", Exchange: "NSE"},
	{Symbol: "BHARTIARTL", Name: "Bharti Airtel Ltd", Exchange: "NSE"},
	{Symbol: "ETERNAL", Name: "Eternal (formerly Zomato)", Exchange: "NSE"},
	{Symbol: "SUZLON", Name: "Suzlon Energy Ltd", Exchange: "NSE"},
	{Symbol: "TRENT", Name: "Trent Ltd", Exchange: "NSE"},
	{Symbol: "ADANIENT", Name: "Adani Enterprises Ltd", Exchange: "NSE"},
	{Symbol: "YESBANK", Name: "Yes Bank Ltd", Exchange: "NSE"},
	{Symbol: "BEL", Name: "Bharat Electronics Ltd", Exchange: "NSE"},
	{Symbol: "SBIN", Name: "State Bank of India", Exchange: "NSE"},
	{Symbol: "ICICIBANK", Name: "ICICI Bank Ltd", Exchange: "NSE"},
	{Symbol: "ATGL", Name: "Adani Total Gas Ltd", Exchange: "NSE"},
	{Symbol: "POONAWALLA", Name: "Poonawalla Fincorp", Exchange: "NSE"},
	{Symbol: "TATACHEM", Name: "Tata Chemicals Ltd", Exchange: "NSE"},
	{Symbol: "TATAPOWER", Name: "Tata Power Co Ltd", Exchange: "NSE"},
	{Symbol: "PRAJIND", Name: "Praj Industries Ltd", Exchange: "NSE"},
	{Symbol: "BAJFINANCE", Name: "Bajaj Finance Ltd", Exchange: "NSE"},
	{Symbol: "AXISBANK", Name: "Axis Bank Ltd", Exchange: "NSE"},
	{Symbol: "KOTAKBANK", Name: "Kotak Mahindra Bank", Exchange: "NSE"},
	{Symbol: "APARINDS", Name: "Apar Industries Ltd", Exchange: "NSE"},
	{Symbol: "MARUTI", Name: "Maruti Suzuki India", Exchange: "NSE"},
}

// GetEquityUniverse resolves the active equity universe from a custom provider,
// the canonical instruments database table, or DefaultEquityUniverse as a fallback.
func (s *Service) GetEquityUniverse(ctx context.Context) ([]EquityUniverseItem, error) {
	if s != nil && s.equityProvider != nil {
		items, err := s.equityProvider(ctx)
		if err == nil && len(items) > 0 {
			return items, nil
		}
	}

	if s != nil && s.db != nil {
		var dbItems []EquityUniverseItem
		err := s.db.WithContext(ctx).
			Table("instruments").
			Select("symbol, name, exchange").
			Where("exchange_segment = ? AND (instrument_type = ? OR instrument_type = ? OR instrument_type = '') AND active = ?", "NSE", "EQUITY", "EQ", true).
			Order("symbol ASC").
			Find(&dbItems).Error
		if err == nil && len(dbItems) > 0 {
			return dbItems, nil
		}
	}

	return DefaultEquityUniverse, nil
}

// collectValidEquityQuotes extracts, validates, and standardizes authoritative live quotes
// for all equities in the configured universe. Quotes failing freshness, price validity,
// or feed-mode compliance are strictly excluded.
func (s *Service) collectValidEquityQuotes(ctx context.Context) ([]dto.MarketMoverItem, error) {
	if s == nil || s.client == nil {
		return nil, ErrQuoteUnavailable
	}

	mode := s.FeedMode()
	if mode == dto.FeedModeUnavailable {
		return nil, ErrQuoteUnavailable
	}

	// Verify Redis feed state
	if feedState, err := s.client.HGet(ctx, FeedStateKey, "feed_state").Result(); err == nil {
		if strings.ToUpper(strings.TrimSpace(feedState)) == string(dto.FeedModeUnavailable) {
			return nil, ErrQuoteUnavailable
		}
	}

	universe, err := s.GetEquityUniverse(ctx)
	if err != nil {
		return nil, err
	}
	if len(universe) == 0 {
		return nil, nil
	}

	// Execute single pipelined HGetAll for the entire equity universe
	pipe := s.client.Pipeline()
	cmds := make(map[string]*redis.MapStringStringCmd, len(universe))
	for _, inst := range universe {
		cmds[inst.Symbol] = pipe.HGetAll(ctx, quoteKey(inst.Symbol))
	}
	_, err = pipe.Exec(ctx)
	if err != nil && !errors.Is(err, redis.Nil) {
		return nil, fmt.Errorf("%w: %v", cache.ErrUnavailable, err)
	}

	now := time.Now()
	items := make([]dto.MarketMoverItem, 0, len(universe))

	for _, inst := range universe {
		values := cmds[inst.Symbol].Val()
		if len(values) == 0 {
			// Check canonical alias
			canonical := alias.ResolveCanonicalSymbol(inst.Symbol)
			if canonical != "" && canonical != inst.Symbol {
				if cValues, cErr := s.client.HGetAll(ctx, quoteKey(canonical)).Result(); cErr == nil && len(cValues) > 0 {
					values = cValues
				}
			}
		}

		if len(values) == 0 {
			continue
		}

		source := values["source"]
		if !s.allowSeededQuotes && IsSeededSource(source) {
			continue
		}

		normSource := dto.NormalizeQuoteSource(source)
		if mode == dto.FeedModeLive && normSource != dto.QuoteSourceAngelOneLive {
			continue
		}
		if mode == dto.FeedModeSynthetic && normSource == dto.QuoteSourceAngelOneLive {
			continue
		}

		price, parsePriceErr := strconv.ParseInt(values["price_paise"], 10, 64)
		if parsePriceErr != nil || price <= 0 {
			continue
		}

		updatedAtStr, ok := values["updated_at"]
		if !ok || strings.TrimSpace(updatedAtStr) == "" {
			continue
		}

		updatedAt, parseErr := time.Parse(time.RFC3339, updatedAtStr)
		if parseErr != nil || now.Sub(updatedAt) > maxExecutableQuoteAge {
			continue
		}

		var changePaise int64
		var changePercent float64
		var volume int64
		if cp, ok := values["change_paise"]; ok {
			changePaise, _ = strconv.ParseInt(cp, 10, 64)
		}
		if cp, ok := values["change_percent"]; ok {
			changePercent, _ = strconv.ParseFloat(cp, 64)
		}
		if v, ok := values["volume"]; ok {
			volume, _ = strconv.ParseInt(v, 10, 64)
		}

		turnover := (float64(price) / 100.0) * float64(volume)

		// TrendingScore Formula:
		//   Score = |ChangePercent| * (1.0 + log10(max(1.0, Volume)))
		// Combines percentage price velocity scaled logarithmically by accumulated market
		// volume. If volume is unrecorded or zero, the multiplier degrades smoothly to 1.0,
		// preserving pure price velocity.
		volMultiplier := 1.0 + math.Log10(math.Max(1.0, float64(volume)))
		trendingScore := math.Abs(changePercent) * volMultiplier

		items = append(items, dto.MarketMoverItem{
			Symbol:        inst.Symbol,
			Name:          inst.Name,
			PricePaise:    price,
			ChangePaise:   changePaise,
			ChangePercent: math.Round(changePercent*100) / 100,
			Volume:        volume,
			Turnover:      math.Round(turnover*100) / 100,
			TrendingScore: math.Round(trendingScore*100) / 100,
			Exchange:      inst.Exchange,
			Source:        source,
			UpdatedAt:     values["updated_at"],
		})
	}

	return items, nil
}

// GetMarketMovers dynamically computes top gainers, top losers, most traded,
// and trending equities from authoritative live quotes.
//
// In accordance with Master Plan Acceptance Criteria:
// - All values are computed dynamically from valid quotes in the configured universe.
// - Never returns static mock arrays. When quotes are unavailable or empty, returns empty slices.
func (s *Service) GetMarketMovers(ctx context.Context, limit int) (*dto.MarketMoversResponse, error) {
	if limit <= 0 {
		limit = 10
	} else if limit > 50 {
		limit = 50
	}

	items, err := s.collectValidEquityQuotes(ctx)
	if err != nil {
		return nil, err
	}

	resp := &dto.MarketMoversResponse{
		Gainers:    make([]dto.MarketMoverItem, 0),
		Losers:     make([]dto.MarketMoverItem, 0),
		MostTraded: make([]dto.MarketMoverItem, 0),
		Trending:   make([]dto.MarketMoverItem, 0),
		UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
	}

	if len(items) == 0 {
		return resp, nil
	}

	// 1. Top Gainers: changePercent > 0 or changePaise > 0, sorted descending
	var gainers []dto.MarketMoverItem
	for _, it := range items {
		if it.ChangePercent > 0 || it.ChangePaise > 0 {
			gainers = append(gainers, it)
		}
	}
	sort.Slice(gainers, func(i, j int) bool {
		if gainers[i].ChangePercent != gainers[j].ChangePercent {
			return gainers[i].ChangePercent > gainers[j].ChangePercent
		}
		return gainers[i].Volume > gainers[j].Volume
	})
	if len(gainers) > limit {
		gainers = gainers[:limit]
	}
	resp.Gainers = gainers

	// 2. Top Losers: changePercent < 0 or changePaise < 0, sorted ascending (biggest drop first)
	var losers []dto.MarketMoverItem
	for _, it := range items {
		if it.ChangePercent < 0 || it.ChangePaise < 0 {
			losers = append(losers, it)
		}
	}
	sort.Slice(losers, func(i, j int) bool {
		if losers[i].ChangePercent != losers[j].ChangePercent {
			return losers[i].ChangePercent < losers[j].ChangePercent
		}
		return losers[i].Volume > losers[j].Volume
	})
	if len(losers) > limit {
		losers = losers[:limit]
	}
	resp.Losers = losers

	// 3. Most Traded: ranked by turnover, then volume, then absolute changePercent
	traded := make([]dto.MarketMoverItem, len(items))
	copy(traded, items)
	sort.Slice(traded, func(i, j int) bool {
		if traded[i].Turnover != traded[j].Turnover {
			return traded[i].Turnover > traded[j].Turnover
		}
		if traded[i].Volume != traded[j].Volume {
			return traded[i].Volume > traded[j].Volume
		}
		return math.Abs(traded[i].ChangePercent) > math.Abs(traded[j].ChangePercent)
	})
	if len(traded) > limit {
		traded = traded[:limit]
	}
	resp.MostTraded = traded

	// 4. Trending: ranked by TrendingScore (|ChangePercent| * (1 + log10(max(1, Volume))))
	trending := make([]dto.MarketMoverItem, len(items))
	copy(trending, items)
	sort.Slice(trending, func(i, j int) bool {
		if trending[i].TrendingScore != trending[j].TrendingScore {
			return trending[i].TrendingScore > trending[j].TrendingScore
		}
		return trending[i].Volume > trending[j].Volume
	})
	if len(trending) > limit {
		trending = trending[:limit]
	}
	resp.Trending = trending

	return resp, nil
}

// GetMarketBreadth dynamically computes advances, declines, and unchanged counts
// across the configured equity universe.
func (s *Service) GetMarketBreadth(ctx context.Context) (*dto.MarketBreadthResponse, error) {
	items, err := s.collectValidEquityQuotes(ctx)
	if err != nil {
		return nil, err
	}

	advances := 0
	declines := 0
	unchanged := 0

	for _, item := range items {
		if item.ChangePercent > 0 || item.ChangePaise > 0 {
			advances++
		} else if item.ChangePercent < 0 || item.ChangePaise < 0 {
			declines++
		} else {
			unchanged++
		}
	}

	total := advances + declines + unchanged
	var adRatio float64
	if declines > 0 {
		adRatio = math.Round((float64(advances)/float64(declines))*100) / 100
	} else if advances > 0 {
		adRatio = float64(advances)
	}

	var advPct float64
	if total > 0 {
		advPct = math.Round((float64(advances)/float64(total))*10000) / 100
	}

	return &dto.MarketBreadthResponse{
		Advances:            advances,
		Declines:            declines,
		Unchanged:           unchanged,
		Total:               total,
		AdvanceDeclineRatio: adRatio,
		AdvancePercent:      advPct,
		UpdatedAt:           time.Now().UTC().Format(time.RFC3339),
	}, nil
}
