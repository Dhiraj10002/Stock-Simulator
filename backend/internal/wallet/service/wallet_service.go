package service

import (
	"fmt"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/wallet/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/wallet/repository"
	"github.com/google/uuid"
)

type WalletService struct {
	repo *repository.WalletRepository
	cfg  *config.Config
}

func New(cfg *config.Config) *WalletService { return &WalletService{repo: repository.New(), cfg: cfg} }

func (s *WalletService) CreateInitialWallet(userUUID uuid.UUID) error {
	wallet := &model.Wallet{UserUUID: userUUID, CashBalancePaise: s.cfg.InitialVirtualBalancePaise}
	return s.repo.CreateInitial(wallet)
}

func (s *WalletService) Get(userID string) (*dto.WalletResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	wallet, err := s.repo.FindByUserUUID(userUUID)
	if err != nil {
		return nil, err
	}
	return toWalletResponse(wallet), nil
}

func (s *WalletService) Transactions(userID string) ([]dto.TransactionResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	wallet, err := s.repo.FindByUserUUID(userUUID)
	if err != nil {
		return nil, err
	}
	items, err := s.repo.ListTransactions(wallet.UUID)
	if err != nil {
		return nil, err
	}
	result := make([]dto.TransactionResponse, 0, len(items))
	for _, item := range items {
		result = append(result, dto.TransactionResponse{UUID: item.UUID.String(), Type: item.Type, AmountPaise: item.AmountPaise, BalancePaise: item.BalancePaise, BlockedPaise: item.BlockedPaise, Note: item.Note, CreatedAt: item.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00")})
	}
	return result, nil
}

// Credit, Debit, Reserve, and Release are server-side operations used by the
// order/trading engine. They intentionally have no public HTTP endpoint.
func (s *WalletService) Credit(userID string, amount int64, note string) error {
	wallet, err := s.walletForUser(userID)
	if err != nil {
		return err
	}
	return s.repo.Credit(wallet.UUID, amount, note)
}

func (s *WalletService) Debit(userID string, amount int64, note string) error {
	wallet, err := s.walletForUser(userID)
	if err != nil {
		return err
	}
	return s.repo.Debit(wallet.UUID, amount, note)
}

func (s *WalletService) Reserve(userID string, amount int64, note string) error {
	wallet, err := s.walletForUser(userID)
	if err != nil {
		return err
	}
	return s.repo.Reserve(wallet.UUID, amount, note)
}

func (s *WalletService) Release(userID string, amount int64, note string) error {
	wallet, err := s.walletForUser(userID)
	if err != nil {
		return err
	}
	return s.repo.Release(wallet.UUID, amount, note)
}

func (s *WalletService) walletForUser(userID string) (*model.Wallet, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	return s.repo.FindByUserUUID(userUUID)
}

func (s *WalletService) Reset(userID string) (*dto.WalletResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	wallet, err := s.repo.FindByUserUUID(userUUID)
	if err != nil {
		return nil, err
	}
	wallet, err = s.repo.Reset(wallet.UUID, s.cfg.InitialVirtualBalancePaise)
	if err != nil {
		return nil, err
	}
	return toWalletResponse(wallet), nil
}

func toWalletResponse(wallet *model.Wallet) *dto.WalletResponse {
	return &dto.WalletResponse{UUID: wallet.UUID.String(), CashBalancePaise: wallet.CashBalancePaise, AvailableBalancePaise: wallet.AvailableBalancePaise(), BlockedPaise: wallet.BlockedPaise}
}
