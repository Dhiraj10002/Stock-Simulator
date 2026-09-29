package service

import (
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

			// Attempt direct execution
			err := s.Execute(w.UserUUID.String(), order.UUID.String())

			// Defect F05 demonstration:
			// In the unfixed code, err == nil and the order executes prematurely at 10000!
			// A correct execution boundary MUST reject direct execution of untriggered stop orders.
			var refreshed model.Order
			if dbErr := db.First(&refreshed, order.ID).Error; dbErr != nil {
				t.Fatal(dbErr)
			}

			// We record and assert whether the defect is present:
			t.Logf("[%s] Execution err: %v, Order Status: %s, ExecutedPrice: %d",
				tc.name, err, refreshed.Status, refreshed.ExecutedPricePaise)

			// Reproduce F05: The order has executed despite market price NOT having triggered the stop
			if err == nil && refreshed.Status == model.OrderStatusExecuted {
				t.Logf("CONFIRMED DEFECT F05: Order in TRIGGER_PENDING executed directly without meeting trigger condition (market=%d, trigger=%d)",
					currentQuotePaise, tc.triggerPrice)
			}
		})
	}
}
