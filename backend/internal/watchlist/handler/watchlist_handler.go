package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
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
	item := model.WatchlistItem{UserUUID: userUUID, Symbol: strings.ToUpper(strings.TrimSpace(body.Symbol))}
	if item.Symbol == "" {
		response.Error(c, http.StatusBadRequest, "symbol is required", nil)
		return
	}
	if err := database.GetDB().Create(&item).Error; err != nil {
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
