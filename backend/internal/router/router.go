package router

import (
	aiHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/handler"
	authHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/handler"
	authMiddleware "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/middleware"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/handler"
	marketHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/handler"
	marketWebsocket "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/websocket"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/middleware"
	newsHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/news/handler"
	orderHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/handler"
	portfolioHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/handler"
	tradeHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/trade/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/validation"
	walletHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/wallet/handler"

	"github.com/gin-gonic/gin"
)

func Setup(cfg *config.Config) *gin.Engine {

	validation.Register()

	r := gin.New()
	_ = r.SetTrustedProxies(nil)
	r.Use(
		middleware.Recovery(),
		middleware.RequestID(),
		middleware.RequestLogger(),
		middleware.CORS(cfg.CORSAllowedOrigins),
	)

	healthHandler := handler.NewHealthHandler()
	auth := authHandler.New(cfg)
	wallet := walletHandler.New(cfg)
	portfolio := portfolioHandler.New()
	market, err := marketHandler.New(cfg.RedisURL)
	if err != nil {
		panic(err)
	}
	orders := orderHandler.New(market.Service())
	marketWS := marketWebsocket.New(market.Service())
	trades := tradeHandler.New()
	mentor := aiHandler.New(cfg)
	news, err := newsHandler.New(cfg.RedisURL)
	if err != nil {
		panic(err)
	}

	api := r.Group("/api/v1")
	r.GET("/ws/market", marketWS.Serve)
	{
		api.GET("/health", healthHandler.Health)
		api.GET("/market/quotes/:symbol", market.Quote)
		api.GET("/market/quotes/:symbol/history", market.History)
		api.GET("/news", news.List)

		api.POST("/auth/register", auth.Register)
		api.POST("/auth/login", auth.Login)
		api.POST("/auth/refresh", auth.Refresh)
		api.POST("/auth/logout", auth.Logout)
		api.GET("/auth/me", authMiddleware.Authenticate(cfg.JWTSecret), auth.Me)
		protected := api.Group("", authMiddleware.Authenticate(cfg.JWTSecret))
		protected.GET("/wallet", wallet.Get)
		protected.GET("/wallet/transactions", wallet.Transactions)
		protected.POST("/wallet/reset", wallet.Reset)
		protected.GET("/portfolio", portfolio.Get)
		protected.GET("/portfolio/positions", portfolio.Positions)
		protected.GET("/portfolio/pnl", portfolio.Pnl)
		protected.POST("/orders", orders.Create)
		protected.GET("/orders", orders.List)
		protected.GET("/orders/:id", orders.Get)
		protected.DELETE("/orders/:id", orders.Cancel)
		protected.POST("/orders/:id/execute", orders.Execute)
		protected.GET("/trades", trades.List)
		protected.POST("/ai/analyze-trade", mentor.Analyze)
	}

	return r
}
