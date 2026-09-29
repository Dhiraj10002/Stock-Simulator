package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Discrepancy struct {
	Category    string `json:"category"`
	Severity    string `json:"severity"` // "CRITICAL", "WARNING", "INFO"
	EntityID    string `json:"entity_id"`
	UserUUID    string `json:"user_uuid"`
	Description string `json:"description"`
	Expected    any    `json:"expected"`
	Actual      any    `json:"actual"`
}

type AuditReport struct {
	GeneratedAt            string        `json:"generated_at"`
	TotalUsers             int64         `json:"total_users"`
	TotalWallets           int64         `json:"total_wallets"`
	TotalOrders            int64         `json:"total_orders"`
	TotalTrades            int64         `json:"total_trades"`
	TotalPositions         int64         `json:"total_positions"`
	TotalLedgerEntries     int64         `json:"total_ledger_entries"`
	TotalDiscrepancies     int           `json:"total_discrepancies"`
	Discrepancies          []Discrepancy `json:"discrepancies"`
	DiscrepanciesByCategory map[string]int `json:"discrepancies_by_category"`
}

func main() {
	jsonFlag := flag.Bool("json", false, "Output report as JSON")
	userFilter := flag.String("user", "", "Optional User UUID to filter reconciliation")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	if err := database.Connect(cfg); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	db := database.GetDB()
	report := runAudit(db, *userFilter)

	if *jsonFlag {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(report); err != nil {
			log.Fatalf("Failed to encode report: %v", err)
		}
		return
	}

	printHumanReport(report)
}

