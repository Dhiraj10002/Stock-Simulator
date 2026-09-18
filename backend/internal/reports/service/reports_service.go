package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/reports/dto"
	"github.com/google/uuid"
)

type ReportsService struct{}

func New() *ReportsService {
	return &ReportsService{}
}

func (s *ReportsService) GetContractNote(userID, dateStr string) (*dto.ContractNoteResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}

	tradeDate := time.Now().UTC()
	if strings.TrimSpace(dateStr) != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			tradeDate = parsed
		}
	}

	startOfDay := time.Date(tradeDate.Year(), tradeDate.Month(), tradeDate.Day(), 0, 0, 0, 0, time.UTC)
	endOfDay := startOfDay.Add(24 * time.Hour)

	db := database.GetDB()
	var user model.User
	var trades []model.Trade

	if db != nil {
		_ = db.Where("uuid = ?", userUUID).First(&user).Error
		_ = db.Where("user_uuid = ? AND executed_at >= ? AND executed_at < ?", userUUID, startOfDay, endOfDay).
			Order("executed_at ASC").
			Find(&trades).Error
	}

	dateFormatted := startOfDay.Format("2006-01-02")
	// T+1 settlement date
	settlementDate := startOfDay.Add(24 * time.Hour).Format("2006-01-02")

	shortUUID := userUUID.String()
	if len(shortUUID) > 8 {
		shortUUID = shortUUID[:8]
	}
	contractNoteNo := fmt.Sprintf("CN-%s-%s", strings.ReplaceAll(dateFormatted, "-", ""), strings.ToUpper(shortUUID))

	clientName := user.Name
	if clientName == "" {
		clientName = "Simulated Client"
	}

	var items []dto.ContractNoteItem
	var totalBuyTurnover int64
	var totalSellTurnover int64
	var chargesSummary dto.ChargesBreakdown

	for _, t := range trades {
		charges := CalculateCharges(t.Symbol, t.Side, t.Product, t.Quantity, t.PricePaise)

		isBuy := strings.ToUpper(t.Side) == "BUY"
		var netObligation int64
		if isBuy {
			netObligation = t.TotalPaise + charges.TotalTaxChargesPaise
			totalBuyTurnover += t.TotalPaise
		} else {
			netObligation = t.TotalPaise - charges.TotalTaxChargesPaise
			totalSellTurnover += t.TotalPaise
		}

		chargesSummary.BrokeragePaise += charges.BrokeragePaise
		chargesSummary.SttPaise += charges.SttPaise
		chargesSummary.ExchangeTxnPaise += charges.ExchangeTxnPaise
		chargesSummary.SebiChargesPaise += charges.SebiChargesPaise
		chargesSummary.StampDutyPaise += charges.StampDutyPaise
		chargesSummary.GstPaise += charges.GstPaise
		chargesSummary.TotalTaxChargesPaise += charges.TotalTaxChargesPaise

		items = append(items, dto.ContractNoteItem{
			TradeUUID:          t.UUID.String(),
			OrderUUID:          t.OrderUUID.String(),
			Symbol:             t.Symbol,
			Side:               t.Side,
			Product:            t.Product,
			Quantity:           t.Quantity,
			PricePaise:         t.PricePaise,
			GrossTotalPaise:    t.TotalPaise,
			Charges:            charges,
			NetObligationPaise: netObligation,
			ExecutedAt:         t.ExecutedAt.UTC().Format("15:04:05"),
		})
	}

	grossTurnover := totalBuyTurnover + totalSellTurnover
	// Net payin/payout: Sell proceeds minus Buy investments minus all statutory charges
	netPayinPayout := totalSellTurnover - totalBuyTurnover - chargesSummary.TotalTaxChargesPaise

	return &dto.ContractNoteResponse{
		ContractNoteNumber:     contractNoteNo,
		TradeDate:              dateFormatted,
		SettlementDate:         settlementDate,
		Exchange:               "NSE / NFO",
		ClientName:             clientName,
		ClientEmail:            user.Email,
		ClientUUID:             userUUID.String(),
		TotalTrades:            len(items),
		TotalBuyTurnoverPaise:  totalBuyTurnover,
		TotalSellTurnoverPaise: totalSellTurnover,
		GrossTurnoverPaise:     grossTurnover,
		ChargesSummary:         chargesSummary,
		NetPayinPayoutPaise:    netPayinPayout,
		Items:                  items,
	}, nil
}

