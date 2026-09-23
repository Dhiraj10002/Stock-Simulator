package service

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
)

// In-memory canonical instrument registry representing the PostgreSQL `instruments` table.
// Both Equity and F&O share this exact schema and store.
var canonicalInstrumentsDB = map[string]model.Instrument{
	"PRAJIND-EQ": {
		Token:            "2705",
		Symbol:           "PRAJIND-EQ",
		Name:             "PRAJIND",
		UnderlyingSymbol: "",
		Expiry:           "",
		Strike:           "-1.000000",
		OptionType:       "XX",
		LotSize:          1,
		InstrumentType:   "",
		ExchangeSegment:  "NSE",
		TickSize:         "5.000000",
	},
	"ETERNAL-EQ": {
		Token:            "5097",
		Symbol:           "ETERNAL-EQ",
		Name:             "ETERNAL",
		UnderlyingSymbol: "",
		Expiry:           "",
		Strike:           "-1.000000",
		OptionType:       "XX",
		LotSize:          1,
		InstrumentType:   "",
		ExchangeSegment:  "NSE",
		TickSize:         "5.000000",
	},
	"TMPV-EQ": {
		Token:            "3456",
		Symbol:           "TMPV-EQ",
		Name:             "TMPV",
		UnderlyingSymbol: "",
		Expiry:           "",
		Strike:           "-1.000000",
		OptionType:       "XX",
		LotSize:          1,
		InstrumentType:   "",
		ExchangeSegment:  "NSE",
		TickSize:         "5.000000",
	},
	"NIFTY24OCT25000CE": {
		Token:            "NFO_25000_CE",
		Symbol:           "NIFTY24OCT25000CE",
		Name:             "NIFTY",
		UnderlyingSymbol: "NIFTY",
		Expiry:           "2026-10-29",
		Strike:           "25000.000000",
		OptionType:       "CE",
		LotSize:          25,
		InstrumentType:   "OPTIDX",
		ExchangeSegment:  "NFO",
		TickSize:         "5.000000",
	},
	"BANKNIFTY24OCT50000PE": {
		Token:            "NFO_50000_PE",
		Symbol:           "BANKNIFTY24OCT50000PE",
		Name:             "BANKNIFTY",
		UnderlyingSymbol: "BANKNIFTY",
		Expiry:           "2026-10-29",
		Strike:           "50000.000000",
		OptionType:       "PE",
		LotSize:          15,
		InstrumentType:   "OPTIDX",
		ExchangeSegment:  "NFO",
		TickSize:         "5.000000",
	},
}

// mockInstrumentFinder implements canonical repository lookup with dynamic alias resolution.
func mockInstrumentFinder(symbol string) (*model.Instrument, error) {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	if clean == "" {
		return nil, fmt.Errorf("empty symbol")
	}

	// 1. Direct query: exact symbol or -EQ
	for _, inst := range canonicalInstrumentsDB {
		if strings.EqualFold(inst.Symbol, clean) ||
			strings.EqualFold(inst.Symbol, clean+"-EQ") ||
			strings.EqualFold(inst.Name, clean) {
			copy := inst
			return &copy, nil
		}
	}

	// 2. Canonical alias resolution
	canonical := alias.ResolveCanonicalSymbol(clean)
	if canonical != "" && canonical != clean {
		for _, inst := range canonicalInstrumentsDB {
			if strings.EqualFold(inst.Symbol, canonical) ||
				strings.EqualFold(inst.Symbol, canonical+"-EQ") ||
				strings.EqualFold(inst.Name, canonical) {
				copy := inst
				return &copy, nil
			}
		}
	}

	// 3. Reverse aliases
	for _, a := range alias.GetAliases(clean) {
		for _, inst := range canonicalInstrumentsDB {
			if strings.EqualFold(inst.Symbol, a) ||
				strings.EqualFold(inst.Symbol, a+"-EQ") ||
				strings.EqualFold(inst.Name, a) {
				copy := inst
				return &copy, nil
			}
		}
	}

	return nil, fmt.Errorf("instrument %q not found in canonical instrument master", symbol)
}

