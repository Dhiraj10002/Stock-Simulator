package repository

import (
	"errors"
	"testing"
)

func TestOrderRepository_FindInstrument_NilDB(t *testing.T) {
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
	repo := New()
	err := repo.Create(nil)
	if err == nil || err.Error() != "database not connected" {
		t.Fatalf("expected 'database not connected' error, got %v", err)
	}
}
