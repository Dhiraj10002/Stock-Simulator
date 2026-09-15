package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	riskEventFNOExpiry = "FNO_EXPIRY_SETTLEMENT"
	settlementComplete = "COMPLETED"
)

// RunExpirySettlement is deliberately independent of MIS square-off. It
// retries pending expired positions but never settles with a stale quote.
func (s *OrderService) RunExpirySettlement(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		s.ProcessFNOExpiry(time.Now())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *OrderService) ProcessFNOExpiry(now time.Time) {
	var positions []model.Position
	if err := database.GetDB().Where("product = ? AND quantity <> 0 AND (settlement_state IS NULL OR settlement_state <> ?)", model.OrderProductFNO, settlementComplete).Find(&positions).Error; err != nil {
		return
	}
	for _, position := range positions {
		instrument, err := s.repo.FindInstrument(position.Symbol)
		if err != nil || !isExpired(instrument.Expiry, now) {
			continue
		}
		kind, err := product.ValidateFNOInstrument(*instrument, abs(position.Quantity))
		if err != nil {
			s.recordExpiryRisk(position, err)
			continue
		}
		settlementPrice, err := s.expiryPrice(*instrument, kind)
		if err != nil {
			s.recordExpiryRisk(position, err)
			continue
		}
		if err := s.settleExpiredPosition(position.UUID, settlementPrice, kind); err != nil {
			s.recordExpiryRisk(position, err)
		}
	}
}

func (s *OrderService) expiryPrice(instrument model.Instrument, kind string) (int64, error) {
	if kind == product.InstrumentFuture {
		return s.finalQuotePrice(instrument.Symbol, instrument.Expiry)
	}
	if strings.TrimSpace(instrument.UnderlyingSymbol) == "" {
		return 0, fmt.Errorf("expired option has no explicit underlying symbol")
	}
	underlyingPrice, err := s.finalQuotePrice(instrument.UnderlyingSymbol, instrument.Expiry)
	if err != nil {
		return 0, err
	}
	strike, err := parsePaise(instrument.Strike)
	if err != nil {
		return 0, fmt.Errorf("invalid option strike: %w", err)
	}
	return optionIntrinsic(instrument.OptionType, underlyingPrice, strike)
}

// finalQuotePrice accepts the provider's last executable tick immediately
// before the simulator expiry cut-off (15:30 IST). A later live quote is not
// assumed to be a final settlement price.
func (s *OrderService) finalQuotePrice(symbol, expiry string) (int64, error) {
	expiryDay, err := expiryDate(expiry)
	if err != nil {
		return 0, err
	}
	quote, err := s.executableQuote(symbol)
	if err != nil {
		return 0, err
	}
	updated, err := time.Parse(time.RFC3339, quote.UpdatedAt)
	if err != nil {
		return 0, fmt.Errorf("invalid final quote timestamp")
	}
	cutoff := time.Date(expiryDay.Year(), expiryDay.Month(), expiryDay.Day(), 15, 30, 0, 0, expiryDay.Location())
	if updated.Before(cutoff.Add(-2*time.Minute)) || updated.After(cutoff.Add(30*time.Second)) {
		return 0, fmt.Errorf("final settlement quote is unavailable")
	}
	return quote.PricePaise, nil
}

