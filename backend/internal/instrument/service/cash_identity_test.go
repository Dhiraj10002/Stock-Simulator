package service

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"path/filepath"
	"testing"
)

func TestBareCashSymbolPrefersNSEOverLaterBSEImport(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "identity.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	for _, row := range []model.Instrument{
		{Symbol: "RELIANCE-EQ", Name: "RELIANCE", Token: "2885", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", Active: true, IsTradable: true},
		{Symbol: "RELIANCE", Name: "RELIANCE", Token: "500325", Exchange: "BSE", ExchangeSegment: "BSE", InstrumentType: "EQUITY", Active: true, IsTradable: true},
		{Symbol: "TCS-BSE", Name: "TCS", Token: "532540", Exchange: "BSE", ExchangeSegment: "BSE", InstrumentType: "EQUITY", Active: true, IsTradable: true},
	} {
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, symbol := range []string{"RELIANCE", "RELIANCE-EQ", " reliance "} {
		got, err := NewService(db).GetBySymbol(symbol)
		if err != nil || got.Exchange != "NSE" || got.Token != "2885" {
			t.Fatalf("mixed cash identity: %+v %v", got, err)
		}
	}
	if err := db.Model(&model.Instrument{}).Where("symbol = ?", "RELIANCE-EQ").Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	retired, err := NewService(db).GetBySymbol("RELIANCE")
	if err != nil || retired.Exchange != "NSE" || retired.Active {
		t.Fatal("retired NSE identity incorrectly replaced with BSE")
	}

	explicit, err := NewService(db).GetBySymbol("TCS-BSE")
	if err != nil || explicit.Exchange != "BSE" {
		t.Fatal("explicit BSE identity was replaced")
	}
}
