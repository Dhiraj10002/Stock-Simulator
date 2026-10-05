package service

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/greeks"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDto "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"gorm.io/gorm"
)

type OptionChainService struct {
	market *marketService.Service
}

func New(market *marketService.Service) *OptionChainService {
	return &OptionChainService{market: market}
}

func (s *OptionChainService) feedMode() marketDto.FeedMode {
	if s == nil || s.market == nil {
		return marketDto.FeedModeSynthetic
	}
	return s.market.FeedMode()
}

func (s *OptionChainService) GetOptionChain(symbol, expiry string) (*dto.OptionChainResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		symbol = "NIFTY"
	}

	// 1. Authoritative contract specifications from unified product registry
	spec, hasSpec := product.GetContractSpec(symbol)
	if !hasSpec {
		spec = product.ContractSpec{
			UnderlyingSymbol: symbol,
			LotSize:          100,
			StrikeStep:       50,
			DefaultSpotPaise: 250000,
			TickSize:         "0.05",
		}
	}

	mode := s.feedMode()
	db := database.GetDB()

	// 2. Override lot size from database underlying instrument if available and positive
	if db != nil {
		var dbUnderlying model.Instrument
		if err := db.Where("UPPER(symbol) = ? OR UPPER(name) = ?", symbol, symbol).First(&dbUnderlying).Error; err == nil {
			if dbUnderlying.LotSize > 0 {
				spec.LotSize = dbUnderlying.LotSize
			}
		}
	}

	// 3. Check for real NFO option contracts in database
	var nfoInstruments []model.Instrument
	if db != nil {
		q := db.Where("(UPPER(underlying_symbol) = ? OR UPPER(name) = ?) AND exchange_segment = 'NFO' AND (option_type = 'CE' OR option_type = 'PE' OR symbol LIKE '%CE' OR symbol LIKE '%PE')", symbol, symbol)
		if mode == marketDto.FeedModeLive {
			q = q.Where("active = ? AND is_tradable = ? AND token ~ '^[0-9]+$'", true, true)
		}
		if expiry == "" {
			var expiries []string
			if err := q.Session(&gorm.Session{}).Model(&model.Instrument{}).Distinct("expiry").Pluck("expiry", &expiries).Error; err != nil {
				return nil, fmt.Errorf("list option expiries: %w", err)
			}
			expiry = nearestOpenExpiry(expiries, time.Now())
			if expiry == "" && mode != marketDto.FeedModeSynthetic {
				return &dto.OptionChainResponse{UnderlyingSymbol: symbol, FeedMode: string(mode), Strikes: []dto.StrikeRow{}}, nil
			}
		}

		if expiry != "" {
			q = q.Where("expiry = ?", expiry)
		}
		if err := q.Find(&nfoInstruments).Error; err != nil {
			return nil, fmt.Errorf("load option contracts: %w", err)
		}
	}

	if mode == marketDto.FeedModeLive {
		eligible := nfoInstruments[:0]
		for _, inst := range nfoInstruments {
			end, err := product.ParseContractExpiry(inst.Expiry)
			if err == nil && end.After(time.Now()) {
				eligible = append(eligible, inst)
			}
		}
		nfoInstruments = eligible
	}
	spotPaise := spec.DefaultSpotPaise
	if mode != marketDto.FeedModeSynthetic {
		spotPaise = 0
	}
	if s.market != nil {
		if quote, err := s.market.CachedQuote(symbol); err == nil && quote != nil && quote.PricePaise > 0 {
			spotPaise = quote.PricePaise
		}
	}
	spotRupees := float64(spotPaise) / 100.0

	if mode != marketDto.FeedModeSynthetic && (len(nfoInstruments) == 0 || spotPaise <= 0) {
		return &dto.OptionChainResponse{UnderlyingSymbol: symbol, ExpiryDate: expiry, SpotPricePaise: spotPaise,
			FeedMode: string(mode), Strikes: []dto.StrikeRow{}}, nil
	}
	// Branch A: Real NFO option contracts found in database
	if len(nfoInstruments) > 0 {
		resp, err := s.buildFromRealInstruments(symbol, expiry, spotPaise, spotRupees, nfoInstruments, spec, mode)
		if err == nil && resp != nil && len(resp.Strikes) > 0 {
			s.annotateDisplay(resp)
			return resp, nil
		}
	}

	// Branch B: Fallback / Simulation generation using unified authoritative specs
	resp, err := s.buildSimulationChain(symbol, expiry, spotPaise, spotRupees, spec, mode)
	if err == nil && resp != nil {
		s.annotateDisplay(resp)
	}
	return resp, err
}

