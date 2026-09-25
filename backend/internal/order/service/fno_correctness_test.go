package service

import (
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/google/uuid"
)

func TestFNO_RealVsSimulated_Separation(t *testing.T) {
	loc := calendar.Location()
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	userID := uuid.New().String()

	cfg := &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	}

	canonicalDBInst := &model.Instrument{
		ID:               99,
		Symbol:           "NIFTY24OCT25000CE",
		DisplaySymbol:    "NIFTY 24OCT 25000 CE",
		Name:             "NIFTY",
		UnderlyingSymbol: "NIFTY",
		Expiry:           "2026-10-29",
		Strike:           "25000.000000",
		OptionType:       "CE",
		LotSize:          25,
		TickSize:         "0.05",
		InstrumentType:   "OPTIDX",
		ExchangeSegment:  "NFO",
		Active:           true,
	}

	// 1. LIVE Feed Mode: Only canonical DB instruments are permitted
	t.Run("LIVE mode permits only canonical DB instruments", func(t *testing.T) {
		mkt := &marketService.Service{}
		mkt.SetFeedMode(marketDTO.FeedModeLive)

		svc := New(mkt, cfg)
		svc.SetNowFunc(func() time.Time { return tradingTime })
		svc.SetInstrumentFinder(func(sym string) (*model.Instrument, error) {
			if sym == "NIFTY24OCT25000CE" {
				return canonicalDBInst, nil
			}
			return nil, ErrInstrumentNotFound
		})
		svc.SetCreateOrderFunc(func(order *model.Order) error { return nil })

		// A: Canonical DB instrument in LIVE mode -> Accepted
		reqA := dto.CreateOrderRequest{
			Symbol:     "NIFTY24OCT25000CE",
			Side:       model.OrderSideBuy,
			Type:       model.OrderTypeLimit,
			Product:    model.OrderProductFNO,
			Quantity:   25,
			PricePaise: 15000,
		}
		respA, errA := svc.Create(userID, reqA)
		if errA != nil || respA == nil {
			t.Fatalf("expected canonical DB instrument to be accepted in LIVE mode, got err: %v", errA)
		}

		// B: Synthetic non-DB contract in LIVE mode -> Strictly Rejected!
		reqB := dto.CreateOrderRequest{
			Symbol:     "NIFTY 25000 CE",
			Side:       model.OrderSideBuy,
			Type:       model.OrderTypeLimit,
			Product:    model.OrderProductFNO,
			Quantity:   25,
			PricePaise: 15000,
		}
		_, errB := svc.Create(userID, reqB)
		if errB == nil {
			t.Fatalf("expected synthetic non-DB instrument to be rejected in LIVE mode, got nil")
		}
		if !strings.Contains(errB.Error(), "real F&O under LIVE mode permits only canonical DB instruments") &&
			!strings.Contains(errB.Error(), "not found in canonical instrument master") {
			t.Fatalf("expected error indicating real F&O under LIVE mode restriction, got: %v", errB)
		}
	})

	// 2. SYNTHETIC Feed Mode: Synthetic contracts permitted
	t.Run("SYNTHETIC mode permits synthetic F&O contracts", func(t *testing.T) {
		mkt := &marketService.Service{}
		mkt.SetFeedMode(marketDTO.FeedModeSynthetic)

		svc := New(mkt, cfg)
		svc.SetNowFunc(func() time.Time { return tradingTime })
		svc.SetInstrumentFinder(func(sym string) (*model.Instrument, error) {
			// Finder has no DB record for synthetic contract
			return nil, ErrInstrumentNotFound
		})
		svc.SetCreateOrderFunc(func(order *model.Order) error { return nil })

		// Synthetic option contract in SYNTHETIC mode -> Permitted!
		req := dto.CreateOrderRequest{
			Symbol:     "NIFTY 25000 CE",
			Side:       model.OrderSideBuy,
			Type:       model.OrderTypeLimit,
			Product:    model.OrderProductFNO,
			Quantity:   25,    // lot size 25
			PricePaise: 15000, // tick size 5 paise multiple
		}
		resp, err := svc.Create(userID, req)
		if err != nil || resp == nil {
			t.Fatalf("expected synthetic contract to be permitted in SYNTHETIC mode, got err: %v", err)
		}
		if resp.Symbol != "NIFTY 25000 CE" {
			t.Errorf("expected symbol 'NIFTY 25000 CE', got %s", resp.Symbol)
		}

		// Synthetic future contract in SYNTHETIC mode -> Permitted!
		reqFut := dto.CreateOrderRequest{
			Symbol:     "NIFTY24SEPFUT",
			Side:       model.OrderSideBuy,
			Type:       model.OrderTypeLimit,
			Product:    model.OrderProductFNO,
			Quantity:   25,
			PricePaise: 2500000,
		}
		respFut, errFut := svc.Create(userID, reqFut)
		if errFut != nil || respFut == nil {
			t.Fatalf("expected synthetic future contract to be permitted in SYNTHETIC mode, got err: %v", errFut)
		}
	})
}

