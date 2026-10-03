package service

import (
	"math"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
)

func TestSettlementArithmetic(t *testing.T) {
	if _, ok := multiply(math.MaxInt64, 2); ok {
		t.Fatal("expected multiplication overflow to be rejected")
	}
	if _, ok := add(math.MaxInt64, 1); ok {
		t.Fatal("expected positive addition overflow to be rejected")
	}
	if total, ok := multiply(10, 12_000); !ok || total != 120_000 {
		t.Fatalf("multiply returned (%d, %v), want (120000, true)", total, ok)
	}
}

func TestSupportedProducts(t *testing.T) {
	for _, product := range []string{"DELIVERY", "INTRADAY", "FNO"} {
		if !isSupportedProduct(product) {
			t.Fatalf("%q must be supported", product)
		}
	}
	if isSupportedProduct("") {
		t.Fatal("empty product must be rejected")
	}
}

func TestLimitMatchingAndExactPartialSaleCostBasis(t *testing.T) {
	buy := &model.Order{Type: model.OrderTypeLimit, Side: model.OrderSideBuy, PricePaise: 10_000}
	if !limitSatisfied(buy, 9_999) || limitSatisfied(buy, 10_001) {
		t.Fatal("buy limit matching is incorrect")
	}
	sell := &model.Order{Type: model.OrderTypeLimit, Side: model.OrderSideSell, PricePaise: 10_000}
	if !limitSatisfied(sell, 10_001) || limitSatisfied(sell, 9_999) {
		t.Fatal("sell limit matching is incorrect")
	}

	allocated, ok := proportionalCostBasis(10_001, 1, 3)
	if !ok || allocated != 3_333 {
		t.Fatalf("first partial allocation = (%d, %v), want (3333, true)", allocated, ok)
	}
	remaining := int64(10_001 - allocated)
	allocated, ok = proportionalCostBasis(remaining, 2, 2)
	if !ok || allocated != remaining {
		t.Fatalf("final allocation = (%d, %v), want (%d, true)", allocated, ok, remaining)
	}
}

