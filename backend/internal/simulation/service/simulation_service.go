package service

import (
	"fmt"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/simulation/repository"
	"github.com/google/uuid"
)

type SimulationService struct {
	repo *repository.SimulationRepository
	cfg  *config.Config
}

func New(cfg *config.Config) *SimulationService {
	return &SimulationService{repo: repository.New(), cfg: cfg}
}

func (s *SimulationService) Reset(userID string) error {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user identity")
	}
	return s.repo.ResetCurrentState(userUUID, s.cfg.InitialVirtualBalancePaise)
}