// ParseContractExpiry uses the exchange-local close, retaining expiry-day
// contracts until cutoff and rejecting malformed or expired master rows.
func nearestOpenExpiry(expiries []string, now time.Time) string {
	selected := ""
	var earliest time.Time
	for _, expiry := range expiries {
		end, err := product.ParseContractExpiry(expiry)
		if err == nil && end.After(now) && (selected == "" || end.Before(earliest)) {
			selected, earliest = expiry, end
		}
	}
	return selected
}

func parseExpiryDate(exp string) time.Time {
	exp = strings.TrimSpace(exp)
	formats := []string{
		"2006-01-02",
		"02Jan2006",
		"02-Jan-2006",
		"02Jan06",
		"02-Jan-06",
		"02/01/2006",
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02 15:04:05",
	}
	for _, f := range formats {
		if t, err := time.ParseInLocation(f, exp, calendar.Location()); err == nil {
			return t
		}
	}
	return time.Time{}
}

func (s *OptionChainService) buildFromRealInstruments(
	symbol, requestedExpiry string,
	spotPaise int64, spotRupees float64,
	instruments []model.Instrument,
	spec product.ContractSpec,
	mode marketDto.FeedMode,
) (*dto.OptionChainResponse, error) {
	effectiveExpiry := requestedExpiry
	if effectiveExpiry == "" {
		// Pick first available expiry that actually has valid instruments
		expMap := make(map[string]int)
		for _, inst := range instruments {
			if inst.Expiry != "" {
				expMap[inst.Expiry]++
			}
		}
		var expList []string
		for exp := range expMap {
			expList = append(expList, exp)
		}
		now := time.Now().Truncate(24 * time.Hour)
		sort.Slice(expList, func(i, j int) bool {
			ti := parseExpiryDate(expList[i])
			tj := parseExpiryDate(expList[j])
			if !ti.IsZero() && !tj.IsZero() {
				// Future/today dates come before expired dates
				iExpired := ti.Before(now)
				jExpired := tj.Before(now)
				if iExpired != jExpired {
					return !iExpired
				}
				return ti.Before(tj)
			}
			return expList[i] < expList[j]
		})
		if len(expList) > 0 {
			effectiveExpiry = expList[0]
		}
	}

	// Filter instruments for effectiveExpiry
	type strikePair struct {
		strikePaise int64
		call        *model.Instrument
		put         *model.Instrument
	}
	pairsByStrike := make(map[int64]*strikePair)

	lotSize := spec.LotSize
	for i := range instruments {
		inst := &instruments[i]
		if effectiveExpiry != "" && inst.Expiry != effectiveExpiry {
			continue
		}
		if inst.LotSize > 0 {
			lotSize = inst.LotSize
		}
		sPaise := parseStrikePaise(inst.Strike)
		if sPaise <= 0 {
			sPaise = extractStrikeFromSymbol(inst.Symbol)
		}
		if sPaise <= 0 {
			continue
		}
		pair, exists := pairsByStrike[sPaise]
		if !exists {
			pair = &strikePair{strikePaise: sPaise}
			pairsByStrike[sPaise] = pair
		}
		isCE := strings.EqualFold(inst.OptionType, "CE") || strings.HasSuffix(inst.Symbol, "CE")
		isPE := strings.EqualFold(inst.OptionType, "PE") || strings.HasSuffix(inst.Symbol, "PE")
		if isCE {
			pair.call = inst
		} else if isPE {
			pair.put = inst
		}
	}

	var strikesSorted []int64
	for sPaise := range pairsByStrike {
		strikesSorted = append(strikesSorted, sPaise)
	}
	sort.Slice(strikesSorted, func(i, j int) bool { return strikesSorted[i] < strikesSorted[j] })

	// If no valid strikes found for this expiry, fallback to simulation chain
	if len(strikesSorted) == 0 {
		return s.buildSimulationChain(symbol, effectiveExpiry, spotPaise, spotRupees, spec, mode)
	}

	timeYears := 7.0 / 365.0
	rate := 0.065
	baseVol := 0.15
	if symbol == "BANKNIFTY" {
		baseVol = 0.18
	}

	var totalCallOI int64
	var totalPutOI int64
	strikeRows := make([]dto.StrikeRow, 0, len(strikesSorted))

	minDiff := math.MaxFloat64
	var atmStrikePaise int64
	for _, sPaise := range strikesSorted {
		diff := math.Abs(float64(sPaise) - float64(spotPaise))
		if diff < minDiff {
			minDiff = diff
			atmStrikePaise = sPaise
		}
	}

	for _, sPaise := range strikesSorted {
		pair := pairsByStrike[sPaise]
		strikeRupees := float64(sPaise) / 100.0
		isATM := sPaise == atmStrikePaise

		moneyness := math.Abs(strikeRupees-spotRupees) / spotRupees
		vol := baseVol + moneyness*0.10
		callGreeks := greeks.CalculateGreeks(spotRupees, strikeRupees, timeYears, rate, vol, true)
		putGreeks := greeks.CalculateGreeks(spotRupees, strikeRupees, timeYears, rate, vol, false)

		var ceContract dto.OptionContract
		if pair.call != nil {
			var cePrice int64
			var callOI int64
			isAvailable := false
			quoteStatus := string(marketDto.QuoteSourceUnavailable)

			if mode == marketDto.FeedModeLive {
				// LIVE mode: strictly read live quotes from Redis. Never write/seed to Redis!
				if s.market != nil {
					if q, err := s.market.RawCachedQuote(pair.call.Symbol); err == nil && q != nil && q.PricePaise > 0 {
						cePrice = q.PricePaise
						callOI = q.OpenInterest
						isAvailable = true
						quoteStatus = string(q.Source)
					}
				}
			} else if mode == marketDto.FeedModeSynthetic {
				// SYNTHETIC mode: calculate Black-Scholes price and seed to Redis
				cePrice = int64(math.Round(callGreeks.Price * 100))
				if cePrice < 50 {
					cePrice = 50
				}
				callOI = int64(100000)
				isAvailable = true
				quoteStatus = string(marketDto.QuoteSourceSyntheticGBM)
				if s.market != nil {
					if q, err := s.market.CachedQuote(pair.call.Symbol); err == nil && q != nil && q.PricePaise > 0 {
						cePrice = q.PricePaise
					} else {
						_ = s.market.SetQuote(pair.call.Symbol, cePrice, callOI)
					}
				}
			}

			totalCallOI += callOI
			ceContract = dto.OptionContract{
				Symbol:           pair.call.Symbol,
				OptionType:       "CE",
				StrikePricePaise: sPaise,
				LTPPaise:         cePrice,
				OpenInterest:     callOI,
				IV:               callGreeks.IV,
				Delta:            callGreeks.Delta,
				Gamma:            callGreeks.Gamma,
				Theta:            callGreeks.Theta,
				Vega:             callGreeks.Vega,
				LotSize:          lotSize,
				IsAvailable:      isAvailable,
				QuoteStatus:      quoteStatus,
			}
		}

		var peContract dto.OptionContract
		if pair.put != nil {
			var pePrice int64
			var putOI int64
			isAvailable := false
			quoteStatus := string(marketDto.QuoteSourceUnavailable)

			if mode == marketDto.FeedModeLive {
				// LIVE mode: strictly read live quotes from Redis. Never write/seed to Redis!
				if s.market != nil {
					if q, err := s.market.RawCachedQuote(pair.put.Symbol); err == nil && q != nil && q.PricePaise > 0 {
						pePrice = q.PricePaise
						putOI = q.OpenInterest
						isAvailable = true
						quoteStatus = string(q.Source)
					}
				}
			} else if mode == marketDto.FeedModeSynthetic {
				// SYNTHETIC mode: calculate Black-Scholes price and seed to Redis
				pePrice = int64(math.Round(putGreeks.Price * 100))
				if pePrice < 50 {
					pePrice = 50
				}
				putOI = int64(100000)
				isAvailable = true
				quoteStatus = string(marketDto.QuoteSourceSyntheticGBM)
				if s.market != nil {
					if q, err := s.market.CachedQuote(pair.put.Symbol); err == nil && q != nil && q.PricePaise > 0 {
						pePrice = q.PricePaise
					} else {
						_ = s.market.SetQuote(pair.put.Symbol, pePrice, putOI)
					}
				}
			}

			totalPutOI += putOI
			peContract = dto.OptionContract{
				Symbol:           pair.put.Symbol,
				OptionType:       "PE",
				StrikePricePaise: sPaise,
				LTPPaise:         pePrice,
				OpenInterest:     putOI,
				IV:               putGreeks.IV,
				Delta:            putGreeks.Delta,
				Gamma:            putGreeks.Gamma,
				Theta:            putGreeks.Theta,
				Vega:             putGreeks.Vega,
				LotSize:          lotSize,
				IsAvailable:      isAvailable,
				QuoteStatus:      quoteStatus,
			}
		}

		strikeRows = append(strikeRows, dto.StrikeRow{
			StrikePricePaise: sPaise,
			IsATM:            isATM,
			Call:             ceContract,
			Put:              peContract,
		})
	}

	pcr := 1.0
	if totalCallOI > 0 {
		pcr = math.Round((float64(totalPutOI)/float64(totalCallOI))*100) / 100
	}

	return &dto.OptionChainResponse{
		UnderlyingSymbol: symbol,
		SpotPricePaise:   spotPaise,
		ExpiryDate:       effectiveExpiry,
		TotalCallOI:      totalCallOI,
		TotalPutOI:       totalPutOI,
		PutCallRatio:     pcr,
		LotSize:          lotSize,
		FeedMode:         string(mode),
		Strikes:          strikeRows,
	}, nil
}

