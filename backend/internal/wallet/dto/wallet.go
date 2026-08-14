package dto

type WalletResponse struct {
	UUID                  string `json:"uuid"`
	CashBalancePaise      int64  `json:"cash_balance_paise"`
	AvailableBalancePaise int64  `json:"available_balance_paise"`
	BlockedPaise          int64  `json:"blocked_paise"`
}

type TransactionResponse struct {
	UUID         string `json:"uuid"`
	Type         string `json:"type"`
	AmountPaise  int64  `json:"amount_paise"`
	BalancePaise int64  `json:"balance_paise"`
	BlockedPaise int64  `json:"blocked_paise"`
	Note         string `json:"note"`
	CreatedAt    string `json:"created_at"`
}
