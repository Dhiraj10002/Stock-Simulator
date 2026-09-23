package product

import (
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

// ContractSpec defines authoritative trading specifications for an F&O underlying.
type ContractSpec struct {
	UnderlyingSymbol string
	LotSize          int64
	StrikeStep       int64
	TickSize         string
	DefaultSpotPaise int64
}

// StandardContractSpecs defines authoritative contract specifications matching
// Indian exchange standards (NSE/BSE).
var StandardContractSpecs = map[string]ContractSpec{
	"NIFTY":      {UnderlyingSymbol: "NIFTY", LotSize: 25, StrikeStep: 50, TickSize: "0.05", DefaultSpotPaise: 2532000},
	"BANKNIFTY":  {UnderlyingSymbol: "BANKNIFTY", LotSize: 15, StrikeStep: 100, TickSize: "0.05", DefaultSpotPaise: 5215000},
	"FINNIFTY":   {UnderlyingSymbol: "FINNIFTY", LotSize: 25, StrikeStep: 50, TickSize: "0.05", DefaultSpotPaise: 2350000},
	"MIDCPNIFTY": {UnderlyingSymbol: "MIDCPNIFTY", LotSize: 50, StrikeStep: 25, TickSize: "0.05", DefaultSpotPaise: 1250000},
	"SENSEX":     {UnderlyingSymbol: "SENSEX", LotSize: 10, StrikeStep: 100, TickSize: "0.05", DefaultSpotPaise: 8150000},
	"RELIANCE":   {UnderlyingSymbol: "RELIANCE", LotSize: 250, StrikeStep: 20, TickSize: "0.05", DefaultSpotPaise: 124400},
	"TCS":        {UnderlyingSymbol: "TCS", LotSize: 175, StrikeStep: 50, TickSize: "0.05", DefaultSpotPaise: 219000},
	"INFY":       {UnderlyingSymbol: "INFY", LotSize: 400, StrikeStep: 20, TickSize: "0.05", DefaultSpotPaise: 105800},
	"HDFCBANK":   {UnderlyingSymbol: "HDFCBANK", LotSize: 550, StrikeStep: 20, TickSize: "0.05", DefaultSpotPaise: 71300},
	"TATAMOTORS": {UnderlyingSymbol: "TATAMOTORS", LotSize: 575, StrikeStep: 10, TickSize: "0.05", DefaultSpotPaise: 98000},
	"SBIN":       {UnderlyingSymbol: "SBIN", LotSize: 750, StrikeStep: 10, TickSize: "0.05", DefaultSpotPaise: 81000},
}

// GetContractSpec retrieves the authoritative contract spec for an underlying symbol.
func GetContractSpec(symbol string) (ContractSpec, bool) {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	spec, ok := StandardContractSpecs[clean]
	return spec, ok
}

// ResolveContractLotSize resolves the authoritative lot size for a contract.
// If an instrument record from the database is available with a positive lot size,
// its lot size takes precedence. Otherwise, the standard spec lot size is used,
// falling back to 1 for standard equity.
func ResolveContractLotSize(symbol string, inst *model.Instrument) int64 {
	if inst != nil && inst.LotSize > 0 {
		return inst.LotSize
	}
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	if spec, ok := StandardContractSpecs[clean]; ok && spec.LotSize > 0 {
		return spec.LotSize
	}
	return 1
}
