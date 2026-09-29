package service

import (
	"fmt"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/google/uuid"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"gorm.io/gorm"
)

// These regressions require an explicitly selected disposable database.
func accountingDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.RequireDisposableDB(t)
}

func accountingWallet(t *testing.T, db *gorm.DB) model.Wallet {
	t.Helper()
	w := model.Wallet{UUID: uuid.New(), UserUUID: uuid.New(), CashBalancePaise: 100000000}
	if err := db.Create(&w).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, value := range []any{&model.Trade{}, &model.Order{}, &model.Position{}, &model.RiskEvent{}} {
			if err := db.Where("user_uuid = ?", w.UserUUID).Delete(value).Error; err != nil {
				t.Fatal(err)
			}
		}
		if err := db.Where("wallet_uuid = ?", w.UUID).Delete(&model.WalletTransaction{}).Error; err != nil {
			t.Fatal(err)
		}
		db.Delete(&w)
	})
	return w
}

func accountingService() *OrderService {
	s := New(nil, &config.Config{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30})
	loc := time.FixedZone("IST", 19800)
	s.SetNowFunc(func() time.Time { return time.Date(2026, 9, 16, 11, 0, 0, 0, loc) })
	return s
}

func accountingFill(t *testing.T, db *gorm.DB, s *OrderService, w model.Wallet, symbol, prod, side string, qty, quote int64) model.Trade {
	t.Helper()
	s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: quote}, nil
	})
	o := model.Order{UserUUID: w.UserUUID, Symbol: symbol, Product: prod, Side: side, Type: model.OrderTypeMarket, Quantity: qty, Status: model.OrderStatusPending}
	if err := db.Create(&o).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.Execute(w.UserUUID.String(), o.UUID.String()); err != nil {
		t.Fatal(err)
	}
	var trade model.Trade
	if err := db.Where("order_uuid = ?", o.UUID).First(&trade).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&o, o.ID).Error; err != nil {
		t.Fatal(err)
	}
	if trade.TotalPaise != trade.Quantity*trade.PricePaise || o.ExecutedPricePaise != trade.PricePaise {
		t.Errorf("inconsistent fill: order=%d trade=%d total=%d qty=%d", o.ExecutedPricePaise, trade.PricePaise, trade.TotalPaise, trade.Quantity)
	}
	return trade
}

func TestAccountingExpiryCashAndPnl(t *testing.T) {
	db := accountingDB(t)
	for _, qty := range []int64{10, -10} {
		for _, price := range []int64{9000, 11000} {
			for _, kind := range []string{product.InstrumentFuture, product.InstrumentOption} {
				t.Run(fmt.Sprintf("%s/quantity=%d/settlement=%d", kind, qty, price), func(t *testing.T) {
					w := accountingWallet(t, db)
					p := model.Position{UserUUID: w.UserUUID, Symbol: "EXPIRYTEST", Product: model.OrderProductFNO, Quantity: qty, AveragePricePaise: 10000, MarginBlockedPaise: 20000}
					w.BlockedPaise = 20000
					if err := db.Save(&w).Error; err != nil {
						t.Fatal(err)
					}
					if err := db.Create(&p).Error; err != nil {
						t.Fatal(err)
					}
					s := accountingService()
					if err := s.settleExpiredPosition(p.UUID, price, kind); err != nil {
						t.Fatal(err)
					}
					pnl := (price - 10000) * qty
					cash := pnl
					if kind == product.InstrumentOption {
						cash = price * qty
					}
					var got model.Wallet
					if err := db.First(&got, w.ID).Error; err != nil {
						t.Fatal(err)
					}
					var tr model.Trade
					if err := db.Where("user_uuid = ?", w.UserUUID).First(&tr).Error; err != nil {
						t.Fatal(err)
					}
					var ledger model.WalletTransaction
					if err := db.Where("wallet_uuid = ?", w.UUID).First(&ledger).Error; err != nil {
						t.Fatal(err)
					}
					if err := db.First(&p, p.ID).Error; err != nil {
						t.Fatal(err)
					}
					expectedType := model.WalletTransactionCredit
					if cash < 0 {
						expectedType = model.WalletTransactionDebit
					}
					if got.CashBalancePaise != w.CashBalancePaise+cash || got.BlockedPaise != 0 || tr.RealizedPnlPaise != pnl || p.RealizedPnlPaise != pnl || p.Quantity != 0 || ledger.Type != expectedType || ledger.AmountPaise != abs(cash) || ledger.BalancePaise != got.CashBalancePaise {
						t.Fatalf("settlement mismatch qty=%d price=%d cash=%d pnl=%d wallet=%+v trade=%+v ledger=%+v", qty, price, cash, pnl, got, tr, ledger)
					}
					if err := s.settleExpiredPosition(p.UUID, price, kind); err != nil {
						t.Fatal(err)
					}
					var count int64
					if err := db.Model(&model.Trade{}).Where("user_uuid = ?", w.UserUUID).Count(&count).Error; err != nil {
						t.Fatal(err)
					}
					if count != 1 {
						t.Fatal("expiry retry created duplicate settlement")
					}
				})
			}
		}
	}
}