func setupTestOrderService(t *testing.T) *OrderService {
	loc := calendar.Location()
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)

	svc := New(nil, &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	})
	svc.SetNowFunc(func() time.Time { return tradingTime })
	svc.SetInstrumentFinder(mockInstrumentFinder)
	svc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		// Mock valid executable live quote
		clean := alias.CleanSymbol(symbol)
		canonical := alias.ResolveCanonicalSymbol(clean)
		price := int64(100000)
		if canonical == "PRAJIND" {
			price = 31215 // ₹312.15
		} else if canonical == "ETERNAL" {
			price = 26450 // ₹264.50
		} else if canonical == "TMPV" {
			price = 30165 // ₹301.65
		}
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: price,
			Source:     "angelone_live",
			UpdatedAt:  tradingTime.Format(time.RFC3339),
		}, nil
	})
	svc.SetCreateOrderFunc(func(order *model.Order) error {
		return nil
	})
	return svc
}

// Requirement 1 & 9: Verify all 6 authoritative exchange fields (token, exchange_segment, expiry, strike, lot_size, tick_size)
func TestCanonicalInstrument_MetadataVerification(t *testing.T) {
	tests := []struct {
		name            string
		querySymbol     string
		expectedToken   string
		expectedSegment string
		expectedExpiry  string
		expectedStrike  string
		expectedLotSize int64
		expectedTick    string
	}{
		{
			name:            "PRAJIND Equity metadata",
			querySymbol:     "PRAJIND",
			expectedToken:   "2705",
			expectedSegment: "NSE",
			expectedExpiry:  "",
			expectedStrike:  "-1.000000",
			expectedLotSize: 1,
			expectedTick:    "5.000000",
		},
		{
			name:            "ETERNAL Canonical Equity metadata",
			querySymbol:     "ETERNAL",
			expectedToken:   "5097",
			expectedSegment: "NSE",
			expectedExpiry:  "",
			expectedStrike:  "-1.000000",
			expectedLotSize: 1,
			expectedTick:    "5.000000",
		},
		{
			name:            "ZOMATO Alias resolving to ETERNAL metadata",
			querySymbol:     "ZOMATO",
			expectedToken:   "5097",
			expectedSegment: "NSE",
			expectedExpiry:  "",
			expectedStrike:  "-1.000000",
			expectedLotSize: 1,
			expectedTick:    "5.000000",
		},
		{
			name:            "TMPV Canonical Equity metadata",
			querySymbol:     "TMPV",
			expectedToken:   "3456",
			expectedSegment: "NSE",
			expectedExpiry:  "",
			expectedStrike:  "-1.000000",
			expectedLotSize: 1,
			expectedTick:    "5.000000",
		},
		{
			name:            "TATAMOTORS Alias resolving to TMPV metadata",
			querySymbol:     "TATAMOTORS",
			expectedToken:   "3456",
			expectedSegment: "NSE",
			expectedExpiry:  "",
			expectedStrike:  "-1.000000",
			expectedLotSize: 1,
			expectedTick:    "5.000000",
		},
		{
			name:            "NIFTY F&O Option metadata",
			querySymbol:     "NIFTY24OCT25000CE",
			expectedToken:   "NFO_25000_CE",
			expectedSegment: "NFO",
			expectedExpiry:  "2026-10-29",
			expectedStrike:  "25000.000000",
			expectedLotSize: 25,
			expectedTick:    "5.000000",
		},
		{
			name:            "BANKNIFTY F&O Option metadata",
			querySymbol:     "BANKNIFTY24OCT50000PE",
			expectedToken:   "NFO_50000_PE",
			expectedSegment: "NFO",
			expectedExpiry:  "2026-10-29",
			expectedStrike:  "50000.000000",
			expectedLotSize: 15,
			expectedTick:    "5.000000",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inst, err := mockInstrumentFinder(tt.querySymbol)
			if err != nil {
				t.Fatalf("unexpected error finding %s: %v", tt.querySymbol, err)
			}
			if inst.Token != tt.expectedToken {
				t.Errorf("token: got %s, want %s", inst.Token, tt.expectedToken)
			}
			if inst.ExchangeSegment != tt.expectedSegment {
				t.Errorf("exchange_segment: got %s, want %s", inst.ExchangeSegment, tt.expectedSegment)
			}
			if inst.Expiry != tt.expectedExpiry {
				t.Errorf("expiry: got %s, want %s", inst.Expiry, tt.expectedExpiry)
			}
			if inst.Strike != tt.expectedStrike {
				t.Errorf("strike: got %s, want %s", inst.Strike, tt.expectedStrike)
			}
			if inst.LotSize != tt.expectedLotSize {
				t.Errorf("lot_size: got %d, want %d", inst.LotSize, tt.expectedLotSize)
			}
			if inst.TickSize != tt.expectedTick {
				t.Errorf("tick_size: got %s, want %s", inst.TickSize, tt.expectedTick)
			}
		})
	}
}

