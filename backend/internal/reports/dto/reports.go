package dto

type ChargesBreakdown struct {
	BrokeragePaise       int64 `json:"brokerage_paise"`
	SttPaise             int64 `json:"stt_paise"`
	ExchangeTxnPaise     int64 `json:"exchange_txn_paise"`
	SebiChargesPaise     int64 `json:"sebi_charges_paise"`
	StampDutyPaise       int64 `json:"stamp_duty_paise"`
	GstPaise             int64 `json:"gst_paise"`
	TotalTaxChargesPaise int64 `json:"total_tax_charges_paise"`
}

type ContractNoteItem struct {
	TradeUUID          string           `json:"trade_uuid"`
	OrderUUID          string           `json:"order_uuid"`
	Symbol             string           `json:"symbol"`
	Side               string           `json:"side"`    // BUY / SELL
	Product            string           `json:"product"` // DELIVERY / INTRADAY / FNO
	Quantity           int64            `json:"quantity"`
	PricePaise         int64            `json:"price_paise"`
	GrossTotalPaise    int64            `json:"gross_total_paise"`
	Charges            ChargesBreakdown `json:"charges"`
	NetObligationPaise int64            `json:"net_obligation_paise"` // Amount to debit or credit
	ExecutedAt         string           `json:"executed_at"`
}

type ContractNoteResponse struct {
	ContractNoteNumber     string             `json:"contract_note_number"`
	TradeDate              string             `json:"trade_date"`
	SettlementDate         string             `json:"settlement_date"`
	Exchange               string             `json:"exchange"` // NSE / NFO
	ClientName             string             `json:"client_name"`
	ClientEmail            string             `json:"client_email"`
	ClientUUID             string             `json:"client_uuid"`
	TotalTrades            int                `json:"total_trades"`
	TotalBuyTurnoverPaise  int64              `json:"total_buy_turnover_paise"`
	TotalSellTurnoverPaise int64              `json:"total_sell_turnover_paise"`
	GrossTurnoverPaise     int64              `json:"gross_turnover_paise"`
	ChargesSummary         ChargesBreakdown   `json:"charges_summary"`
	NetPayinPayoutPaise    int64              `json:"net_payin_payout_paise"` // Positive: Credit (Payout to client), Negative: Debit (Payin due)
	Items                  []ContractNoteItem `json:"items"`
}

type LedgerEntry struct {
	UUID         string `json:"uuid"`
	Date         string `json:"date"`
	Type         string `json:"type"` // CREDIT / DEBIT
	Narration    string `json:"narration"`
	DebitPaise   int64  `json:"debit_paise"`  // 0 if Credit
	CreditPaise  int64  `json:"credit_paise"` // 0 if Debit
	BalancePaise int64  `json:"balance_paise"`
}

type LedgerStatementResponse struct {
	PeriodFrom          string        `json:"period_from"`
	PeriodTo            string        `json:"period_to"`
	OpeningBalancePaise int64         `json:"opening_balance_paise"`
	ClosingBalancePaise int64         `json:"closing_balance_paise"`
	TotalDebitPaise     int64         `json:"total_debit_paise"`
	TotalCreditPaise    int64         `json:"total_credit_paise"`
	TotalEntries        int           `json:"total_entries"`
	Entries             []LedgerEntry `json:"entries"`
}
