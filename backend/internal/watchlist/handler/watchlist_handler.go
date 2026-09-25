package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct{}

func New() *Handler                            { return &Handler{} }
func userID(c *gin.Context) (uuid.UUID, error) { return uuid.Parse(c.GetString("user_id")) }

func (h *Handler) List(c *gin.Context) {
	userUUID, err := userID(c)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid user identity", nil)
		return
	}
	var items []model.WatchlistItem
	if err := database.GetDB().Where("user_uuid = ?", userUUID).Order("symbol ASC").Find(&items).Error; err != nil {
		response.Error(c, http.StatusServiceUnavailable, "Watchlist unavailable", nil)
		return
	}
	response.Success(c, http.StatusOK, "Watchlist retrieved", items)
}
const MaxWatchlistItems = 50

func isCanonicalSymbol(symbol string) bool {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	if clean == "" {
		return false
	}
	canonical := alias.ResolveCanonicalSymbol(clean)
	db := database.GetDB()
	if db != nil {
		var count int64
		err := db.Model(&model.Instrument{}).
			Where("UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(name) = ?", clean, clean+"-EQ", clean).
			Count(&count).Error
		if err == nil && count > 0 {
			return true
		}
		if canonical != "" && canonical != clean {
			err = db.Model(&model.Instrument{}).
				Where("UPPER(symbol) = ? OR UPPER(symbol) = ?", canonical, canonical+"-EQ").
				Count(&count).Error
			if err == nil && count > 0 {
				return true
			}
		}
	}

	for _, inst := range instrumentService.DefaultCanonicalInstruments {
		if strings.EqualFold(inst.Symbol, clean) || strings.EqualFold(inst.Symbol, clean+"-EQ") {
			return true
		}
		if canonical != "" && strings.EqualFold(inst.Symbol, canonical) {
			return true
		}
	}
	return false
}

func (h *Handler) Add(c *gin.Context) {
	userUUID, err := userID(c)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid user identity", nil)
		return
	}
	var body struct {
		Symbol string `json:"symbol" binding:"required,max=80"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid watchlist item", err.Error())
		return
	}
	cleanSymbol := strings.ToUpper(strings.TrimSpace(body.Symbol))
	if cleanSymbol == "" {
		response.Error(c, http.StatusBadRequest, "symbol is required", nil)
		return
	}

	if !isCanonicalSymbol(cleanSymbol) {
		response.Error(c, http.StatusNotFound, fmt.Sprintf("Instrument %q not found in canonical master", cleanSymbol), "INSTRUMENT_NOT_FOUND")
		return
	}

	db := database.GetDB()
	if db == nil {
		response.Error(c, http.StatusServiceUnavailable, "database not connected", nil)
		return
	}

	var currentCount int64
	if err := db.Model(&model.WatchlistItem{}).Where("user_uuid = ?", userUUID).Count(&currentCount).Error; err == nil {
		if currentCount >= MaxWatchlistItems {
			response.Error(c, http.StatusBadRequest, fmt.Sprintf("Watchlist limit reached (max %d items)", MaxWatchlistItems), "WATCHLIST_LIMIT_EXCEEDED")
			return
		}
	}

	item := model.WatchlistItem{UserUUID: userUUID, Symbol: cleanSymbol}
	if err := db.Create(&item).Error; err != nil {
		response.Error(c, http.StatusConflict, "Symbol is already in watchlist", nil)
		return
	}
	response.Success(c, http.StatusCreated, "Watchlist item added", item)
}
func (h *Handler) Remove(c *gin.Context) {
	userUUID, err := userID(c)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid user identity", nil)
		return
	}
	symbol := strings.ToUpper(strings.TrimSpace(c.Param("symbol")))
	result := database.GetDB().Where("user_uuid = ? AND symbol = ?", userUUID, symbol).Delete(&model.WatchlistItem{})
	if result.Error != nil || result.RowsAffected == 0 {
		response.Error(c, http.StatusNotFound, fmt.Sprintf("%s is not in watchlist", symbol), nil)
		return
	}
	response.Success(c, http.StatusOK, "Watchlist item removed", nil)
}