// Requirement 5: Unknown contracts must be rejected
func TestOrderService_UnknownContractsRejected(t *testing.T) {
	svc := setupTestOrderService(t)
	userID := uuid.New().String()

	unknownTests := []struct {
		name    string
		request dto.CreateOrderRequest
	}{
		{
			name: "Unknown equity contract",
			request: dto.CreateOrderRequest{
				Symbol:     "NONEXISTENT_STK",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   10,
				PricePaise: 100000,
			},
		},
		{
			name: "Fabricated / unregistered F&O contract",
			request: dto.CreateOrderRequest{
				Symbol:     "NIFTY_FAKE_OPTION_25000",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductFNO,
				Quantity:   25,
				PricePaise: 5000,
			},
		},
		{
			name: "Random corporate ticker",
			request: dto.CreateOrderRequest{
				Symbol:   "FAKE_CORP_999",
				Side:     model.OrderSideBuy,
				Type:     model.OrderTypeMarket,
				Product:  model.OrderProductIntraday,
				Quantity: 1,
			},
		},
	}

	for _, tt := range unknownTests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.Create(userID, tt.request)
			if err == nil {
				t.Fatalf("expected order for unknown contract %s to be rejected, but it was accepted", tt.request.Symbol)
			}
			if !strings.Contains(err.Error(), "not found in canonical instrument master") {
				t.Errorf("expected error message to mention 'not found in canonical instrument master', got: %v", err)
			}
		})
	}
}

// Requirement 6: Verify PRAJIND end-to-end
func TestOrderService_PRAJIND_EndToEnd(t *testing.T) {
	svc := setupTestOrderService(t)
	userID := uuid.New().String()

	// 1. Verify instrument metadata
	inst, err := mockInstrumentFinder("PRAJIND")
	if err != nil {
		t.Fatalf("failed to find PRAJIND: %v", err)
	}
	if inst.Token != "2705" {
		t.Fatalf("expected token 2705 for PRAJIND, got %s", inst.Token)
	}
	if inst.ExchangeSegment != "NSE" {
		t.Fatalf("expected exchange NSE for PRAJIND, got %s", inst.ExchangeSegment)
	}

	// 2. Place market order on PRAJIND
	req := dto.CreateOrderRequest{
		Symbol:   "PRAJIND",
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 10,
	}
	res, err := svc.Create(userID, req)
	if err != nil {
		t.Fatalf("unexpected error placing PRAJIND order: %v", err)
	}
	if res.Symbol != "PRAJIND" {
		t.Errorf("expected order symbol PRAJIND, got %s", res.Symbol)
	}

	// 3. Place limit order on PRAJIND-EQ (with suffix)
	reqSuffix := dto.CreateOrderRequest{
		Symbol:     "PRAJIND-EQ",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   5,
		PricePaise: 31215, // exact benchmark ₹312.15
	}
	resSuffix, err := svc.Create(userID, reqSuffix)
	if err != nil {
		t.Fatalf("unexpected error placing PRAJIND-EQ order: %v", err)
	}
	if resSuffix.Quantity != 5 {
		t.Errorf("expected quantity 5, got %d", resSuffix.Quantity)
	}
}