func (s *ReportsService) GetLedgerStatement(userID, fromStr, toStr string) (*dto.LedgerStatementResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}

	var fromDate, toDate time.Time
	now := time.Now().UTC()

	if strings.TrimSpace(fromStr) != "" {
		if p, err := time.Parse("2006-01-02", fromStr); err == nil {
			fromDate = p
		}
	}
	if fromDate.IsZero() {
		// Default to start of current month or 30 days prior
		fromDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	}

	if strings.TrimSpace(toStr) != "" {
		if p, err := time.Parse("2006-01-02", toStr); err == nil {
			toDate = p.Add(24 * time.Hour) // inclusive
		}
	}
	if toDate.IsZero() {
		toDate = now.Add(24 * time.Hour)
	}

	db := database.GetDB()
	var wallet model.Wallet
	var txs []model.WalletTransaction

	if db != nil {
		_ = db.Where("user_uuid = ?", userUUID).First(&wallet).Error
		_ = db.Where("wallet_uuid = ?", wallet.UUID).Order("created_at ASC").Find(&txs).Error
	}

	// Double-entry ledger calculation
	var openingBalance int64 = 0
	var runningBalance int64 = 0
	var totalDebits int64 = 0
	var totalCredits int64 = 0
	var entries []dto.LedgerEntry

	for _, t := range txs {
		isBeforePeriod := t.CreatedAt.Before(fromDate)
		isInPeriod := (t.CreatedAt.Equal(fromDate) || t.CreatedAt.After(fromDate)) && t.CreatedAt.Before(toDate)

		var debit int64 = 0
		var credit int64 = 0

		switch t.Type {
		case model.WalletTransactionInitialCredit, "CREDIT", "TOP_UP":
			credit = t.AmountPaise
			runningBalance += t.AmountPaise
		case model.WalletTransactionReset:
			credit = t.AmountPaise
			runningBalance = t.AmountPaise
		case "DEBIT", "BUY", "ORDER_BUY":
			debit = t.AmountPaise
			runningBalance -= t.AmountPaise
		case "SELL", "ORDER_SELL":
			credit = t.AmountPaise
			runningBalance += t.AmountPaise
		case "RESERVE":
			// Margin block
			narration := t.Note
			if narration == "" {
				narration = "Margin Blocked for Active Order"
			}
		default:
			if t.AmountPaise > 0 {
				credit = t.AmountPaise
				runningBalance += t.AmountPaise
			} else if t.AmountPaise < 0 {
				debit = -t.AmountPaise
				runningBalance -= debit
			}
		}

		if isBeforePeriod {
			openingBalance = runningBalance
			continue
		}

		if isInPeriod {
			totalDebits += debit
			totalCredits += credit

			narration := t.Note
			if narration == "" {
				narration = fmt.Sprintf("Wallet Transaction [%s]", t.Type)
			}

			entryType := "CREDIT"
			if debit > 0 {
				entryType = "DEBIT"
			}

			entries = append(entries, dto.LedgerEntry{
				UUID:         t.UUID.String(),
				Date:         t.CreatedAt.UTC().Format("2006-01-02 15:04:05"),
				Type:         entryType,
				Narration:    narration,
				DebitPaise:   debit,
				CreditPaise:  credit,
				BalancePaise: runningBalance,
			})
		}
	}

	closingBalance := runningBalance
	if len(entries) == 0 && wallet.CashBalancePaise > 0 {
		closingBalance = wallet.CashBalancePaise
		openingBalance = wallet.CashBalancePaise
	}

	return &dto.LedgerStatementResponse{
		PeriodFrom:          fromDate.Format("2006-01-02"),
		PeriodTo:            toDate.Add(-24 * time.Hour).Format("2006-01-02"),
		OpeningBalancePaise: openingBalance,
		ClosingBalancePaise: closingBalance,
		TotalDebitPaise:     totalDebits,
		TotalCreditPaise:    totalCredits,
		TotalEntries:        len(entries),
		Entries:             entries,
	}, nil
}