func (s *OptionChainService) buildSimulationChain(
	symbol, expiry string,
	spotPaise int64, spotRupees float64,
	spec product.ContractSpec,
	mode marketDto.FeedMode,
) (*dto.OptionChainResponse, error) {
	step := spec.StrikeStep
	if step <= 0 {
		step = 50
	}
	atmStrike := math.Round(spotRupees/float64(step)) * float64(step)

	if expiry == "" {
		expiry = nextExpiryThursday()
	}

	timeYears := 7.0 / 365.0
	rate := 0.065
	baseVol := 0.15
	if symbol == "BANKNIFTY" {
		baseVol = 0.18
	}

	strikesCount := 10
	strikeRows := make([]dto.StrikeRow, 0, strikesCount*2+1)
	var totalCallOI int64
	var totalPutOI int64

	monthCode := time.Now().Format("02Jan")

	for i := -strikesCount; i <= strikesCount; i++ {
		strikeRupees := atmStrike + float64(i*int(step))
		strikePaise := int64(math.Round(strikeRupees * 100))
		isATM := i == 0

		moneyness := math.Abs(strikeRupees-spotRupees) / spotRupees
		vol := baseVol + moneyness*0.10

		callGreeks := greeks.CalculateGreeks(spotRupees, strikeRupees, timeYears, rate, vol, true)
		putGreeks := greeks.CalculateGreeks(spotRupees, strikeRupees, timeYears, rate, vol, false)

		ceSymbol := fmt.Sprintf("%s%s%dCE", symbol, strings.ToUpper(monthCode), int(strikeRupees))
		peSymbol := fmt.Sprintf("%s%s%dPE", symbol, strings.ToUpper(monthCode), int(strikeRupees))

		var cePrice, pePrice int64
		var callOI, putOI int64
		ceAvailable, peAvailable := false, false
		ceQuoteStatus, peQuoteStatus := string(marketDto.QuoteSourceUnavailable), string(marketDto.QuoteSourceUnavailable)

		if mode == marketDto.FeedModeLive {
			// In LIVE mode: only serve live quotes if they exist in Redis.
			// NEVER fabricate prices or write to Redis via SetQuote!
			if s.market != nil {
				if q, err := s.market.CachedQuote(ceSymbol); err == nil && q != nil && q.PricePaise > 0 {
					cePrice = q.PricePaise
					callOI = q.OpenInterest
					ceAvailable = true
					ceQuoteStatus = string(q.Source)
				}
				if q, err := s.market.CachedQuote(peSymbol); err == nil && q != nil && q.PricePaise > 0 {
					pePrice = q.PricePaise
					putOI = q.OpenInterest
					peAvailable = true
					peQuoteStatus = string(q.Source)
				}
			}
		} else if mode == marketDto.FeedModeSynthetic {
			// In SYNTHETIC mode: Compute theoretical Black-Scholes prices and seed Redis
			cePrice = int64(math.Round(callGreeks.Price * 100))
			pePrice = int64(math.Round(putGreeks.Price * 100))
			if cePrice < 50 {
				cePrice = 50
			}
			if pePrice < 50 {
				pePrice = 50
			}

			baseOI := int64(50000)
			oiDist := math.Exp(-moneyness * 5.0)
			callOI = int64(float64(baseOI)*(1.0+oiDist*3.0)) + int64(math.Sin(float64(i))*5000)
			putOI = int64(float64(baseOI)*(1.0+oiDist*3.2)) + int64(math.Cos(float64(i))*5000)

			ceAvailable, peAvailable = true, true
			ceQuoteStatus, peQuoteStatus = string(marketDto.QuoteSourceSyntheticGBM), string(marketDto.QuoteSourceSyntheticGBM)

			if s.market != nil {
				if q, err := s.market.CachedQuote(ceSymbol); err == nil && q != nil && q.PricePaise > 0 {
					cePrice = q.PricePaise
				} else {
					_ = s.market.SetQuote(ceSymbol, cePrice, callOI)
				}
				if q, err := s.market.CachedQuote(peSymbol); err == nil && q != nil && q.PricePaise > 0 {
					pePrice = q.PricePaise
				} else {
					_ = s.market.SetQuote(peSymbol, pePrice, putOI)
				}
			}
		}

		totalCallOI += callOI
		totalPutOI += putOI

		strikeRows = append(strikeRows, dto.StrikeRow{
			StrikePricePaise: strikePaise,
			IsATM:            isATM,
			Call: dto.OptionContract{
				Symbol:           ceSymbol,
				OptionType:       "CE",
				StrikePricePaise: strikePaise,
				LTPPaise:         cePrice,
				OpenInterest:     callOI,
				IV:               callGreeks.IV,
				Delta:            callGreeks.Delta,
				Gamma:            callGreeks.Gamma,
				Theta:            callGreeks.Theta,
				Vega:             callGreeks.Vega,
				LotSize:          spec.LotSize,
				IsAvailable:      ceAvailable,
				QuoteStatus:      ceQuoteStatus,
			},
			Put: dto.OptionContract{
				Symbol:           peSymbol,
				OptionType:       "PE",
				StrikePricePaise: strikePaise,
				LTPPaise:         pePrice,
				OpenInterest:     putOI,
				IV:               putGreeks.IV,
				Delta:            putGreeks.Delta,
				Gamma:            putGreeks.Gamma,
				Theta:            putGreeks.Theta,
				Vega:             putGreeks.Vega,
				LotSize:          spec.LotSize,
				IsAvailable:      peAvailable,
				QuoteStatus:      peQuoteStatus,
			},
		})
	}

	pcr := 1.0
	if totalCallOI > 0 {
		pcr = math.Round((float64(totalPutOI)/float64(totalCallOI))*100) / 100
	}

	return &dto.OptionChainResponse{
		UnderlyingSymbol: symbol,
		SpotPricePaise:   spotPaise,
		ExpiryDate:       expiry,
		TotalCallOI:      totalCallOI,
		TotalPutOI:       totalPutOI,
		PutCallRatio:     pcr,
		LotSize:          spec.LotSize,
		FeedMode:         string(mode),
		Strikes:          strikeRows,
	}, nil
}

