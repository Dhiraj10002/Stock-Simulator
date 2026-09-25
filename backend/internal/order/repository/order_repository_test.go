package repository

import (
	"errors"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
)

func TestOrderRepository_FindInstrument_NilDB(t *testing.T) {
	if database.GetDB() != nil {
		t.Skip("skipping nil DB test because database is connected")
	}
	repo := New()
	inst, err := repo.FindInstrument("PRAJIND")
	if inst != nil {
		t.Fatalf("expected nil instrument with nil DB, got %+v", inst)
	}
	if err == nil || !errors.Is(err, errors.New("database not connected")) && err.Error() != "database not connected" {
		t.Fatalf("expected 'database not connected' error, got %v", err)
	}
}

func TestOrderRepository_Create_NilDB(t *testing.T) {
	if database.GetDB() != nil {
		t.Skip("skipping nil DB test because database is connected")
	}
	repo := New()
	err := repo.Create(nil)
	if err == nil || err.Error() != "database not connected" {
		t.Fatalf("expected 'database not connected' error, got %v", err)
	}
}
