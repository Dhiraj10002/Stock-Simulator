package router

import (
	"context"
	aiHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/handler"
	authHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/handler"
	authMiddleware "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/middleware"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/handler"
	marketHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/handler"
	marketWebsocket "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/websocket"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/middleware"
	newsHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/news/handler"
	orderHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/handler"
	portfolioHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/handler"
	simulationHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/simulation/handler"
	stockHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/stock/handler"
	tradeHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/trade/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/validation"
	walletHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/wallet/handler"
	watchlistHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/watchlist/handler"

	"github.com/gin-gonic/gin"
)

func Setup(ctx context.Context, cfg *config.Config) *gin.Engine {

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
	simulation := simulationHandler.New(cfg)
	market, err := marketHandler.New(cfg.RedisURL, cfg.RedisOperationTimeout)
	if err != nil {
		panic(err)
	}
	portfolio := portfolioHandler.New(market.Service())
	orders := orderHandler.New(market.Service(), cfg)
	go orders.RunMatcher(ctx)
	if database.GetDB() != nil {
		go orders.RunProductLifecycle(ctx)
		go orders.RunExpirySettlement(ctx)
	}
	marketWS := marketWebsocket.New(market.Service())
	stocks := stockHandler.New()
	trades := tradeHandler.New()
	watchlist := watchlistHandler.New()
	mentor := aiHandler.New(cfg)
	news, err := newsHandler.New(cfg.RedisURL, cfg.RedisOperationTimeout)
	if err != nil {
		panic(err)
	}

	api := r.Group("/api/v1")
	var rateLimiter *middleware.RateLimiter
	if cfg.RateLimitEnabled {
		client, rateLimitErr := cache.NewRedisClient(cfg.RedisURL, cfg.RedisOperationTimeout)
		if rateLimitErr != nil {
			panic(rateLimitErr)
		}
		rateLimiter = middleware.NewRateLimiter(client, cfg.RedisOperationTimeout)
	}
	r.GET("/ws/market", marketWS.Serve)
	{
		api.GET("/health", healthHandler.Health)
		api.GET("/market/quotes/:symbol", market.Quote)
		api.GET("/market/quotes/:symbol/history", market.History)
		api.GET("/stocks", stocks.Search)
		api.GET("/news", news.List)

		if rateLimiter != nil {
			authLimit := rateLimiter.Limit("auth", cfg.AuthRateLimitMaxRequests, cfg.RateLimitWindow)
			api.POST("/auth/register", authLimit, auth.Register)
			api.POST("/auth/login", authLimit, auth.Login)
			api.POST("/auth/refresh", authLimit, auth.Refresh)
		} else {
			api.POST("/auth/register", auth.Register)
			api.POST("/auth/login", auth.Login)
			api.POST("/auth/refresh", auth.Refresh)
		}
		api.POST("/auth/logout", auth.Logout)
		api.GET("/auth/me", authMiddleware.Authenticate(cfg.JWTSecret), auth.Me)
		protected := api.Group("", authMiddleware.Authenticate(cfg.JWTSecret))
		protected.GET("/wallet", wallet.Get)
		protected.GET("/wallet/transactions", wallet.Transactions)
		if rateLimiter != nil {
			writeLimit := rateLimiter.Limit("write", cfg.RateLimitMaxRequests, cfg.RateLimitWindow)
			protected.POST("/simulation/reset", writeLimit, simulation.Reset)
			protected.POST("/orders", writeLimit, orders.Create)
			protected.POST("/orders/:id/execute", writeLimit, orders.Execute)
			protected.POST("/ai/analyze-trade", writeLimit, mentor.Analyze)
		} else {
			protected.POST("/simulation/reset", simulation.Reset)
			protected.POST("/orders", orders.Create)
			protected.POST("/orders/:id/execute", orders.Execute)
			protected.POST("/ai/analyze-trade", mentor.Analyze)
		}
		protected.GET("/portfolio", portfolio.Get)
		protected.GET("/portfolio/positions", portfolio.Positions)
		protected.GET("/portfolio/pnl", portfolio.Pnl)
		protected.GET("/orders", orders.List)
		protected.GET("/orders/:id", orders.Get)
		protected.DELETE("/orders/:id", orders.Cancel)
		protected.GET("/trades", trades.List)
		protected.GET("/watchlist", watchlist.List)
		protected.POST("/watchlist", watchlist.Add)
		protected.DELETE("/watchlist/:symbol", watchlist.Remove)
	}

	return r
}
