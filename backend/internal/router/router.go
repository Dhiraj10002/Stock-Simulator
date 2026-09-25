package router

import (
	"context"
	aiHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/handler"
	analyticsHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/analytics/handler"
	authHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/handler"
	authMiddleware "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/middleware"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	fnoHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/handler"
	"strings"

	instrumentHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/handler"
	marketWebsocket "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/websocket"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/middleware"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	newsHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/news/handler"
	orderHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/handler"
	portfolioHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/handler"
	reportsHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/reports/handler"
	riskHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/risk/handler"
	simulationHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/simulation/handler"
	stockHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/stock/handler"
	tradeHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/trade/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/validation"
	walletHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/wallet/handler"
	watchlistHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/watchlist/handler"

	"github.com/gin-gonic/gin"
)

type SetupOption func(*setupOptions)

type setupOptions struct {
	ordersHandler *orderHandler.OrderHandler
}

func WithOrderHandler(oh *orderHandler.OrderHandler) SetupOption {
	return func(o *setupOptions) {
		o.ordersHandler = oh
	}
}

func Setup(ctx context.Context, cfg *config.Config, opts ...SetupOption) *gin.Engine {
	var sOpts setupOptions
	for _, opt := range opts {
		opt(&sOpts)
	}

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
	if cfg.MarketWorkerURL != "" {
		market.Service().SetWorkerURL(cfg.MarketWorkerURL)
	}
	if cfg.MarketFeedMode != "" {
		market.Service().SetFeedMode(marketDTO.NormalizeFeedMode(cfg.MarketFeedMode))
	}
	if cfg.AllowSeededQuotes {
		market.Service().SetAllowSeededQuotes(true)
	}
	if database.GetDB() != nil {
		market.Service().SetInstrumentFinder(func(symbol string) (bool, error) {
			clean := strings.ToUpper(strings.TrimSpace(symbol))
			var count int64
			err := database.GetDB().Model(&model.Instrument{}).
				Where("UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(name) = ?", clean, clean+"-EQ", clean).
				Count(&count).Error
			if err != nil {
				return false, err
			}
			if count > 0 {
				return true, nil
			}
			canonical := alias.ResolveCanonicalSymbol(clean)
			if canonical != "" && canonical != clean {
				err = database.GetDB().Model(&model.Instrument{}).
					Where("UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(name) = ?", canonical, canonical+"-EQ", canonical).
					Count(&count).Error
				if err != nil {
					return false, err
				}
				if count > 0 {
					return true, nil
				}
			}
			return false, nil
		})
	}
	portfolio := portfolioHandler.New(market.Service())
	orders := sOpts.ordersHandler
	if orders == nil {
		orders = orderHandler.New(market.Service(), cfg)
	}
	go orders.RunMatcher(ctx)
	if database.GetDB() != nil {
		go orders.RunProductLifecycle(ctx)
		go orders.RunExpirySettlement(ctx)
	}
	marketWS := marketWebsocket.New(market.Service(), cfg.CORSAllowedOrigins, cfg.IsProduction())
	instruments := instrumentHandler.New()
	stocks := stockHandler.New(market.Service())
	trades := tradeHandler.New()
	watchlist := watchlistHandler.New()
	mentor := aiHandler.New(cfg)
	risk := riskHandler.New(market.Service())
	fno := fnoHandler.New(market.Service())
	analytics := analyticsHandler.New()
	reports := reportsHandler.New()
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
	r.GET("/health", healthHandler.Health)
	r.GET("/ready", healthHandler.Readiness)
	r.GET("/ws/market", marketWS.Serve)
	{
		api.GET("/health", healthHandler.Health)
		api.GET("/ready", healthHandler.Readiness)
		api.GET("/market/status", market.Status)
		api.GET("/market/quotes/:symbol", market.Quote)
		api.GET("/market/quotes/:symbol/history", market.History)
		api.GET("/fno/option-chain", fno.GetOptionChain)
		api.GET("/instruments", instruments.List)
		api.GET("/instruments/:symbol", instruments.GetBySymbol)
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
			protected.POST("/ai/trade-critique", writeLimit, mentor.Critique)
			protected.POST("/ai/pretrade-check", writeLimit, mentor.PreTradeCheck)
		} else {
			protected.POST("/simulation/reset", simulation.Reset)
			protected.POST("/orders", orders.Create)
			protected.POST("/orders/:id/execute", orders.Execute)
			protected.POST("/ai/analyze-trade", mentor.Analyze)
			protected.POST("/ai/trade-critique", mentor.Critique)
			protected.POST("/ai/pretrade-check", mentor.PreTradeCheck)
		}
		protected.GET("/portfolio", portfolio.Get)
		protected.GET("/portfolio/positions", portfolio.Positions)
		protected.GET("/portfolio/pnl", portfolio.Pnl)
		protected.GET("/risk/overview", risk.GetOverview)
		protected.POST("/orders/squareoff-mis", orders.SquareOffMIS)
		protected.POST("/simulation/squareoff-mis", orders.SquareOffMIS)
		protected.GET("/orders", orders.List)
		protected.DELETE("/orders/history", orders.ClearHistory)
		protected.DELETE("/orders/clear", orders.ClearHistory)
		protected.GET("/orders/:id", orders.Get)
		protected.DELETE("/orders/:id", orders.Cancel)
		protected.GET("/trades", trades.List)
		protected.PATCH("/trades/:uuid/journal", trades.UpdateJournal)
		protected.GET("/analytics/performance", analytics.GetPerformanceOverview)
		protected.GET("/analytics/pnl-calendar", analytics.GetPnlCalendar)
		protected.GET("/reports/contract-note", reports.GetContractNote)
		protected.GET("/reports/ledger-statement", reports.GetLedgerStatement)
		protected.GET("/watchlist", watchlist.List)
		protected.POST("/watchlist", watchlist.Add)
		protected.DELETE("/watchlist/:symbol", watchlist.Remove)
	}

	return r
}
