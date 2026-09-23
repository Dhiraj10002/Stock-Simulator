package service

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/greeks"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
)

type OptionChainService struct {
	market *marketService.Service
}

func New(market *marketService.Service) *OptionChainService {
	return &OptionChainService{market: market}
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
		q := db.Where("(UPPER(underlying_symbol) = ? OR UPPER(name) = ?) AND exchange_segment = 'NFO' AND (option_type = 'CE' OR option_type = 'PE')", symbol, symbol)
		if expiry != "" {
			q = q.Where("expiry = ?", expiry)
		}
		_ = q.Find(&nfoInstruments).Error
	}

	spotPaise := spec.DefaultSpotPaise
	if s.market != nil {
		if quote, err := s.market.CurrentQuote(symbol); err == nil && quote != nil && quote.PricePaise > 0 {
			spotPaise = quote.PricePaise
		}
	}
	spotRupees := float64(spotPaise) / 100.0

	// Branch A: Real NFO option contracts found in database
	if len(nfoInstruments) > 0 {
		return s.buildFromRealInstruments(symbol, expiry, spotPaise, spotRupees, nfoInstruments, spec)
	}

	// Branch B: Fallback / Simulation generation using unified authoritative specs
	return s.buildSimulationChain(symbol, expiry, spotPaise, spotRupees, spec)
}

func (s *OptionChainService) buildFromRealInstruments(
	symbol, requestedExpiry string,
	spotPaise int64, spotRupees float64,
	instruments []model.Instrument,
	spec product.ContractSpec,
) (*dto.OptionChainResponse, error) {
	effectiveExpiry := requestedExpiry
	if effectiveExpiry == "" {
		// Pick first available expiry
		expMap := make(map[string]struct{})
		for _, inst := range instruments {
			if inst.Expiry != "" {
				expMap[inst.Expiry] = struct{}{}
			}
		}
		var expList []string
		for exp := range expMap {
			expList = append(expList, exp)
		}
		sort.Strings(expList)
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
			continue
		}
		pair, exists := pairsByStrike[sPaise]
		if !exists {
			pair = &strikePair{strikePaise: sPaise}
			pairsByStrike[sPaise] = pair
		}
		if strings.EqualFold(inst.OptionType, "CE") {
			pair.call = inst
		} else if strings.EqualFold(inst.OptionType, "PE") {
			pair.put = inst
		}
	}

	var strikesSorted []int64
	for sPaise := range pairsByStrike {
		strikesSorted = append(strikesSorted, sPaise)
	}
	sort.Slice(strikesSorted, func(i, j int) bool { return strikesSorted[i] < strikesSorted[j] })

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
			cePrice := int64(math.Round(callGreeks.Price * 100))
			if cePrice < 50 {
				cePrice = 50
			}
			callOI := int64(100000)
			if s.market != nil {
				if q, err := s.market.CurrentQuote(pair.call.Symbol); err == nil && q != nil && q.PricePaise > 0 {
					cePrice = q.PricePaise
				} else {
					_ = s.market.SetQuote(pair.call.Symbol, cePrice, callOI)
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
			}
		}

		var peContract dto.OptionContract
		if pair.put != nil {
			pePrice := int64(math.Round(putGreeks.Price * 100))
			if pePrice < 50 {
				pePrice = 50
			}
			putOI := int64(100000)
			if s.market != nil {
				if q, err := s.market.CurrentQuote(pair.put.Symbol); err == nil && q != nil && q.PricePaise > 0 {
					pePrice = q.PricePaise
				} else {
					_ = s.market.SetQuote(pair.put.Symbol, pePrice, putOI)
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
		Strikes:          strikeRows,
	}, nil
}

func (s *OptionChainService) buildSimulationChain(
	symbol, expiry string,
	spotPaise int64, spotRupees float64,
	spec product.ContractSpec,
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

		decayFactor := math.Exp(-moneyness * 12.0)
		callOI := int64(math.Round(185000.0*decayFactor)) + int64(math.Abs(float64(i*450)))
		putOI := int64(math.Round(195000.0*decayFactor)) + int64(math.Abs(float64(i*380)))

		totalCallOI += callOI
		totalPutOI += putOI

		ceSymbol := fmt.Sprintf("%s%s%.0fCE", symbol, strings.ToUpper(monthCode), strikeRupees)
		peSymbol := fmt.Sprintf("%s%s%.0fPE", symbol, strings.ToUpper(monthCode), strikeRupees)

		ceLTPPaise := int64(math.Round(callGreeks.Price * 100))
		if ceLTPPaise < 50 {
			ceLTPPaise = 50
		}
		peLTPPaise := int64(math.Round(putGreeks.Price * 100))
		if peLTPPaise < 50 {
			peLTPPaise = 50
		}

		if s.market != nil {
			_ = s.market.SetQuote(ceSymbol, ceLTPPaise, callOI)
			_ = s.market.SetQuote(peSymbol, peLTPPaise, putOI)
		}

		strikeRows = append(strikeRows, dto.StrikeRow{
			StrikePricePaise: strikePaise,
			IsATM:            isATM,
			Call: dto.OptionContract{
				Symbol:           ceSymbol,
				OptionType:       "CE",
				StrikePricePaise: strikePaise,
				LTPPaise:         ceLTPPaise,
				OpenInterest:     callOI,
				IV:               callGreeks.IV,
				Delta:            callGreeks.Delta,
				Gamma:            callGreeks.Gamma,
				Theta:            callGreeks.Theta,
				Vega:             callGreeks.Vega,
				LotSize:          spec.LotSize,
			},
			Put: dto.OptionContract{
				Symbol:           peSymbol,
				OptionType:       "PE",
				StrikePricePaise: strikePaise,
				LTPPaise:         peLTPPaise,
				OpenInterest:     putOI,
				IV:               putGreeks.IV,
				Delta:            putGreeks.Delta,
				Gamma:            putGreeks.Gamma,
				Theta:            putGreeks.Theta,
				Vega:             putGreeks.Vega,
				LotSize:          spec.LotSize,
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
	if len(parts) == 1 {
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

func nextExpiryThursday() string {
	now := time.Now()
	daysUntilThursday := (int(time.Thursday) - int(now.Weekday()) + 7) % 7
	if daysUntilThursday == 0 && now.Hour() >= 15 && now.Minute() >= 30 {
		daysUntilThursday = 7
	}
	nextThursday := now.AddDate(0, 0, daysUntilThursday)
	return nextThursday.Format("02-Jan-2006")
}
