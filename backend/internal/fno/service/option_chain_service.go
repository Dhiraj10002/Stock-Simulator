package service

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/greeks"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
)

type OptionChainService struct {
	market *marketService.Service
}

func New(market *marketService.Service) *OptionChainService {
	return &OptionChainService{market: market}
}

type instrumentConfig struct {
	DefaultSpotPaise int64
	StrikeStep       int64
	LotSize          int64
}

var instrumentConfigs = map[string]instrumentConfig{
	"NIFTY":     {DefaultSpotPaise: 2532000, StrikeStep: 50, LotSize: 50},
	"BANKNIFTY": {DefaultSpotPaise: 5215000, StrikeStep: 100, LotSize: 15},
	"RELIANCE":  {DefaultSpotPaise: 124400, StrikeStep: 20, LotSize: 250},
	"TCS":       {DefaultSpotPaise: 219000, StrikeStep: 50, LotSize: 175},
	"INFY":      {DefaultSpotPaise: 105800, StrikeStep: 20, LotSize: 400},
	"HDFCBANK":  {DefaultSpotPaise: 71300, StrikeStep: 20, LotSize: 550},
}

func (s *OptionChainService) GetOptionChain(symbol, expiry string) (*dto.OptionChainResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		symbol = "NIFTY"
	}

	cfg, exists := instrumentConfigs[symbol]
	if !exists {
		cfg = instrumentConfig{DefaultSpotPaise: 250000, StrikeStep: 50, LotSize: 100}
	}

	spotPaise := cfg.DefaultSpotPaise
	if s.market != nil {
		if quote, err := s.market.CurrentQuote(symbol); err == nil && quote != nil && quote.PricePaise > 0 {
			spotPaise = quote.PricePaise
		}
	}

	spotRupees := float64(spotPaise) / 100.0
	step := cfg.StrikeStep
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

	strikesCount := 10 // 10 strikes above and 10 below ATM (21 total)
	strikeRows := make([]dto.StrikeRow, 0, strikesCount*2+1)

	var totalCallOI int64
	var totalPutOI int64

	monthCode := time.Now().Format("02Jan")

	for i := -strikesCount; i <= strikesCount; i++ {
		strikeRupees := atmStrike + float64(i*int(step))
		strikePaise := int64(math.Round(strikeRupees * 100))
		isATM := i == 0

		// Volatility skew simulation (OTM Puts and ITM Calls have slight volatility premium)
		moneyness := math.Abs(strikeRupees - spotRupees) / spotRupees
		vol := baseVol + moneyness*0.10

		callGreeks := greeks.CalculateGreeks(spotRupees, strikeRupees, timeYears, rate, vol, true)
		putGreeks := greeks.CalculateGreeks(spotRupees, strikeRupees, timeYears, rate, vol, false)

		// Realistic bell-curve open interest around ATM
		decayFactor := math.Exp(-moneyness * 12.0)
		callOI := int64(math.Round(185000.0*decayFactor)) + int64(math.Abs(float64(i*450)))
		putOI := int64(math.Round(195000.0*decayFactor)) + int64(math.Abs(float64(i*380)))

		totalCallOI += callOI
		totalPutOI += putOI

		ceSymbol := fmt.Sprintf("%s%s%.0fCE", symbol, strings.ToUpper(monthCode), strikeRupees)
		peSymbol := fmt.Sprintf("%s%s%.0fPE", symbol, strings.ToUpper(monthCode), strikeRupees)

		strikeRows = append(strikeRows, dto.StrikeRow{
			StrikePricePaise: strikePaise,
			IsATM:            isATM,
			Call: dto.OptionContract{
				Symbol:           ceSymbol,
				OptionType:       "CE",
				StrikePricePaise: strikePaise,
				LTPPaise:         int64(math.Round(callGreeks.Price * 100)),
				OpenInterest:     callOI,
				IV:               callGreeks.IV,
				Delta:            callGreeks.Delta,
				Gamma:            callGreeks.Gamma,
				Theta:            callGreeks.Theta,
				Vega:             callGreeks.Vega,
				LotSize:          cfg.LotSize,
			},
			Put: dto.OptionContract{
				Symbol:           peSymbol,
				OptionType:       "PE",
				StrikePricePaise: strikePaise,
				LTPPaise:         int64(math.Round(putGreeks.Price * 100)),
				OpenInterest:     putOI,
				IV:               putGreeks.IV,
				Delta:            putGreeks.Delta,
				Gamma:            putGreeks.Gamma,
				Theta:            putGreeks.Theta,
				Vega:             putGreeks.Vega,
				LotSize:          cfg.LotSize,
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
		LotSize:          cfg.LotSize,
		Strikes:          strikeRows,
	}, nil
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