func TestFNO_LotSizeAndTickSizeValidation(t *testing.T) {
	loc := calendar.Location()
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	userID := uuid.New().String()

	cfg := &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	}

	mkt := &marketService.Service{}
	mkt.SetFeedMode(marketDTO.FeedModeSynthetic)

	svc := New(mkt, cfg)
	svc.SetNowFunc(func() time.Time { return tradingTime })
	svc.SetCreateOrderFunc(func(order *model.Order) error { return nil })

	// 1. Lot size validation: NIFTY lot size is 25
	t.Run("Lot size validation", func(t *testing.T) {
		// Valid lot sizes (25, 50)
		for _, qty := range []int64{25, 50, 75, 125} {
			_, err := svc.Create(userID, dto.CreateOrderRequest{
				Symbol:     "NIFTY 25000 CE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductFNO,
				Quantity:   qty,
				PricePaise: 10000,
			})
			if err != nil {
				t.Errorf("quantity %d should be accepted for lot size 25, got err: %v", qty, err)
			}
		}

		// Invalid lot sizes (10, 30, 49)
		for _, qty := range []int64{1, 10, 30, 49, 51} {
			_, err := svc.Create(userID, dto.CreateOrderRequest{
				Symbol:     "NIFTY 25000 CE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductFNO,
				Quantity:   qty,
				PricePaise: 10000,
			})
			if err == nil {
				t.Errorf("quantity %d should be rejected for lot size 25, got nil", qty)
			} else if !strings.Contains(err.Error(), "exact multiple of instrument lot size") {
				t.Errorf("expected lot size error, got %v", err)
			}
		}
	})

	// 2. Tick size validation: 5 paise (₹0.05)
	t.Run("Tick size validation", func(t *testing.T) {
		// Valid tick prices (multiples of 5 paise)
		for _, price := range []int64{5, 10000, 10005, 10050, 2500000} {
			_, err := svc.Create(userID, dto.CreateOrderRequest{
				Symbol:     "NIFTY 25000 CE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductFNO,
				Quantity:   25,
				PricePaise: price,
			})
			if err != nil {
				t.Errorf("price %d paise should be accepted for tick size 5 paise, got err: %v", price, err)
			}
		}

		// Invalid tick prices (not multiples of 5 paise)
		for _, price := range []int64{1, 2, 10003, 10007, 2500001} {
			_, err := svc.Create(userID, dto.CreateOrderRequest{
				Symbol:     "NIFTY 25000 CE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductFNO,
				Quantity:   25,
				PricePaise: price,
			})
			if err == nil {
				t.Errorf("price %d paise should be rejected for tick size 5 paise, got nil", price)
			} else if !strings.Contains(err.Error(), "multiple of tick size") {
				t.Errorf("expected tick size error, got %v", err)
			}
		}
	})
}

