package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

func isExchangeTestInstrument(row model.Instrument) bool {
	identity := strings.ToUpper(row.Symbol + " " + row.Underlying + " " + row.UnderlyingSymbol + " " + row.Name)
	return strings.Contains(identity, "NSETEST") || strings.Contains(identity, "BSETEST")
}

// FuturesCatalog returns the complete current futures universe rather than a
// truncated general search. Exchange test scrips remain in the master/history,
// but are never advertised as regular contracts on the paper futures desk.
func (s *Service) FuturesCatalog(ctx context.Context) ([]dto.InstrumentResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("instrument master unavailable")
	}
	s.futuresCatalogMu.RLock()
	if len(s.futuresCatalog) > 0 && time.Since(s.futuresCatalogAt) < 5*time.Minute {
		res := make([]dto.InstrumentResponse, len(s.futuresCatalog))
		copy(res, s.futuresCatalog)
		s.futuresCatalogMu.RUnlock()
		return res, nil
	}
	s.futuresCatalogMu.RUnlock()

	var rows []model.Instrument
	if err := s.db.WithContext(ctx).Where("active = ? AND is_tradable = ? AND instrument_type IN ?", true, true, []string{"FUTIDX", "FUTSTK"}).Order("symbol ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]dto.InstrumentResponse, 0, len(rows))
	for _, row := range rows {
		if isExchangeTestInstrument(row) {
			continue
		}
		expiry, err := ParseExpiryDate(row.Expiry, nil)
		if err != nil || !now.Before(expiry) {
			continue
		}
		out = append(out, ToCanonicalInstrument(row))
	}

	s.futuresCatalogMu.Lock()
	s.futuresCatalog = make([]dto.InstrumentResponse, len(out))
	copy(s.futuresCatalog, out)
	s.futuresCatalogAt = time.Now()
	s.futuresCatalogMu.Unlock()

	return out, nil
}