func TestAccountingDeliveryDoesNotMutateIntraday(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	mis := model.Position{UserUUID: w.UserUUID, Symbol: "DUALTEST", Product: model.OrderProductIntraday, Quantity: 20, AveragePricePaise: 8000, CostBasisPaise: 160000}
	if err := db.Create(&mis).Error; err != nil {
		t.Fatal(err)
	}
	accountingFill(t, db, s, w, mis.Symbol, model.OrderProductDelivery, model.OrderSideBuy, 10, 10000)
	accountingFill(t, db, s, w, mis.Symbol, model.OrderProductDelivery, model.OrderSideSell, 4, 11000)
	var got model.Position
	if err := db.First(&got, mis.ID).Error; err != nil {
		t.Fatal(err)
	}
	if got.Quantity != 20 || got.CostBasisPaise != 160000 || got.AveragePricePaise != 8000 {
		t.Fatalf("intraday row mutated: %+v", got)
	}
	var delivery model.Position
	if err := db.Where("user_uuid = ? AND product = ?", w.UserUUID, model.OrderProductDelivery).First(&delivery).Error; err != nil {
		t.Fatal(err)
	}
	if delivery.Quantity != 6 || delivery.CostBasisPaise != 60000 || delivery.RealizedPnlPaise != 4000 {
		t.Fatalf("wrong delivery position: %+v", delivery)
	}
	var gotWallet model.Wallet
	if err := db.First(&gotWallet, w.ID).Error; err != nil {
		t.Fatal(err)
	}
	if gotWallet.CashBalancePaise != w.CashBalancePaise-100000+44000 {
		t.Fatal("delivery cash mismatch")
	}
}

func TestAccountingMarginFillReconciliation(t *testing.T) {
	db := accountingDB(t)
	for _, kind := range []string{"MIS", "FUTSTK", "OPTSTK"} {
		for _, side := range []string{model.OrderSideBuy, model.OrderSideSell} {
			t.Run(kind+side, func(t *testing.T) {
				w := accountingWallet(t, db)
				s := accountingService()
				prod := model.OrderProductIntraday
				symbol := "TEST" + uuid.NewString()[:8]
				if kind != "MIS" {
					prod = model.OrderProductFNO
					inst := model.Instrument{Token: uuid.NewString()[:16], Symbol: symbol, ExchangeSegment: "NFO", InstrumentType: kind, UnderlyingSymbol: "TCS", Expiry: "2030-09-26", LotSize: 1, Strike: "100", OptionType: "CE", Active: true}
					if err := db.Create(&inst).Error; err != nil {
						t.Fatal(err)
					}
					t.Cleanup(func() { db.Delete(&inst) })
				}
				open := accountingFill(t, db, s, w, symbol, prod, side, 100, 10000)
				wantOpen := int64(10005)
				closeSide := model.OrderSideSell
				wantClose := int64(10995)
				sign := int64(1)
				if side == model.OrderSideSell {
					wantOpen = 9995
					closeSide = model.OrderSideBuy
					wantClose = 11005
					sign = -1
				}
				if open.PricePaise != wantOpen {
					t.Errorf("opening fill=%d want %d", open.PricePaise, wantOpen)
				}
				var p model.Position
				if err := db.Where("user_uuid = ?", w.UserUUID).First(&p).Error; err != nil {
					t.Fatal(err)
				}
				if p.AveragePricePaise != wantOpen || p.CostBasisPaise != wantOpen*100 {
					t.Errorf("entry cost mismatch: %+v", p)
				}
				close := accountingFill(t, db, s, w, symbol, prod, closeSide, 100, 11000)
				pnl := (wantClose - wantOpen) * 100 * sign
				if close.PricePaise != wantClose || close.RealizedPnlPaise != pnl {
					t.Errorf("closing fill mismatch: %+v expected pnl=%d", close, pnl)
				}
				if err := db.First(&p, p.ID).Error; err != nil {
					t.Fatal(err)
				}
				var got model.Wallet
				if err := db.First(&got, w.ID).Error; err != nil {
					t.Fatal(err)
				}
				if p.Quantity != 0 || p.RealizedPnlPaise != pnl || got.CashBalancePaise != w.CashBalancePaise+pnl || got.BlockedPaise != 0 {
					t.Errorf("round trip mismatch: position=%+v wallet=%+v pnl=%d", p, got, pnl)
				}
				var ledger []model.WalletTransaction
				if err := db.Where("wallet_uuid = ?", w.UUID).Find(&ledger).Error; err != nil {
					t.Fatal(err)
				}
				var delta int64
				for _, e := range ledger {
					if e.Type == model.WalletTransactionDebit {
						delta -= abs(e.AmountPaise)
					} else {
						delta += abs(e.AmountPaise)
					}
				}
				if delta != pnl {
					t.Errorf("ledger delta=%d pnl=%d", delta, pnl)
				}
			})
		}
	}
}
