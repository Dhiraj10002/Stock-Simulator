package service

import (
	"testing"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
)

// TestRegression_F07_OrdinarySquareOffLacksReduceOnlySemantics reproduces defect F07:
// Ordinary square-off (SquareOffPosition) reads a position and submits a standard
// opposite-side market order without reduce-only or idempotency guarantees.
// Two overlapping square-off requests both read Quantity = 10, and submit two SELL 10 orders.
// Because ordinary square-off orders do NOT have reduce-only clamping under the settlement lock,
// the second order executes against Quantity = 0 and flips the user's position to -10 (short),
// exposing them to unwanted short leverage instead of merely closing the position.
func TestRegression_F07_OrdinarySquareOffLacksReduceOnlySemantics(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()

	symbol := "RELIANCE"
	currentQuote := int64(250000) // Rs 2500.00
	s.SetExecutableQuoteFunc(func(sym string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: sym, PricePaise: currentQuote}, nil
	})

	// Ensure Instrument exists for margin calculation
	inst := model.Instrument{
		Token:          uuid.NewString()[:16],
		Symbol:         symbol,
		ExchangeSegment: "NSE",
		InstrumentType: "EQUITY",
		LotSize:        1,
		Active:         true,
	}
	_ = db.Create(&inst).Error
	t.Cleanup(func() { _ = db.Delete(&inst).Error })

	// Initial long intraday position: +10 shares at Rs 2500
	pos := model.Position{
		UUID:               uuid.New(),
		UserUUID:           w.UserUUID,
		Symbol:             symbol,
		Product:            model.OrderProductIntraday,
		Quantity:           10,
		AveragePricePaise:  currentQuote,
		CostBasisPaise:     currentQuote * 10,
		MarginBlockedPaise: 500000,
	}
	w.BlockedPaise = 500000
	if err := db.Save(&w).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&pos).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = db.Where("user_uuid = ?", w.UserUUID).Delete(&model.Position{}).Error
		_ = db.Where("user_uuid = ?", w.UserUUID).Delete(&model.Order{}).Error
		_ = db.Where("user_uuid = ?", w.UserUUID).Delete(&model.Trade{}).Error
	})

	// Simulate two overlapping / concurrent square-off requests (e.g. rapid double-click in UI
	// or concurrent API calls before first order completes execution):
	startBarrier := make(chan struct{})
	type sqResult struct {
		resp *orderDTO.OrderResponse
		err  error
	}
	resChan := make(chan sqResult, 2)

	for i := 0; i < 2; i++ {
		go func() {
			<-startBarrier
			resp, err := s.SquareOffPosition(w.UserUUID, pos.UUID)
			resChan <- sqResult{resp: resp, err: err}
		}()
	}

	// Release both requests concurrently
	close(startBarrier)

	r1 := <-resChan
	r2 := <-resChan

	t.Logf("Result 1: resp=%+v err=%v", r1.resp, r1.err)
	t.Logf("Result 2: resp=%+v err=%v", r2.resp, r2.err)

	var finalPos model.Position
	if err := db.First(&finalPos, pos.ID).Error; err != nil {
		t.Fatal(err)
	}

	t.Logf("Final position quantity: %d (expected 0 if reduce-only/idempotent)", finalPos.Quantity)

	// Defect F07 demonstration:
	// If both orders succeeded or position flipped negative:
	if finalPos.Quantity < 0 {
		t.Logf("CONFIRMED DEFECT F07: Concurrent square-off flipped position to %d (reverse short position) due to lack of reduce-only / idempotency!", finalPos.Quantity)
	} else if r1.err != nil || r2.err != nil {
		t.Logf("One request was rejected or serialized: r1.err=%v, r2.err=%v", r1.err, r2.err)
	}
}