func TestCalculatePositionTransition(t *testing.T) {
	tests := []struct {
		name            string
		oldQty          int64
		oldAverage      int64
		orderQty        int64
		execPrice       int64
		side            string
		wantNewQty      int64
		wantNewAvg      int64
		wantRealizedPnl int64
		wantClosedQty   int64
		wantOpenedQty   int64
		wantErr         bool
	}{
		{
			name:            "Open Long from Flat",
			oldQty:          0,
			oldAverage:      0,
			orderQty:        100,
			execPrice:       2500,
			side:            model.OrderSideBuy,
			wantNewQty:      100,
			wantNewAvg:      2500,
			wantRealizedPnl: 0,
			wantClosedQty:   0,
			wantOpenedQty:   100,
		},
		{
			name:            "Open Short from Flat",
			oldQty:          0,
			oldAverage:      0,
			orderQty:        100,
			execPrice:       2500,
			side:            model.OrderSideSell,
			wantNewQty:      -100,
			wantNewAvg:      2500,
			wantRealizedPnl: 0,
			wantClosedQty:   0,
			wantOpenedQty:   100,
		},
		{
			name:            "Accumulate Long",
			oldQty:          100,
			oldAverage:      2500,
			orderQty:        50,
			execPrice:       2800,
			side:            model.OrderSideBuy,
			wantNewQty:      150,
			wantNewAvg:      2600, // (250000 + 140000) / 150 = 2600
			wantRealizedPnl: 0,
			wantClosedQty:   0,
			wantOpenedQty:   50,
		},
		{
			name:            "Accumulate Short",
			oldQty:          -100,
			oldAverage:      2500,
			orderQty:        50,
			execPrice:       2800,
			side:            model.OrderSideSell,
			wantNewQty:      -150,
			wantNewAvg:      2600,
			wantRealizedPnl: 0,
			wantClosedQty:   0,
			wantOpenedQty:   50,
		},
		{
			name:            "Partial Close Long (Profit)",
			oldQty:          100,
			oldAverage:      2500,
			orderQty:        40,
			execPrice:       2800,
			side:            model.OrderSideSell,
			wantNewQty:      60,
			wantNewAvg:      2500,  // preserved
			wantRealizedPnl: 12000, // 40 * (2800 - 2500)
			wantClosedQty:   40,
			wantOpenedQty:   0,
		},
		{
			name:            "Partial Close Long (Loss)",
			oldQty:          100,
			oldAverage:      2500,
			orderQty:        40,
			execPrice:       2200,
			side:            model.OrderSideSell,
			wantNewQty:      60,
			wantNewAvg:      2500,
			wantRealizedPnl: -12000, // 40 * (2200 - 2500)
			wantClosedQty:   40,
			wantOpenedQty:   0,
		},
		{
			name:            "Partial Close Short (Profit)",
			oldQty:          -100,
			oldAverage:      3000,
			orderQty:        40,
			execPrice:       2800,
			side:            model.OrderSideBuy,
			wantNewQty:      -60,
			wantNewAvg:      3000, // preserved
			wantRealizedPnl: 8000, // 40 * (3000 - 2800)
			wantClosedQty:   40,
			wantOpenedQty:   0,
		},
		{
			name:            "Partial Close Short (Loss)",
			oldQty:          -100,
			oldAverage:      3000,
			orderQty:        40,
			execPrice:       3300,
			side:            model.OrderSideBuy,
			wantNewQty:      -60,
			wantNewAvg:      3000,
			wantRealizedPnl: -12000, // 40 * (3000 - 3300)
			wantClosedQty:   40,
			wantOpenedQty:   0,
		},
		{
			name:            "Full Close Long (Flat)",
			oldQty:          100,
			oldAverage:      2500,
			orderQty:        100,
			execPrice:       2800,
			side:            model.OrderSideSell,
			wantNewQty:      0,
			wantNewAvg:      0,
			wantRealizedPnl: 30000, // 100 * (2800 - 2500)
			wantClosedQty:   100,
			wantOpenedQty:   0,
		},
		{
			name:            "Full Close Short (Flat)",
			oldQty:          -100,
			oldAverage:      3000,
			orderQty:        100,
			execPrice:       2800,
			side:            model.OrderSideBuy,
			wantNewQty:      0,
			wantNewAvg:      0,
			wantRealizedPnl: 20000, // 100 * (3000 - 2800)
			wantClosedQty:   100,
			wantOpenedQty:   0,
		},
		{
			name:            "Position Crossing: Long to Short (Profit on close)",
			oldQty:          100,
			oldAverage:      2500,
			orderQty:        150,
			execPrice:       2800,
			side:            model.OrderSideSell,
			wantNewQty:      -50,
			wantNewAvg:      2800,  // new short position opened at execution price
			wantRealizedPnl: 30000, // 100 * (2800 - 2500)
			wantClosedQty:   100,
			wantOpenedQty:   50,
		},
		{
			name:            "Position Crossing: Long to Short (Loss on close)",
			oldQty:          100,
			oldAverage:      2500,
			orderQty:        150,
			execPrice:       2200,
			side:            model.OrderSideSell,
			wantNewQty:      -50,
			wantNewAvg:      2200,   // new short position opened at execution price
			wantRealizedPnl: -30000, // 100 * (2200 - 2500)
			wantClosedQty:   100,
			wantOpenedQty:   50,
		},
		{
			name:            "Position Crossing: Short to Long (Profit on close)",
			oldQty:          -100,
			oldAverage:      3000,
			orderQty:        150,
			execPrice:       2800,
			side:            model.OrderSideBuy,
			wantNewQty:      50,
			wantNewAvg:      2800,  // new long position opened at execution price
			wantRealizedPnl: 20000, // 100 * (3000 - 2800)
			wantClosedQty:   100,
			wantOpenedQty:   50,
		},
		{
			name:            "Position Crossing: Short to Long (Loss on close)",
			oldQty:          -100,
			oldAverage:      3000,
			orderQty:        150,
			execPrice:       3500,
			side:            model.OrderSideBuy,
			wantNewQty:      50,
			wantNewAvg:      3500,   // new long position opened at execution price
			wantRealizedPnl: -50000, // 100 * (3000 - 3500)
			wantClosedQty:   100,
			wantOpenedQty:   50,
		},
		{
			name:      "Invalid Quantity Zero",
			orderQty:  0,
			execPrice: 2500,
			side:      model.OrderSideBuy,
			wantErr:   true,
		},
		{
			name:      "Invalid Execution Price Zero",
			orderQty:  10,
			execPrice: 0,
			side:      model.OrderSideBuy,
			wantErr:   true,
		},
		{
			name:      "Invalid Order Side",
			orderQty:  10,
			execPrice: 2500,
			side:      "HOLD",
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calculatePositionTransition(tt.oldQty, tt.oldAverage, tt.orderQty, tt.execPrice, tt.side)
			if (err != nil) != tt.wantErr {
				t.Fatalf("calculatePositionTransition() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if got.NewQuantity != tt.wantNewQty {
				t.Errorf("NewQuantity = %d, want %d", got.NewQuantity, tt.wantNewQty)
			}
			if got.NewAveragePrice != tt.wantNewAvg {
				t.Errorf("NewAveragePrice = %d, want %d", got.NewAveragePrice, tt.wantNewAvg)
			}
			if got.RealizedPnlPaise != tt.wantRealizedPnl {
				t.Errorf("RealizedPnlPaise = %d, want %d", got.RealizedPnlPaise, tt.wantRealizedPnl)
			}
			if got.ClosedQuantity != tt.wantClosedQty {
				t.Errorf("ClosedQuantity = %d, want %d", got.ClosedQuantity, tt.wantClosedQty)
			}
			if got.OpenedQuantity != tt.wantOpenedQty {
				t.Errorf("OpenedQuantity = %d, want %d", got.OpenedQuantity, tt.wantOpenedQty)
			}
		})
	}
}

