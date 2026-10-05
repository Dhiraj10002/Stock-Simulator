package service

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/greeks"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"gorm.io/gorm"
)

// DerivedFNOQuote is exclusively for explicit simulation. Live mode must receive
// the contract's own broker quote, never a theoretical price or static spot.
func (s *Service) DerivedFNOQuote(symbol string) (*dto.QuoteResponse, error) {
	if s == nil || s.FeedMode() != dto.FeedModeSynthetic {
		return nil, ErrQuoteIneligible
	}
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	var inst *model.Instrument
	if s.db != nil {
		var row model.Instrument
		err := s.db.Where("symbol = ? AND exchange_segment = ?", symbol, "NFO").First(&row).Error
		if err == nil {
			inst = &row
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	if inst == nil {
		var err error
		inst, err = product.ParseSyntheticFNOContract(symbol)
		if err != nil {
			return nil, ErrQuoteNotFound
		}
	}
	expiry, err := product.ParseContractExpiry(inst.Expiry)
	if err != nil || !expiry.After(time.Now()) {
		return nil, fmt.Errorf("expired or invalid derivative contract %s", symbol)
	}
	underlying := inst.UnderlyingSymbol
	if underlying == "" {
		underlying = inst.Underlying
	}
	if underlying == "" || underlying == symbol {
		return nil, ErrQuoteNotFound
	}
	spot, err := s.CurrentQuote(underlying)
	if err != nil {
		return nil, err
	}
	if err = ValidateExecutableQuoteWithFeedMode(spot, time.Now(), dto.FeedModeSynthetic, false); err != nil {
		return nil, err
	}
	price := spot.PricePaise
	if strings.HasPrefix(inst.InstrumentType, "OPT") {
		strike, err := strconv.ParseFloat(inst.Strike, 64)
		if err != nil || strike <= 0 {
			return nil, fmt.Errorf("invalid derivative strike")
		}
		if inst.OptionType != "CE" && inst.OptionType != "PE" {
			return nil, fmt.Errorf("invalid option type")
		}
		years := time.Until(expiry).Hours() / (24 * 365)
		result := greeks.CalculateGreeks(float64(spot.PricePaise)/100, strike, years, 0.065, 0.15, inst.OptionType == "CE")
		price = int64(math.Round(result.Price*100/5)) * 5
		if price < 5 {
			price = 5
		}
	} else if !strings.HasPrefix(inst.InstrumentType, "FUT") {
		return nil, ErrQuoteNotFound
	}
	// Preserve the underlying timestamp; derivation must not refresh stale data.
	return &dto.QuoteResponse{Symbol: symbol, PricePaise: price, Source: string(dto.QuoteSourceFNOEngine), UpdatedAt: spot.UpdatedAt}, nil
}
