package handler

import (
	"net/http"
	"strconv"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/news/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type NewsHandler struct{ service *service.NewsService }

func New(redisURL string) (*NewsHandler, error) {
	newsService, err := service.New(redisURL)
	if err != nil {
		return nil, err
	}
	return &NewsHandler{service: newsService}, nil
}

func (h *NewsHandler) List(c *gin.Context) {
	limit := 20
	if rawLimit := c.Query("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil {
			response.Error(c, http.StatusBadRequest, "limit must be a number", nil)
			return
		}
		limit = parsed
	}
	articles, err := h.service.List(c.Query("symbol"), limit)
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "News retrieved successfully", articles)
}