func TestSlippageCalculation(t *testing.T) {
	ltp := int64(100_000) // ₹1,000.00

	// Small orders <= 50 have 0 slippage
	buySmall := calculateSlippage(10, ltp, model.OrderSideBuy)
	if buySmall != ltp {
		t.Fatalf("expected no slippage for qty <= 50, got %d, want %d", buySmall, ltp)
	}

	sellSmall := calculateSlippage(50, ltp, model.OrderSideSell)
	if sellSmall != ltp {
		t.Fatalf("expected no slippage for qty <= 50, got %d, want %d", sellSmall, ltp)
	}

	// Large orders (> 50) have slippage
	buyLarge := calculateSlippage(100, ltp, model.OrderSideBuy)
	if buyLarge <= ltp {
		t.Fatalf("expected buy slippage to increase execution price, got %d <= %d", buyLarge, ltp)
	}

	sellLarge := calculateSlippage(100, ltp, model.OrderSideSell)
	if sellLarge >= ltp {
		t.Fatalf("expected sell slippage to decrease execution price, got %d >= %d", sellLarge, ltp)
	}

	// Maximum slippage check (capped at 6 bps)
	buyVeryLarge := calculateSlippage(10_000, ltp, model.OrderSideBuy)
	// 6 bps of 100,000 = 60 paise
	if buyVeryLarge > ltp+60 {
		t.Fatalf("expected slippage capped at 6 bps (<= %d), got %d", ltp+60, buyVeryLarge)
	}
}

func TestStopLossLimitMatching(t *testing.T) {
	// SL order with limit price 100,000
	slBuy := &model.Order{Type: model.OrderTypeSL, Side: model.OrderSideBuy, PricePaise: 100_000, TriggerPricePaise: 99_000}
	if !limitSatisfied(slBuy, 99_500) {
		t.Fatalf("expected buy SL limit to be satisfied when price <= limit price")
	}
	if limitSatisfied(slBuy, 100_500) {
		t.Fatalf("expected buy SL limit to not be satisfied when price > limit price")
	}

	slSell := &model.Order{Type: model.OrderTypeSL, Side: model.OrderSideSell, PricePaise: 100_000, TriggerPricePaise: 101_000}
	if !limitSatisfied(slSell, 100_500) {
		t.Fatalf("expected sell SL limit to be satisfied when price >= limit price")
	}
	if limitSatisfied(slSell, 99_500) {
		t.Fatalf("expected sell SL limit to not be satisfied when price < limit price")
	}
}

func TestCalculateCircuitLimits(t *testing.T) {
	refPrice := int64(100_000) // ₹1,000.00

	// Delivery / Intraday: 10% band
	lc, uc := calculateCircuitLimits(refPrice, model.OrderProductDelivery)
	if lc != 90_000 || uc != 110_000 {
		t.Fatalf("expected 10%% circuit limits (90000, 110000), got (%d, %d)", lc, uc)
	}

	// F&O: 20% band
	lcFno, ucFno := calculateCircuitLimits(refPrice, model.OrderProductFNO)
	if lcFno != 80_000 || ucFno != 120_000 {
		t.Fatalf("expected 20%% circuit limits (80000, 120000), got (%d, %d)", lcFno, ucFno)
	}

	// Near zero price: minimum 5 paise lower circuit
	lcZero, _ := calculateCircuitLimits(1, model.OrderProductDelivery)
	if lcZero != 5 {
		t.Fatalf("expected min tick 5 paise, got %d", lcZero)
	}
}

