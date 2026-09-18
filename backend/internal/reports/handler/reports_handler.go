package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/reports/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type ReportsHandler struct {
	service *service.ReportsService
}

func New() *ReportsHandler {
	return &ReportsHandler{
		service: service.New(),
	}
}

func (h *ReportsHandler) GetContractNote(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		response.Error(c, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	date := c.Query("date")
	report, err := h.service.GetContractNote(userID, date)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to generate contract note", err.Error())
		return
	}

	response.Success(c, http.StatusOK, "Contract note generated successfully", report)
}

func (h *ReportsHandler) GetLedgerStatement(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		response.Error(c, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	from := c.Query("from")
	to := c.Query("to")
	statement, err := h.service.GetLedgerStatement(userID, from, to)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to generate ledger statement", err.Error())
		return
	}

	response.Success(c, http.StatusOK, "Ledger statement generated successfully", statement)
}