// Requirement 7: Verify ZOMATO -> ETERNAL
func TestOrderService_ZOMATO_To_ETERNAL(t *testing.T) {
	svc := setupTestOrderService(t)
	userID := uuid.New().String()

	// 1. Direct alias resolution
	if canonical := alias.ResolveCanonicalSymbol("ZOMATO"); canonical != "ETERNAL" {
		t.Fatalf("expected ZOMATO to resolve to ETERNAL, got %s", canonical)
	}
	if canonical := alias.ResolveCanonicalSymbol("ZOMATO-EQ"); canonical != "ETERNAL" {
		t.Fatalf("expected ZOMATO-EQ to resolve to ETERNAL, got %s", canonical)
	}

	// 2. Reverse alias
	aliases := alias.GetAliases("ETERNAL")
	found := false
	for _, a := range aliases {
		if a == "ZOMATO" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected ZOMATO in reverse aliases of ETERNAL, got %v", aliases)
	}

	// 3. Order placement using alias ZOMATO
	reqAlias := dto.CreateOrderRequest{
		Symbol:     "ZOMATO",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   10,
		PricePaise: 26450,
	}
	res, err := svc.Create(userID, reqAlias)
	if err != nil {
		t.Fatalf("order placement for ZOMATO failed: %v", err)
	}
	if res == nil {
		t.Fatal("expected non-nil order response")
	}

	// 4. Order placement using canonical ETERNAL
	reqCanonical := dto.CreateOrderRequest{
		Symbol:     "ETERNAL",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   10,
		PricePaise: 26450,
	}
	resCanon, err := svc.Create(userID, reqCanonical)
	if err != nil {
		t.Fatalf("order placement for ETERNAL failed: %v", err)
	}
	if resCanon == nil {
		t.Fatal("expected non-nil order response")
	}
}

// Requirement 8: Verify TATAMOTORS -> TMPV
func TestOrderService_TATAMOTORS_To_TMPV(t *testing.T) {
	svc := setupTestOrderService(t)
	userID := uuid.New().String()

	// 1. Direct alias resolution
	if canonical := alias.ResolveCanonicalSymbol("TATAMOTORS"); canonical != "TMPV" {
		t.Fatalf("expected TATAMOTORS to resolve to TMPV, got %s", canonical)
	}
	if canonical := alias.ResolveCanonicalSymbol("TATAMOTORS-EQ"); canonical != "TMPV" {
		t.Fatalf("expected TATAMOTORS-EQ to resolve to TMPV, got %s", canonical)
	}

	// 2. Reverse alias
	aliases := alias.GetAliases("TMPV")
	found := false
	for _, a := range aliases {
		if a == "TATAMOTORS" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected TATAMOTORS in reverse aliases of TMPV, got %v", aliases)
	}

	// 3. Order placement using alias TATAMOTORS
	reqAlias := dto.CreateOrderRequest{
		Symbol:     "TATAMOTORS",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   20,
		PricePaise: 30165,
	}
	res, err := svc.Create(userID, reqAlias)
	if err != nil {
		t.Fatalf("order placement for TATAMOTORS failed: %v", err)
	}
	if res == nil {
		t.Fatal("expected non-nil order response")
	}

	// 4. Order placement using canonical TMPV
	reqCanonical := dto.CreateOrderRequest{
		Symbol:     "TMPV",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   20,
		PricePaise: 30165,
	}
	resCanon, err := svc.Create(userID, reqCanonical)
	if err != nil {
		t.Fatalf("order placement for TMPV failed: %v", err)
	}
	if resCanon == nil {
		t.Fatal("expected non-nil order response")
	}
}

// Requirement 2: Symbol alias mapping must be updateable without code edits
func TestDynamicAlias_UpdateableWithoutCodeEdits(t *testing.T) {
	mgr := alias.NewManager()

	// 1. Unknown merger initially
	if canonical := mgr.ResolveCanonicalSymbol("MERGER_SRC"); canonical != "MERGER_SRC" {
		t.Fatalf("expected MERGER_SRC before update, got %s", canonical)
	}

	// 2. Dynamic runtime update (e.g. from Redis HSET or JSON or env)
	mgr.SetAlias("MERGER_SRC", "MERGER_DST")

	// 3. Immediately resolves to canonical target
	if canonical := mgr.ResolveCanonicalSymbol("MERGER_SRC"); canonical != "MERGER_DST" {
		t.Fatalf("expected MERGER_DST after dynamic update, got %s", canonical)
	}
	if canonical := mgr.ResolveCanonicalSymbol("MERGER_SRC-EQ"); canonical != "MERGER_DST" {
		t.Fatalf("expected MERGER_DST for -EQ suffix after dynamic update, got %s", canonical)
	}

	// 4. Reverse lookup immediately discovers new alias
	aliases := mgr.GetAliases("MERGER_DST")
	if len(aliases) != 1 || aliases[0] != "MERGER_SRC" {
		t.Fatalf("expected ['MERGER_SRC'], got %v", aliases)
	}
}