func parseStrikePaise(strikeStr string) int64 {
	strikeStr = strings.TrimSpace(strikeStr)
	if strikeStr == "" {
		return 0
	}
	parts := strings.Split(strikeStr, ".")
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0
	}
	// In Angel One instrument master, strike prices are in paise with 6 decimals: e.g. "230000.000000"
	if len(parts) > 1 && len(parts[1]) >= 4 {
		return whole
	}
	if len(parts) == 1 {
		if whole >= 100000 {
			return whole
		}
		return whole * 100
	}
	frac := parts[1]
	for len(frac) < 2 {
		frac += "0"
	}
	if len(frac) > 2 {
		frac = frac[:2]
	}
	minor, _ := strconv.ParseInt(frac, 10, 64)
	return whole*100 + minor
}

func extractStrikeFromSymbol(sym string) int64 {
	re := regexp.MustCompile(`(\d+(?:\.\d+)?)(?:CE|PE)$`)
	m := re.FindStringSubmatch(sym)
	if len(m) > 1 {
		val, err := strconv.ParseFloat(m[1], 64)
		if err == nil && val > 0 {
			return int64(math.Round(val * 100))
		}
	}
	return 0
}

func nextExpiryThursday() string {
	now := time.Now()
	daysUntilThursday := (int(time.Thursday) - int(now.Weekday()) + 7) % 7
	if daysUntilThursday == 0 && now.Hour() >= 15 && now.Minute() >= 30 {
		daysUntilThursday = 7
	}
	nextThursday := now.AddDate(0, 0, daysUntilThursday)
	return nextThursday.Format("02-Jan-2006")
}

// Cached prices are suitable for display only; execution still validates its
// own live quote. Availability and freshness are separate states.
func (s *OptionChainService) annotateDisplay(resp *dto.OptionChainResponse) {
	for i := range resp.Strikes {
		for _, contract := range []*dto.OptionContract{&resp.Strikes[i].Call, &resp.Strikes[i].Put} {
			contract.AnalyticsSource = "BLACK_SCHOLES_ASSUMED_VOLATILITY"
			if s.market == nil || !contract.IsAvailable {
				continue
			}
			q, err := s.market.RawCachedQuote(contract.Symbol)
			if err != nil || q == nil {
				continue
			}
			contract.UpdatedAt, contract.QuoteSource = q.UpdatedAt, q.Source
			contract.OpenInterestAvailable = q.OpenInterestAvailable
			contract.DayChangeAvailable = q.DayChangeAvailable
			contract.ChangePaise, contract.ChangePercent = q.ChangePaise, q.ChangePercent
			contract.IsQuoteStale = marketService.ValidateExecutableQuoteWithMode(q, time.Now(), s.market.AllowSeededQuotes()) != nil
			contract.QuoteStatus = "FRESH"
			if contract.IsQuoteStale {
				contract.QuoteStatus = "STALE"
			}
		}
	}
}
