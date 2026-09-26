package service

import (
	"fmt"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/reports/dto"
	"github.com/google/uuid"
)

type ReportsService struct{}

func New() *ReportsService {
	return &ReportsService{}
}

func getISTLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		return time.UTC
	}
	return loc
}

func (s *ReportsService) GetContractNote(userID, dateStr string) (*dto.ContractNoteResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}

	ist := getISTLocation()
	tradeDate := time.Now().In(ist)
	if strings.TrimSpace(dateStr) != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			tradeDate = time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, ist)
		}
	}

	startOfDay := time.Date(tradeDate.Year(), tradeDate.Month(), tradeDate.Day(), 0, 0, 0, 0, ist)
	endOfDay := startOfDay.Add(24 * time.Hour)

	db := database.GetDB()
	var user model.User
	var trades []model.Trade

	if db != nil {
		_ = db.Where("uuid = ?", userUUID).First(&user).Error
		_ = db.Where("user_uuid = ? AND executed_at >= ? AND executed_at < ?", userUUID, startOfDay.UTC(), endOfDay.UTC()).
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
		clientName = user.Email
	}
	if clientName == "" {
		clientName = "Simulated Client"
	}

	items := make([]dto.ContractNoteItem, 0, len(trades))
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
			ExecutedAt:         t.ExecutedAt.In(ist).Format("15:04:05"),
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

	ist := getISTLocation()
	now := time.Now().In(ist)

	var fromDate, toDate time.Time
	if strings.TrimSpace(fromStr) != "" {
		if p, err := time.Parse("2006-01-02", fromStr); err == nil {
			fromDate = time.Date(p.Year(), p.Month(), p.Day(), 0, 0, 0, 0, ist)
		}
	}
	if fromDate.IsZero() {
		// Default to start of current month
		fromDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, ist)
	}

	if strings.TrimSpace(toStr) != "" {
		if p, err := time.Parse("2006-01-02", toStr); err == nil {
			toDate = time.Date(p.Year(), p.Month(), p.Day(), 0, 0, 0, 0, ist).Add(24 * time.Hour) // inclusive
		}
	}
	if toDate.IsZero() {
		toDate = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, ist).Add(24 * time.Hour)
	}

	fromDateUTC := fromDate.UTC()
	toDateUTC := toDate.UTC()

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
	entries := make([]dto.LedgerEntry, 0)

	for _, t := range txs {
		isBeforePeriod := t.CreatedAt.Before(fromDateUTC)
		isInPeriod := (t.CreatedAt.Equal(fromDateUTC) || t.CreatedAt.After(fromDateUTC)) && t.CreatedAt.Before(toDateUTC)

		var debit int64 = 0
		var credit int64 = 0

		switch t.Type {
		case model.WalletTransactionInitialCredit, "CREDIT", "TOP_UP":
			credit = t.AmountPaise
			if credit < 0 {
				credit = -credit
			}
			runningBalance += credit
		case model.WalletTransactionReset:
			if t.BalancePaise > 0 {
				if t.BalancePaise >= runningBalance {
					credit = t.BalancePaise - runningBalance
				} else {
					debit = runningBalance - t.BalancePaise
				}
				runningBalance = t.BalancePaise
			} else {
				credit = t.AmountPaise
				runningBalance = t.AmountPaise
			}
		case model.WalletTransactionDebit, "BUY", "ORDER_BUY":
			debit = t.AmountPaise
			if debit < 0 {
				debit = -debit
			}
			runningBalance -= debit
		case "SELL", "ORDER_SELL":
			credit = t.AmountPaise
			if credit < 0 {
				credit = -credit
			}
			runningBalance += credit
		case model.WalletTransactionReserve, model.WalletTransactionRelease:
			// Margin block/release operations do not alter ledger cash funds.
			continue
		default:
			if t.AmountPaise > 0 {
				credit = t.AmountPaise
				runningBalance += credit
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
				Date:         t.CreatedAt.In(ist).Format("2006-01-02 15:04:05"),
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