func TestFNO_All6TradingActions_Rules_Margin_Premium_PnL(t *testing.T) {
	rules := product.Rules{
		FuturesMarginPercent:    20, // 20% margin for futures
		OptionSellMarginPercent: 30, // 30% margin for option writing
	}

	// -------------------------------------------------------------------------
	// 1. CE BUY (Call Option Long)
	// -------------------------------------------------------------------------
	t.Run("CE Buy: Premium only, 0 margin blocked, linear upside PnL, ITM/OTM expiry", func(t *testing.T) {
		qty := int64(25)
		premiumPrice := int64(10000)       // ₹100
		totalPremium := qty * premiumPrice // 25 * 100 = ₹2,500 (250,000 paise)

		// Margin required at order reservation: Long option requires full premium
		resMargin, err := rules.Margin(model.OrderProductFNO, product.InstrumentOption, model.OrderSideBuy, totalPremium)
		if err != nil {
			t.Fatalf("rules.Margin error: %v", err)
		}
		if resMargin != totalPremium {
			t.Errorf("CE Buy reservation should equal full premium %d, got %d", totalPremium, resMargin)
		}

		// Position margin in execution: Long options have 0 blocked margin
		pos := model.Position{
			Quantity:           qty,
			AveragePricePaise:  premiumPrice,
			CostBasisPaise:     totalPremium,
			MarginBlockedPaise: 0,
		}

		// Unrealized P&L
		pos.CurrentPricePaise = 15000                       // ₹150 (gained ₹50)
		if pnl := pos.UnrealizedPnlPaise(); pnl != 125000 { // +₹1,250
			t.Errorf("CE Buy unrealized gain expected 125000, got %d", pnl)
		}
		pos.CurrentPricePaise = 6000                         // ₹60 (lost ₹40)
		if pnl := pos.UnrealizedPnlPaise(); pnl != -100000 { // -₹1,000
			t.Errorf("CE Buy unrealized loss expected -100000, got %d", pnl)
		}

		// Expiry Settlement
		strike := int64(2500000) // Strike 25000
		// Case A: ITM (Spot 25500)
		spotITM := int64(2550000)
		intrinsicITM, _ := optionIntrinsic("CE", spotITM, strike)
		if intrinsicITM != 50000 { // ₹500
			t.Errorf("CE ITM intrinsic expected 50000, got %d", intrinsicITM)
		}
		settlementVal := qty * intrinsicITM         // 25 * 500 = ₹12,500 (1,250,000 paise)
		realizedPnL := settlementVal - totalPremium // 1,250,000 - 250,000 = +1,000,000 paise (+₹10,000)
		if realizedPnL != 1000000 {
			t.Errorf("CE ITM realized PnL expected 1000000, got %d", realizedPnL)
		}

		// Case B: OTM (Spot 24500)
		spotOTM := int64(2450000)
		intrinsicOTM, _ := optionIntrinsic("CE", spotOTM, strike)
		if intrinsicOTM != 0 {
			t.Errorf("CE OTM intrinsic expected 0, got %d", intrinsicOTM)
		}
		otmRealizedPnL := (qty * intrinsicOTM) - totalPremium // -250,000 (loss of premium paid)
		if otmRealizedPnL != -250000 {
			t.Errorf("CE OTM realized loss expected -250000, got %d", otmRealizedPnL)
		}
	})

	// -------------------------------------------------------------------------
	// 2. CE SELL (Call Option Short / Writer)
	// -------------------------------------------------------------------------
	t.Run("CE Sell: Blocked margin, premium received, short PnL, ITM/OTM expiry", func(t *testing.T) {
		qty := int64(-25)
		premiumPrice := int64(10000)            // ₹100
		totalPremium := abs(qty) * premiumPrice // ₹2,500
		notional := abs(qty) * premiumPrice

		// Margin required: 30% of notional
		resMargin, err := rules.Margin(model.OrderProductFNO, product.InstrumentOption, model.OrderSideSell, notional)
		if err != nil {
			t.Fatalf("rules.Margin error: %v", err)
		}
		expectedMargin := notional * 30 / 100 // 75,000 paise
		if resMargin != expectedMargin {
			t.Errorf("CE Sell margin expected %d, got %d", expectedMargin, resMargin)
		}

		pos := model.Position{
			Quantity:           qty, // negative for short
			AveragePricePaise:  premiumPrice,
			CostBasisPaise:     totalPremium,
			MarginBlockedPaise: expectedMargin,
		}

		// Unrealized P&L for short: gains when option price drops
		pos.CurrentPricePaise = 6000                        // ₹60 (dropped ₹40)
		if pnl := pos.UnrealizedPnlPaise(); pnl != 100000 { // +₹1,000
			t.Errorf("CE Sell unrealized gain expected 100000, got %d", pnl)
		}
		pos.CurrentPricePaise = 15000                        // ₹150 (rose ₹50)
		if pnl := pos.UnrealizedPnlPaise(); pnl != -125000 { // -₹1,250
			t.Errorf("CE Sell unrealized loss expected -125000, got %d", pnl)
		}

		// Expiry Settlement
		strike := int64(2500000) // Strike 25000
		// Case A: OTM (Spot 24500) -> Expires worthless, seller keeps entire premium!
		spotOTM := int64(2450000)
		intrinsicOTM, _ := optionIntrinsic("CE", spotOTM, strike)
		if intrinsicOTM != 0 {
			t.Errorf("CE OTM intrinsic expected 0, got %d", intrinsicOTM)
		}
		sellerPnL_OTM := totalPremium - (abs(qty) * intrinsicOTM) // +250,000 paise
		if sellerPnL_OTM != 250000 {
			t.Errorf("CE Sell OTM profit expected +250000, got %d", sellerPnL_OTM)
		}

		// Case B: ITM (Spot 25500) -> Seller pays intrinsic (500)
		spotITM := int64(2550000)
		intrinsicITM, _ := optionIntrinsic("CE", spotITM, strike)
		sellerPayout := abs(qty) * intrinsicITM      // 25 * 500 = 1,250,000 paise
		sellerPnL_ITM := totalPremium - sellerPayout // 250,000 - 1,250,000 = -1,000,000 paise
		if sellerPnL_ITM != -1000000 {
			t.Errorf("CE Sell ITM loss expected -1000000, got %d", sellerPnL_ITM)
		}
	})

	// -------------------------------------------------------------------------
	// 3. PE BUY (Put Option Long)
	// -------------------------------------------------------------------------
	t.Run("PE Buy: Premium only, 0 margin blocked, put upside PnL, ITM/OTM expiry", func(t *testing.T) {
		qty := int64(25)
		premiumPrice := int64(12000)       // ₹120
		totalPremium := qty * premiumPrice // 300,000 paise (₹3,000)

		resMargin, _ := rules.Margin(model.OrderProductFNO, product.InstrumentOption, model.OrderSideBuy, totalPremium)
		if resMargin != totalPremium {
			t.Errorf("PE Buy reservation expected %d, got %d", totalPremium, resMargin)
		}

		pos := model.Position{
			Quantity:           qty,
			AveragePricePaise:  premiumPrice,
			CostBasisPaise:     totalPremium,
			MarginBlockedPaise: 0,
		}

		// Unrealized P&L: gains when put price rises
		pos.CurrentPricePaise = 18000                       // ₹180 (+₹60)
		if pnl := pos.UnrealizedPnlPaise(); pnl != 150000 { // +₹1,500
			t.Errorf("PE Buy unrealized gain expected 150000, got %d", pnl)
		}
		pos.CurrentPricePaise = 5000                         // ₹50 (-₹70)
		if pnl := pos.UnrealizedPnlPaise(); pnl != -175000 { // -₹1,750
			t.Errorf("PE Buy unrealized loss expected -175000, got %d", pnl)
		}

		// Expiry Settlement
		strike := int64(2500000)
		// Case A: ITM (Spot 24500) -> Strike 25000 > Spot 24500 => Intrinsic = 500
		spotITM := int64(2450000)
		intrinsicITM, _ := optionIntrinsic("PE", spotITM, strike)
		if intrinsicITM != 50000 {
			t.Errorf("PE ITM intrinsic expected 50000, got %d", intrinsicITM)
		}
		realizedPnL := (qty * intrinsicITM) - totalPremium // 1,250,000 - 300,000 = +950,000 paise
		if realizedPnL != 950000 {
			t.Errorf("PE ITM realized gain expected 950000, got %d", realizedPnL)
		}

		// Case B: OTM (Spot 25500) -> Strike 25000 < Spot 25500 => Intrinsic = 0
		spotOTM := int64(2550000)
		intrinsicOTM, _ := optionIntrinsic("PE", spotOTM, strike)
		if intrinsicOTM != 0 {
			t.Errorf("PE OTM intrinsic expected 0, got %d", intrinsicOTM)
		}
		otmRealizedPnL := (qty * intrinsicOTM) - totalPremium // -300,000 (loss of premium paid)
		if otmRealizedPnL != -300000 {
			t.Errorf("PE OTM loss expected -300000, got %d", otmRealizedPnL)
		}
	})

	// -------------------------------------------------------------------------
	// 4. PE SELL (Put Option Short / Writer)
	// -------------------------------------------------------------------------
	t.Run("PE Sell: Blocked margin, premium received, short PnL, ITM/OTM expiry", func(t *testing.T) {
		qty := int64(-25)
		premiumPrice := int64(12000)            // ₹120
		totalPremium := abs(qty) * premiumPrice // ₹3,000
		notional := abs(qty) * premiumPrice

		expectedMargin := notional * 30 / 100 // 90,000 paise
		resMargin, _ := rules.Margin(model.OrderProductFNO, product.InstrumentOption, model.OrderSideSell, notional)
		if resMargin != expectedMargin {
			t.Errorf("PE Sell margin expected %d, got %d", expectedMargin, resMargin)
		}

		pos := model.Position{
			Quantity:           qty,
			AveragePricePaise:  premiumPrice,
			CostBasisPaise:     totalPremium,
			MarginBlockedPaise: expectedMargin,
		}

		// Unrealized P&L: gains when put price drops
		pos.CurrentPricePaise = 4000                        // ₹40 (dropped ₹80)
		if pnl := pos.UnrealizedPnlPaise(); pnl != 200000 { // +₹2,000
			t.Errorf("PE Sell unrealized gain expected 200000, got %d", pnl)
		}
		pos.CurrentPricePaise = 20000                        // ₹200 (rose ₹80)
		if pnl := pos.UnrealizedPnlPaise(); pnl != -200000 { // -₹2,000
			t.Errorf("PE Sell unrealized loss expected -200000, got %d", pnl)
		}

		// Expiry Settlement
		strike := int64(2500000)
		// Case A: OTM (Spot 25500) -> Worthless, seller keeps premium!
		spotOTM := int64(2550000)
		intrinsicOTM, _ := optionIntrinsic("PE", spotOTM, strike)
		sellerPnL_OTM := totalPremium - (abs(qty) * intrinsicOTM)
		if sellerPnL_OTM != 300000 {
			t.Errorf("PE Sell OTM profit expected +300000, got %d", sellerPnL_OTM)
		}

		// Case B: ITM (Spot 24500) -> Seller pays intrinsic (500)
		spotITM := int64(2450000)
		intrinsicITM, _ := optionIntrinsic("PE", spotITM, strike)
		sellerPayout := abs(qty) * intrinsicITM      // 1,250,000 paise
		sellerPnL_ITM := totalPremium - sellerPayout // 300,000 - 1,250,000 = -950,000 paise
		if sellerPnL_ITM != -950000 {
			t.Errorf("PE Sell ITM loss expected -950000, got %d", sellerPnL_ITM)
		}
	})

	// -------------------------------------------------------------------------
	// 5. FUTURE BUY (Long Futures)
	// -------------------------------------------------------------------------
	t.Run("Future Buy: Margin blocked, no premium debit, linear PnL, cash settlement at spot", func(t *testing.T) {
		qty := int64(25)
		futurePrice := int64(2500000) // ₹25,000
		notional := qty * futurePrice // 62,500,000 paise (₹625,000)

		// Margin required: 20% of contract notional
		expectedMargin := notional * 20 / 100 // 12,500,000 paise (₹125,000)
		resMargin, err := rules.Margin(model.OrderProductFNO, product.InstrumentFuture, model.OrderSideBuy, notional)
		if err != nil || resMargin != expectedMargin {
			t.Fatalf("Future Buy margin expected %d, got %d (err: %v)", expectedMargin, resMargin, err)
		}

		pos := model.Position{
			Quantity:           qty,
			AveragePricePaise:  futurePrice,
			CostBasisPaise:     notional,
			MarginBlockedPaise: expectedMargin,
		}

		// Unrealized P&L: linear with price
		pos.CurrentPricePaise = 2550000                      // +₹500 per unit
		if pnl := pos.UnrealizedPnlPaise(); pnl != 1250000 { // +₹12,500
			t.Errorf("Future Buy unrealized gain expected 1250000, got %d", pnl)
		}
		pos.CurrentPricePaise = 2450000                       // -₹500 per unit
		if pnl := pos.UnrealizedPnlPaise(); pnl != -1250000 { // -₹12,500
			t.Errorf("Future Buy unrealized loss expected -1250000, got %d", pnl)
		}

		// Expiry Settlement at final spot price
		spotPrice := int64(2560000)                      // ₹25,600
		settlementPnL := (spotPrice - futurePrice) * qty // (25600 - 25000) * 25 = +₹15,000 (1,500,000 paise)
		if settlementPnL != 1500000 {
			t.Errorf("Future Buy settlement PnL expected 1500000, got %d", settlementPnL)
		}
	})

	// -------------------------------------------------------------------------
	// 6. FUTURE SELL (Short Futures)
	// -------------------------------------------------------------------------
	t.Run("Future Sell: Margin blocked, no premium credit, inverse PnL, cash settlement at spot", func(t *testing.T) {
		qty := int64(-25)
		futurePrice := int64(2500000)      // ₹25,000
		notional := abs(qty) * futurePrice // ₹625,000

		// Margin required: 20% of contract notional
		expectedMargin := notional * 20 / 100 // ₹125,000
		resMargin, err := rules.Margin(model.OrderProductFNO, product.InstrumentFuture, model.OrderSideSell, notional)
		if err != nil || resMargin != expectedMargin {
			t.Fatalf("Future Sell margin expected %d, got %d (err: %v)", expectedMargin, resMargin, err)
		}

		pos := model.Position{
			Quantity:           qty,
			AveragePricePaise:  futurePrice,
			CostBasisPaise:     notional,
			MarginBlockedPaise: expectedMargin,
		}

		// Unrealized P&L: short gains when price drops
		pos.CurrentPricePaise = 2450000                      // dropped ₹500
		if pnl := pos.UnrealizedPnlPaise(); pnl != 1250000 { // +₹12,500
			t.Errorf("Future Sell unrealized gain expected 1250000, got %d", pnl)
		}
		pos.CurrentPricePaise = 2550000                       // rose ₹500
		if pnl := pos.UnrealizedPnlPaise(); pnl != -1250000 { // -₹12,500
			t.Errorf("Future Sell unrealized loss expected -1250000, got %d", pnl)
		}

		// Expiry Settlement at final spot price
		spotPrice := int64(2440000)                           // ₹24,400 (dropped ₹600)
		settlementPnL := (futurePrice - spotPrice) * abs(qty) // (25000 - 24400) * 25 = +₹15,000
		if settlementPnL != 1500000 {
			t.Errorf("Future Sell settlement PnL expected 1500000, got %d", settlementPnL)
		}
	})
}