func runAudit(db *gorm.DB, userFilter string) AuditReport {
	report := AuditReport{
		GeneratedAt:             fmt.Sprintf("%v", db.NowFunc()),
		DiscrepanciesByCategory: make(map[string]int),
	}

	if !db.Migrator().HasTable(&model.User{}) || !db.Migrator().HasTable(&model.Order{}) || !db.Migrator().HasTable(&model.Wallet{}) {
		return report
	}

	userQuery := db.Model(&model.User{})
	orderQuery := db.Model(&model.Order{})
	tradeQuery := db.Model(&model.Trade{})
	positionQuery := db.Model(&model.Position{})
	walletQuery := db.Model(&model.Wallet{})
	ledgerQuery := db.Model(&model.WalletTransaction{})

	if userFilter != "" {
		parsed, err := uuid.Parse(userFilter)
		if err == nil {
			userQuery = userQuery.Where("uuid = ?", parsed)
			orderQuery = orderQuery.Where("user_uuid = ?", parsed)
			tradeQuery = tradeQuery.Where("user_uuid = ?", parsed)
			positionQuery = positionQuery.Where("user_uuid = ?", parsed)
			walletQuery = walletQuery.Where("user_uuid = ?", parsed)
		}
	}

	userQuery.Count(&report.TotalUsers)
	orderQuery.Count(&report.TotalOrders)
	tradeQuery.Count(&report.TotalTrades)
	positionQuery.Count(&report.TotalPositions)
	walletQuery.Count(&report.TotalWallets)
	ledgerQuery.Count(&report.TotalLedgerEntries)

	var addDiscrepancy = func(d Discrepancy) {
		report.Discrepancies = append(report.Discrepancies, d)
		report.DiscrepanciesByCategory[d.Category]++
	}

	// -------------------------------------------------------------
	// 1. Audit Check: Order vs Trade Reconciliation
	// -------------------------------------------------------------
	var executedOrders []model.Order
	ordFind := db.Where("status = ?", model.OrderStatusExecuted)
	if userFilter != "" {
		ordFind = ordFind.Where("user_uuid = ?", userFilter)
	}
	ordFind.Find(&executedOrders)

	for _, ord := range executedOrders {
		var trade model.Trade
		if err := db.Where("order_uuid = ?", ord.UUID).First(&trade).Error; err != nil {
			addDiscrepancy(Discrepancy{
				Category:    "ORDER_WITHOUT_TRADE",
				Severity:    "CRITICAL",
				EntityID:    ord.UUID.String(),
				UserUUID:    ord.UserUUID.String(),
				Description: fmt.Sprintf("Executed order %s has no corresponding trade record", ord.UUID),
				Expected:    "1 Trade Record",
				Actual:      "0 Records",
			})
			continue
		}

		if trade.Quantity != ord.Quantity {
			addDiscrepancy(Discrepancy{
				Category:    "ORDER_TRADE_QUANTITY_MISMATCH",
				Severity:    "CRITICAL",
				EntityID:    ord.UUID.String(),
				UserUUID:    ord.UserUUID.String(),
				Description: fmt.Sprintf("Order quantity (%d) does not match trade quantity (%d)", ord.Quantity, trade.Quantity),
				Expected:    ord.Quantity,
				Actual:      trade.Quantity,
			})
		}

		if ord.ExecutedPricePaise > 0 && trade.PricePaise != ord.ExecutedPricePaise {
			addDiscrepancy(Discrepancy{
				Category:    "ORDER_TRADE_PRICE_MISMATCH",
				Severity:    "CRITICAL",
				EntityID:    ord.UUID.String(),
				UserUUID:    ord.UserUUID.String(),
				Description: fmt.Sprintf("Order executed price (%d) does not match trade price (%d)", ord.ExecutedPricePaise, trade.PricePaise),
				Expected:    ord.ExecutedPricePaise,
				Actual:      trade.PricePaise,
			})
		}

		expectedTotal := trade.Quantity * trade.PricePaise
		if trade.TotalPaise != expectedTotal {
			addDiscrepancy(Discrepancy{
				Category:    "TRADE_TOTAL_CALCULATION_MISMATCH",
				Severity:    "WARNING",
				EntityID:    trade.UUID.String(),
				UserUUID:    trade.UserUUID.String(),
				Description: fmt.Sprintf("Trade total (%d) does not equal quantity * price (%d)", trade.TotalPaise, expectedTotal),
				Expected:    expectedTotal,
				Actual:      trade.TotalPaise,
			})
		}
	}

	// -------------------------------------------------------------
	// 2. Audit Check: Wallet Cash & Ledger Continuity
	// -------------------------------------------------------------
	var wallets []model.Wallet
	walFind := db.Model(&model.Wallet{})
	if userFilter != "" {
		walFind = walFind.Where("user_uuid = ?", userFilter)
	}
	walFind.Find(&wallets)

	for _, wal := range wallets {
		if wal.BlockedPaise < 0 {
			addDiscrepancy(Discrepancy{
				Category:    "NEGATIVE_BLOCKED_BALANCE",
				Severity:    "CRITICAL",
				EntityID:    wal.UUID.String(),
				UserUUID:    wal.UserUUID.String(),
				Description: fmt.Sprintf("Wallet blocked balance is negative: %d", wal.BlockedPaise),
				Expected:    ">= 0",
				Actual:      wal.BlockedPaise,
			})
		}
		if wal.BlockedPaise > wal.CashBalancePaise && wal.CashBalancePaise >= 0 {
			addDiscrepancy(Discrepancy{
				Category:    "BLOCKED_EXCEEDS_CASH",
				Severity:    "CRITICAL",
				EntityID:    wal.UUID.String(),
				UserUUID:    wal.UserUUID.String(),
				Description: fmt.Sprintf("Wallet blocked balance (%d) exceeds cash balance (%d)", wal.BlockedPaise, wal.CashBalancePaise),
				Expected:    fmt.Sprintf("<= %d", wal.CashBalancePaise),
				Actual:      wal.BlockedPaise,
			})
		}

		// Compute ledger continuity from transactions
		var txs []model.WalletTransaction
		db.Where("wallet_uuid = ?", wal.UUID).Order("created_at ASC, id ASC").Find(&txs)

		var computedCash int64 = 0
		hasBaseline := false

		for _, tx := range txs {
			amt := tx.AmountPaise
			if amt < 0 {
				amt = -amt
			}
			switch tx.Type {
			case model.WalletTransactionInitialCredit, "CREDIT", "TOP_UP":
				computedCash += amt
				hasBaseline = true
			case model.WalletTransactionReset:
				if tx.BalancePaise > 0 {
					computedCash = tx.BalancePaise
				} else {
					computedCash = amt
				}
				hasBaseline = true
			case model.WalletTransactionDebit, "BUY", "ORDER_BUY":
				computedCash -= amt
				hasBaseline = true
			case "SELL", "ORDER_SELL":
				computedCash += amt
				hasBaseline = true
			case model.WalletTransactionReserve, model.WalletTransactionRelease:
				// Locks do not alter cash balance
			default:
				if tx.AmountPaise > 0 {
					computedCash += tx.AmountPaise
				} else if tx.AmountPaise < 0 {
					computedCash -= -tx.AmountPaise
				}
			}
		}

		if hasBaseline && computedCash != wal.CashBalancePaise {
			addDiscrepancy(Discrepancy{
				Category:    "LEDGER_CASH_DESYNC",
				Severity:    "WARNING",
				EntityID:    wal.UUID.String(),
				UserUUID:    wal.UserUUID.String(),
				Description: fmt.Sprintf("Computed cash from wallet transactions (%d) does not match wallet cash (%d)", computedCash, wal.CashBalancePaise),
				Expected:    computedCash,
				Actual:      wal.CashBalancePaise,
			})
		}
	}

	// -------------------------------------------------------------
	// 3. Audit Check: Position Net Quantity vs Trades
	// -------------------------------------------------------------
	var positions []model.Position
	posFind := db.Model(&model.Position{})
	if userFilter != "" {
		posFind = posFind.Where("user_uuid = ?", userFilter)
	}
	posFind.Find(&positions)

	for _, pos := range positions {
		var trades []model.Trade
		db.Where("user_uuid = ? AND symbol = ? AND product = ?", pos.UserUUID, pos.Symbol, pos.Product).Find(&trades)

		var netTradeQty int64 = 0
		for _, tr := range trades {
			if tr.Side == model.OrderSideBuy {
				netTradeQty += tr.Quantity
			} else if tr.Side == model.OrderSideSell {
				netTradeQty -= tr.Quantity
			}
		}

		if len(trades) > 0 && netTradeQty != pos.Quantity {
			addDiscrepancy(Discrepancy{
				Category:    "POSITION_TRADE_QUANTITY_DESYNC",
				Severity:    "WARNING",
				EntityID:    pos.UUID.String(),
				UserUUID:    pos.UserUUID.String(),
				Description: fmt.Sprintf("Position %s (%s) quantity (%d) does not match net trade history sum (%d)", pos.Symbol, pos.Product, pos.Quantity, netTradeQty),
				Expected:    netTradeQty,
				Actual:      pos.Quantity,
			})
		}
	}

	// -------------------------------------------------------------
	// 4. Audit Check: Active Orders Reserved Balance Leak
	// -------------------------------------------------------------
	for _, wal := range wallets {
		var activeOrders []model.Order
		db.Where("user_uuid = ? AND status IN (?)", wal.UserUUID, []string{model.OrderStatusOpen, model.OrderStatusPending, model.OrderStatusTriggerPending}).Find(&activeOrders)

		var totalReserved int64 = 0
		for _, ord := range activeOrders {
			totalReserved += ord.ReservedPaise
		}

		var userPositions []model.Position
		db.Where("user_uuid = ?", wal.UserUUID).Find(&userPositions)
		var totalMarginBlocked int64 = 0
		for _, pos := range userPositions {
			totalMarginBlocked += pos.MarginBlockedPaise
		}

		expectedBlocked := totalReserved + totalMarginBlocked
		if wal.BlockedPaise != expectedBlocked {
			addDiscrepancy(Discrepancy{
				Category:    "BLOCKED_BALANCE_MISMATCH",
				Severity:    "WARNING",
				EntityID:    wal.UUID.String(),
				UserUUID:    wal.UserUUID.String(),
				Description: fmt.Sprintf("Wallet blocked balance (%d) does not match active orders reservation (%d) + position margin (%d)", wal.BlockedPaise, totalReserved, totalMarginBlocked),
				Expected:    expectedBlocked,
				Actual:      wal.BlockedPaise,
			})
		}
	}

	report.TotalDiscrepancies = len(report.Discrepancies)
	return report
}

