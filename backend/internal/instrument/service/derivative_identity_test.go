package service

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestDerivativeIdentityFormatting(t *testing.T) {
	tests := []struct {
		name		string
		oldStrike	string
		newStrike	string
		oldExpiry	string
		newExpiry	string
		oldType		string
		newType		string
		want		bool
	}{
		{name: "legacy integer", oldStrike: "280.000000", newStrike: "280", want: true},
		{name: "legacy decimal", oldStrike: "280.250000", newStrike: "280.25", want: true},
		{name: "leading zeros", oldStrike: "0280.000", newStrike: "280", want: true},
		{name: "decimal below one", oldStrike: "0.500000", newStrike: "0.50", want: true},
		{name: "changed strike", oldStrike: "280.000000", newStrike: "281", want: false},
		{name: "paise is not rupees", oldStrike: "28000", newStrike: "280", want: false},
		{name: "small difference", oldStrike: "280.00000000000001", newStrike: "280", want: false},
		{name: "beyond float precision", oldStrike: "10000000000000000.01", newStrike: "10000000000000000", want: false},
		{name: "fraction rejected", oldStrike: "560/2", newStrike: "280", want: false},
		{name: "exponent rejected", oldStrike: "2.8e2", newStrike: "280", want: false},
		{name: "invalid rejected", oldStrike: "NaN", newStrike: "280", want: false},
		{name: "missing option strike", newStrike: "280", want: false},
		{name: "option sentinel rejected", oldStrike: "-1.000000", want: false},
		{name: "same expiry date", oldStrike: "280", newStrike: "280", oldExpiry: "2099-10-27", newExpiry: "27OCT2099", want: true},
		{name: "changed expiry", oldStrike: "280", newStrike: "280", oldExpiry: "27OCT2099", newExpiry: "28OCT2099", want: false},
		{name: "invalid expiry", oldStrike: "280", newStrike: "280", oldExpiry: "unknown", newExpiry: "27OCT2099", want: false},
		{name: "changed type", oldStrike: "280", newStrike: "280", oldType: "OPTSTK", newType: "OPTIDX", want: false},
		{name: "legacy futures sentinel", oldStrike: "-1.000000", oldType: "FUTSTK", newType: "FUTSTK", want: true},
		{name: "legacy index futures sentinel", oldStrike: "-1", oldType: "FUTIDX", newType: "FUTIDX", want: true},
		{name: "future zero not a sentinel", oldStrike: "0", oldType: "FUTSTK", newType: "FUTSTK", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.oldExpiry == "" {
				tt.oldExpiry = "27OCT2099"
			}
			if tt.newExpiry == "" {
				tt.newExpiry = "27OCT2099"
			}
			if tt.oldType == "" {
				tt.oldType = "OPTSTK"
			}
			if tt.newType == "" {
				tt.newType = "OPTSTK"
			}
			prior := model.Instrument{Expiry: tt.oldExpiry, Strike: tt.oldStrike, InstrumentType: tt.oldType}
			next := model.Instrument{Expiry: tt.newExpiry, Strike: tt.newStrike, InstrumentType: tt.newType}
			if got := sameDerivativeIdentity(prior, next); got != tt.want {
				t.Fatalf("identity comparison = %v, want %v: prior=%+v next=%+v", got, tt.want, prior, next)
			}
		})
	}
}