func TestResolveCircuitLimits_RealExchangeLimits(t *testing.T) {
	// 1. When live quote contains real broker/exchange circuit limits (e.g. 5% surveillance band)
	realQuote := &marketDTO.QuoteResponse{
		Symbol:             "ZOMATO",
		PricePaise:         20500, // LTP: ₹205.00
		PreviousClosePaise: 20000, // PrevClose: ₹200.00
		LowerCircuitPaise:  19000, // Real 5% exchange lower circuit: ₹190.00
		UpperCircuitPaise:  21000, // Real 5% exchange upper circuit: ₹210.00
	}

	lc, uc := resolveCircuitLimits(realQuote, model.OrderProductDelivery)
	// Must strictly use real exchange limits (19000, 21000) instead of naive 10%
	if lc != 19000 || uc != 21000 {
		t.Fatalf("expected real exchange circuit limits (19000, 21000), got (%d, %d)", lc, uc)
	}

	// 2. When real circuit limits are missing, fall back to official price band applied to PreviousClose
	fallbackQuote := &marketDTO.QuoteResponse{
		Symbol:             "RELIANCE",
		PricePaise:         260000, // LTP ₹2,600
		PreviousClosePaise: 250000, // PrevClose ₹2,500
		LowerCircuitPaise:  0,
		UpperCircuitPaise:  0,
	}
	lcFb, ucFb := resolveCircuitLimits(fallbackQuote, model.OrderProductDelivery)
	// 10% on previous close 250,000 -> [225,000, 275,000]
	if lcFb != 0 || ucFb != 0 {
		t.Fatalf("expected unavailable circuits (0,0), got (%d, %d)", lcFb, ucFb)
	}

	// 3. F&O fallback is 20% on previous close
	lcFno, ucFno := resolveCircuitLimits(fallbackQuote, model.OrderProductFNO)
	if lcFno != 0 || ucFno != 0 {
		t.Fatalf("expected unavailable F&O circuits (0,0), got (%d, %d)", lcFno, ucFno)
	}
}

func TestOrderService_CircuitBreakerEnforcement_RealExchangeLimits(t *testing.T) {
	// Tests order validation against real circuit limits vs naive ±10% bands
	orderSvc := New(nil, &config.Config{})
	loc, _ := time.LoadLocation("Asia/Kolkata")
	tradingTime := time.Date(2026, 9, 16, 10, 0, 0, 0, loc)
	orderSvc.SetNowFunc(func() time.Time { return tradingTime })

	// Quote with real exchange limits (5% band on ₹200.00: [19000, 21000])
	orderSvc.SetCurrentQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:             "ZOMATO",
			PricePaise:         20500, // LTP ₹205.00
			PreviousClosePaise: 20000,
			LowerCircuitPaise:  19000, // ₹190.00
			UpperCircuitPaise:  21000, // ₹210.00
			Source:             "angelone_live",
			UpdatedAt:          tradingTime.UTC().Format(time.RFC3339),
		}, nil
	})

	userUUID := uuid.New()

	// 1. Order at ₹218.00 would pass naive ±10% on LTP (20500 + 2050 = 22550)
	// but MUST FAIL against real exchange upper circuit limit (₹210.00)
	_, err := orderSvc.Create(userUUID.String(), dto.CreateOrderRequest{
		Symbol:     "ZOMATO",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   10,
		PricePaise: 21800, // ₹218.00 > ₹210.00
	})
	if err == nil {
		t.Fatal("expected order to be rejected when exceeding real exchange upper circuit")
	}
	if !strings.Contains(err.Error(), "exceeds daily upper circuit limit of ₹210.00") {
		t.Fatalf("expected error mentioning upper circuit limit of ₹210.00, got: %v", err)
	}

	// 2. Order below real lower circuit (e.g. ₹185.00 < ₹190.00)
	_, err = orderSvc.Create(userUUID.String(), dto.CreateOrderRequest{
		Symbol:     "ZOMATO",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   10,
		PricePaise: 18500, // ₹185.00 < ₹190.00
	})
	if err == nil {
		t.Fatal("expected order to be rejected when falling below real exchange lower circuit")
	}
	if !strings.Contains(err.Error(), "falls below daily lower circuit limit of ₹190.00") {
		t.Fatalf("expected error mentioning lower circuit limit of ₹190.00, got: %v", err)
	}

	// 3. Stop-Loss Trigger Price exceeding upper circuit
	_, err = orderSvc.Create(userUUID.String(), dto.CreateOrderRequest{
		Symbol:            "ZOMATO",
		Side:              model.OrderSideBuy,
		Type:              model.OrderTypeSL,
		Product:           model.OrderProductDelivery,
		Quantity:          10,
		PricePaise:        20800, // Valid limit price
		TriggerPricePaise: 21500, // Trigger price ₹215.00 > ₹210.00
	})
	if err == nil {
		t.Fatal("expected SL order to be rejected when trigger price exceeds real upper circuit")
	}
	if !strings.Contains(err.Error(), "trigger price ₹215.00 exceeds daily upper circuit limit of ₹210.00") {
		t.Fatalf("expected trigger price error, got: %v", err)
	}
}
