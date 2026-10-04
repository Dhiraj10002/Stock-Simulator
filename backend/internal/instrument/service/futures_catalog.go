package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

// FuturesCatalog returns the complete current futures universe rather than a
// truncated general search. Exchange test scrips remain in the master/history,
// but are never advertised as regular contracts on the paper futures desk.
func (s *Service) FuturesCatalog(ctx context.Context) ([]dto.InstrumentResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("instrument master unavailable")
	}
	var rows []model.Instrument
	if err := s.db.WithContext(ctx).Where("active = ? AND is_tradable = ? AND instrument_type IN ?", true, true, []string{"FUTIDX", "FUTSTK"}).Order("symbol ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]dto.InstrumentResponse, 0, len(rows))
	for _, row := range rows {
		identity := strings.ToUpper(row.Symbol + " " + row.Underlying + " " + row.UnderlyingSymbol + " " + row.Name)
		if strings.Contains(identity, "NSETEST") || strings.Contains(identity, "BSETEST") {
			continue
		}
		expiry, err := ParseExpiryDate(row.Expiry, nil)
		if err != nil || !now.Before(expiry) {
			continue
		}
		out = append(out, ToCanonicalInstrument(row))
	}
	return out, nil
}