func TestActivationAcceptsLegacyDerivativeFormatting(t *testing.T) {
	db := identityTestDB(t)
	prior := []model.Instrument{
		{Symbol: "PATANJALI27OCT99280PE", Token: "100", Name: "PATANJALI", Exchange: "NFO", ExchangeSegment: "NFO", Expiry: "2099-10-27", Strike: "280.000000", InstrumentType: "OPTSTK", OptionType: "PE", LotSize: 100, Active: true, IsTradable: true, SnapshotVersion: "legacy"},
		{Symbol: "PATANJALI27OCT99FUT", Token: "101", Name: "PATANJALI", Exchange: "NFO", ExchangeSegment: "NFO", Expiry: "27OCT2099", Strike: "-1.000000", InstrumentType: "FUTSTK", LotSize: 100, Active: true, IsTradable: true, SnapshotVersion: "legacy"},
	}
	if err := db.Create(&prior).Error; err != nil {
		t.Fatal(err)
	}
	seedIdentitySnapshot(t, db)
	payload := `[
		{"token":"200","symbol":"PATANJALI27OCT99280PE","name":"PATANJALI","expiry":"27OCT2099","strike":"28000.000000","lotsize":"100","instrumenttype":"OPTSTK","exch_seg":"NFO","tick_size":"5"},
		{"token":"201","symbol":"PATANJALI27OCT99FUT","name":"PATANJALI","expiry":"27OCT2099","strike":"-1.000000","lotsize":"100","instrumenttype":"FUTSTK","exch_seg":"NFO","tick_size":"5"}
	]`
	svc := NewService(db)
	if _, _, err := svc.StageSnapshot(context.Background(), "canonical", "test", strings.NewReader(payload)); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ActivateSnapshot(context.Background(), "canonical"); err != nil {
		t.Fatal(err)
	}
	for i, original := range prior {
		var got model.Instrument
		if err := db.First(&got, original.ID).Error; err != nil {
			t.Fatal(err)
		}
		wantStrike := "280"
		if i == 1 {
			wantStrike = ""
		}
		if got.Strike != wantStrike || got.Expiry != "27OCT2099" || !got.Active || !got.IsTradable || got.SnapshotVersion != "canonical" || got.Token == original.Token || !got.CreatedAt.Equal(original.CreatedAt) {
			t.Fatalf("legacy contract was not preserved and activated: %+v", got)
		}
	}
	var count int64
	if err := db.Model(&model.Instrument{}).Count(&count).Error; err != nil || count != 2 {
		t.Fatalf("instrument history count=%d, error=%v", count, err)
	}
	var legacy model.InstrumentSnapshot
	if err := db.Where("version = ?", "legacy").First(&legacy).Error; err != nil || legacy.Status != model.SnapshotStatusRetired {
		t.Fatalf("legacy snapshot was not retired: %+v, error=%v", legacy, err)
	}
}

func TestActivationRejectsChangedDerivativeIdentity(t *testing.T) {
	for _, field := range []string{"strike", "expiry", "type"} {
		t.Run(field, func(t *testing.T) {
			db := identityTestDB(t)
			prior := model.Instrument{Symbol: "PATANJALI27OCT99280PE", Token: "100", Name: "PATANJALI", Exchange: "NFO", ExchangeSegment: "NFO", Expiry: "27OCT2099", Strike: "280.000000", InstrumentType: "OPTSTK", OptionType: "PE", LotSize: 100, Active: true, IsTradable: true, SnapshotVersion: "legacy"}
			if err := db.Create(&prior).Error; err != nil {
				t.Fatal(err)
			}
			seedIdentitySnapshot(t, db)
			raw := AngelScripItem{Token: "200", Symbol: prior.Symbol, Name: prior.Name, Expiry: prior.Expiry, Strike: "28000.000000", LotSize: "100", InstrumentType: "OPTSTK", ExchSeg: "NFO", TickSize: "5"}
			switch field {
			case "strike":
				raw.Strike = "28100.000000"
			case "expiry":
				raw.Expiry = "28OCT2099"
			case "type":
				raw.InstrumentType = "OPTIDX"
			}
			payload, err := json.Marshal([]AngelScripItem{raw})
			if err != nil {
				t.Fatal(err)
			}
			svc := NewService(db)
			if _, _, err := svc.StageSnapshot(context.Background(), "changed", "test", strings.NewReader(string(payload))); err != nil {
				t.Fatal(err)
			}
			if _, err := svc.ActivateSnapshot(context.Background(), "changed"); err == nil || !strings.Contains(err.Error(), "historical derivative identity changed") || !strings.Contains(err.Error(), "strike") {
				t.Fatalf("expected informative identity rejection, got %v", err)
			}
			var got model.Instrument
			if err := db.First(&got, prior.ID).Error; err != nil {
				t.Fatal(err)
			}
			if got.Strike != prior.Strike || got.Expiry != prior.Expiry || got.InstrumentType != prior.InstrumentType || got.Token != prior.Token || !got.Active || !got.IsTradable || got.SnapshotVersion != "legacy" {
				t.Fatalf("rejected activation changed the old master: %+v", got)
			}
			var legacy model.InstrumentSnapshot
			if err := db.Where("version = ?", "legacy").First(&legacy).Error; err != nil || legacy.Status != model.SnapshotStatusActive {
				t.Fatalf("rejected activation replaced active snapshot: %+v, error=%v", legacy, err)
			}
		})
	}
}

func identityTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "identity.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}, &model.InstrumentSnapshot{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func seedIdentitySnapshot(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Create(&model.InstrumentSnapshot{Version: "legacy", Source: "test", Status: model.SnapshotStatusActive, TotalInstruments: 2}).Error; err != nil {
		t.Fatal(err)
	}
}
