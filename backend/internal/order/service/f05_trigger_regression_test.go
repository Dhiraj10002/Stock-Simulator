package service

import (
	"strings"
	"testing"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

// TestRegression_F05_DirectExecutionBypassesStopTrigger reproduces defect F05:
// The authenticated execute endpoint (/orders/:id/execute -> s.Execute) accepts
// TRIGGER_PENDING orders and settles them immediately even when the market price
// has NOT satisfied the stop trigger condition.
func TestRegression_F05_DirectExecutionBypassesStopTrigger(t *testing.T) {
	db := accountingDB(t)
	ensureInstrumentExists(t, db, "TRIGGERTEST", "EQUITY")
	w := accountingWallet(t, db)
	s := accountingService()

	// Market price is 10,000 paise (Rs 100.00)
	currentQuotePaise := int64(10000)
	s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: currentQuotePaise}, nil
	})

	testCases := []struct {
		name         string
		orderType    string
		side         string
		triggerPrice int64 // Paise
		limitPrice   int64 // Paise (for SL)
		description  string
	}{
		{
			name:         "BUY_SLM_Untriggered",
			orderType:    model.OrderTypeSLM,
			side:         model.OrderSideBuy,
			triggerPrice: 10500, // Trigger is above market (105 > 100), NOT triggered yet
			description:  "Buy SL-M must only trigger when market rises >= trigger price",
		},
		{
			name:         "SELL_SLM_Untriggered",
			orderType:    model.OrderTypeSLM,
			side:         model.OrderSideSell,
			triggerPrice: 9500, // Trigger is below market (95 < 100), NOT triggered yet
			description:  "Sell SL-M must only trigger when market falls <= trigger price",
		},
		{
			name:         "BUY_SL_Untriggered",
			orderType:    model.OrderTypeSL,
			side:         model.OrderSideBuy,
			triggerPrice: 10500,
			limitPrice:   10600, // Limit satisfies, but trigger condition was NOT met!
			description:  "Buy SL must not execute before trigger condition is met, even if limit passes",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			order := model.Order{
				UserUUID:          w.UserUUID,
				Symbol:            "TRIGGERTEST",
				Product:           model.OrderProductDelivery,
				Side:              tc.side,
				Type:              tc.orderType,
				Quantity:          10,
				PricePaise:        tc.limitPrice,
				TriggerPricePaise: tc.triggerPrice,
				Status:            model.OrderStatusTriggerPending,
				ReservedPaise:     150000,
			}
			if err := db.Create(&order).Error; err != nil {
				t.Fatal(err)
			}
			if tc.side == model.OrderSideBuy {
				w.BlockedPaise = 150000
				if err := db.Save(&w).Error; err != nil {
					t.Fatal(err)
				}
			} else {
				pos := model.Position{
					UserUUID:          w.UserUUID,
					Symbol:            "TRIGGERTEST",
					Product:           model.OrderProductDelivery,
					Quantity:          10,
					AveragePricePaise: 10000,
					CostBasisPaise:    100000,
				}
				if err := db.Create(&pos).Error; err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() {
					_ = db.Where("id = ?", pos.ID).Delete(&model.Position{}).Error
				})
			}

			// Attempt direct execution while untriggered
			err := s.Execute(w.UserUUID.String(), order.UUID.String())
			if err == nil {
				t.Fatalf("expected error executing untriggered stop order, got nil")
			}
			if !strings.Contains(err.Error(), "stop trigger condition not met") {
				t.Fatalf("expected 'stop trigger condition not met', got: %v", err)
			}

			var refreshed model.Order
			if dbErr := db.First(&refreshed, order.ID).Error; dbErr != nil {
				t.Fatal(dbErr)
			}
			if refreshed.Status != model.OrderStatusTriggerPending {
				t.Fatalf("expected order to remain TRIGGER_PENDING, got: %s", refreshed.Status)
			}

			// Now simulate market price moving across the trigger price
			triggeredQuotePaise := tc.triggerPrice
			if tc.side == model.OrderSideBuy {
				triggeredQuotePaise += 100 // Rises above trigger
			} else {
				triggeredQuotePaise -= 100 // Falls below trigger
			}
			s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
				return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: triggeredQuotePaise}, nil
			})

			// Executing now that trigger is met must succeed
			if err := s.Execute(w.UserUUID.String(), order.UUID.String()); err != nil {
				t.Fatalf("expected execution to succeed once trigger is satisfied, got: %v", err)
			}

			if dbErr := db.First(&refreshed, order.ID).Error; dbErr != nil {
				t.Fatal(dbErr)
			}
			if refreshed.Status != model.OrderStatusExecuted {
				t.Fatalf("expected order to be EXECUTED once triggered, got: %s", refreshed.Status)
			}
		})
	}
}
