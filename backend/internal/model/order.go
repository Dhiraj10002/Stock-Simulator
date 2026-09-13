package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	OrderSideBuy  = "BUY"
	OrderSideSell = "SELL"

	OrderTypeMarket = "MARKET"
	OrderTypeLimit  = "LIMIT"

	OrderProductIntraday = "INTRADAY"
	OrderProductDelivery = "DELIVERY"
	OrderProductFNO      = "FNO"

	OrderStatusPending   = "PENDING"
	OrderStatusOpen      = "OPEN"
	OrderStatusExecuted  = "EXECUTED"
	OrderStatusCancelled = "CANCELLED"
	OrderStatusRejected  = "REJECTED"

	OrderSourceUser         = "USER"
	OrderSourceSystem       = "SYSTEM"
	OrderReasonMISSquareOff = "MIS_SQUARE_OFF"
	OrderReasonFNOExpiry    = "FNO_EXPIRY_SETTLEMENT"
)

type Order struct {
	ID         uint      `gorm:"primaryKey"`
	UUID       uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserUUID   uuid.UUID `gorm:"type:uuid;index;not null"`
	Symbol     string    `gorm:"size:30;index;not null"`
	Side       string    `gorm:"size:10;not null"`
	Type       string    `gorm:"size:10;not null"`
	Product    string    `gorm:"size:15;not null"`
	Quantity   int64     `gorm:"not null"`
	PricePaise int64     `gorm:"not null;default:0"`
	// ExecutedPricePaise is the server-authoritative fill price. PricePaise
	// remains the original limit price (or zero for a market order).
	ExecutedPricePaise int64  `gorm:"not null;default:0"`
	ReservedPaise      int64  `gorm:"not null;default:0"`
	Source             string `gorm:"size:16;not null;default:'USER'"`
	Reason             string `gorm:"size:40"`
	Status             string `gorm:"size:20;index;not null"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