func (s *OrderService) settleExpiredPosition(positionID uuid.UUID, settlementPrice int64, kind string) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var preview model.Position
		if err := tx.Where("uuid = ?", positionID).First(&preview).Error; err != nil {
			return err
		}
		if preview.Quantity == 0 || preview.SettlementState == settlementComplete {
			return nil
		}
		// Enforce uniform locking hierarchy: Wallet -> Position
		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", preview.UserUUID).First(&wallet).Error; err != nil {
			return err
		}
		var position model.Position
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ?", positionID).First(&position).Error; err != nil {
			return err
		}
		if position.Quantity == 0 || position.SettlementState == settlementComplete {
			return nil
		}
		quantity := abs(position.Quantity)
		settlementValue, ok := multiply(quantity, settlementPrice)
		if !ok {
			return fmt.Errorf("settlement value is too large")
		}
		entryValue, ok := multiply(quantity, position.AveragePricePaise)
		if !ok {
			return fmt.Errorf("position value is too large")
		}
		pnl := settlementValue - entryValue
		cashChange := pnl
		if position.Quantity < 0 {
			pnl = entryValue - settlementValue
		}
		if kind == product.InstrumentOption {
			cashChange = settlementValue
			if position.Quantity < 0 {
				cashChange = -settlementValue
			}
		}
		newCash, ok := add(wallet.CashBalancePaise, cashChange)
		if !ok {
			return fmt.Errorf("wallet balance is too large")
		}
		if wallet.BlockedPaise < position.MarginBlockedPaise {
			return fmt.Errorf("position margin is missing")
		}
		wallet.CashBalancePaise, wallet.BlockedPaise = newCash, wallet.BlockedPaise-position.MarginBlockedPaise
		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}
		order := model.Order{UserUUID: position.UserUUID, Symbol: position.Symbol, Side: model.OrderSideSell, Type: model.OrderTypeMarket, Product: model.OrderProductFNO, Quantity: quantity, ExecutedPricePaise: settlementPrice, Status: model.OrderStatusExecuted, Source: model.OrderSourceSystem, Reason: model.OrderReasonFNOExpiry}
		if position.Quantity < 0 {
			order.Side = model.OrderSideBuy
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		if err := tx.Create(&model.Trade{OrderUUID: order.UUID, UserUUID: position.UserUUID, Symbol: position.Symbol, Side: order.Side, Quantity: quantity, PricePaise: settlementPrice, TotalPaise: settlementValue, Product: model.OrderProductFNO, Source: model.OrderSourceSystem, Reason: model.OrderReasonFNOExpiry, RealizedPnlPaise: pnl, ExecutedAt: time.Now()}).Error; err != nil {
			return err
		}
		position.Quantity, position.CostBasisPaise, position.MarginBlockedPaise = 0, 0, 0
		position.CurrentPricePaise, position.AveragePricePaise = settlementPrice, 0
		position.RealizedPnlPaise, ok = add(position.RealizedPnlPaise, pnl)
		if !ok {
			return fmt.Errorf("realized P&L is too large")
		}
		position.SettlementState = settlementComplete
		return tx.Save(&position).Error
	})
}

func (s *OrderService) recordExpiryRisk(position model.Position, cause error) {
	_ = database.GetDB().Model(&model.Position{}).Where("uuid = ?", position.UUID).Update("settlement_state", riskStatusPending).Error
	var event model.RiskEvent
	query := database.GetDB().Where("user_uuid = ? AND symbol = ? AND product = ? AND event_type = ?", position.UserUUID, position.Symbol, position.Product, riskEventFNOExpiry).First(&event)
	if query.Error == nil {
		_ = database.GetDB().Model(&event).Updates(map[string]any{"status": riskStatusPending, "message": cause.Error()}).Error
		return
	}
	_ = database.GetDB().Create(&model.RiskEvent{UserUUID: position.UserUUID, Symbol: position.Symbol, Product: position.Product, EventType: riskEventFNOExpiry, Status: riskStatusPending, Message: cause.Error()}).Error
}

func isExpired(value string, now time.Time) bool {
	date, err := expiryDate(value)
	if err != nil {
		return false
	}
	local := now.In(date.Location())
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, local.Location())
	return !date.After(today)
}

func expiryDate(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	for _, layout := range []string{"2006-01-02", "02JAN2006", "02-Jan-2006"} {
		if date, err := time.ParseInLocation(layout, strings.ToUpper(value), time.FixedZone("IST", 19800)); err == nil {
			return date, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid expiry date")
}

func parsePaise(value string) (int64, error) {
	parts := strings.Split(strings.TrimSpace(value), ".")
	if len(parts) > 2 || parts[0] == "" {
		return 0, fmt.Errorf("invalid decimal")
	}
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || whole < 0 {
		return 0, fmt.Errorf("invalid decimal")
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > 2 && strings.TrimRight(fraction[2:], "0") != "" {
		return 0, fmt.Errorf("fractional paise not supported")
	}
	for len(fraction) < 2 {
		fraction += "0"
	}
	if len(fraction) > 2 {
		fraction = fraction[:2]
	}
	minor := int64(0)
	if fraction != "" {
		minor, err = strconv.ParseInt(fraction, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid decimal")
		}
	}
	if whole > (1<<63-1-minor)/100 {
		return 0, fmt.Errorf("decimal too large")
	}
	return whole*100 + minor, nil
}

func optionIntrinsic(optionType string, underlyingPrice, strikePrice int64) (int64, error) {
	switch strings.ToUpper(strings.TrimSpace(optionType)) {
	case "CALL", "CE":
		if underlyingPrice > strikePrice {
			return underlyingPrice - strikePrice, nil
		}
		return 0, nil
	case "PUT", "PE":
		if strikePrice > underlyingPrice {
			return strikePrice - underlyingPrice, nil
		}
		return 0, nil
	default:
		return 0, fmt.Errorf("option type must be explicitly CALL or PUT")
	}
}