func printHumanReport(r AuditReport) {
	fmt.Println("================================================================================")
	fmt.Println("             STOCK SIMULATOR - HISTORICAL RECONCILIATION AUDIT REPORT           ")
	fmt.Println("                                (READ ONLY)                                     ")
	fmt.Println("================================================================================")
	fmt.Printf("Generated At:            %s\n", r.GeneratedAt)
	fmt.Printf("Total Users Scanned:     %d\n", r.TotalUsers)
	fmt.Printf("Total Wallets Scanned:   %d\n", r.TotalWallets)
	fmt.Printf("Total Orders Scanned:    %d\n", r.TotalOrders)
	fmt.Printf("Total Trades Scanned:    %d\n", r.TotalTrades)
	fmt.Printf("Total Positions Scanned: %d\n", r.TotalPositions)
	fmt.Printf("Total Ledger Entries:    %d\n", r.TotalLedgerEntries)
	fmt.Println("--------------------------------------------------------------------------------")
	fmt.Printf("Total Discrepancies Found: %d\n", r.TotalDiscrepancies)

	if len(r.DiscrepanciesByCategory) > 0 {
		fmt.Println("\nDiscrepancies by Category:")
		for cat, count := range r.DiscrepanciesByCategory {
			fmt.Printf("  • %-35s : %d\n", cat, count)
		}
	}

	if r.TotalDiscrepancies == 0 {
		fmt.Println("\nResult: PERFECT INTEGRITY. No reconciliation or accounting anomalies detected.")
		fmt.Println("================================================================================")
		return
	}

	fmt.Println("\nDetailed Discrepancies:")
	for i, d := range r.Discrepancies {
		fmt.Printf("\n[%d] [%s] %s (Entity: %s, User: %s)\n", i+1, d.Severity, d.Category, d.EntityID, d.UserUUID)
		fmt.Printf("    Description: %s\n", d.Description)
		fmt.Printf("    Expected:    %v\n", d.Expected)
		fmt.Printf("    Actual:      %v\n", d.Actual)
	}
	fmt.Println("\n================================================================================")
	fmt.Println("NOTICE: This audit report is strictly read-only. No records were modified.")
	fmt.Println("================================================================================")
}
