package service

import (
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
)

func TestResetRejectsInvalidUserIdentity(t *testing.T) {
	service := New(&config.Config{InitialVirtualBalancePaise: 100000000})

	if err := service.Reset("not-a-uuid"); err == nil {
		t.Fatal("expected invalid user identity to be rejected")
	}
}
