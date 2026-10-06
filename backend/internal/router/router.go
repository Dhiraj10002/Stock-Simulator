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

	instrumentHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/handler"
	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/fundamentals"
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

	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed openapi.yaml
var openAPISpec []byte

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
	configureProxyTrust(r, cfg)
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
		market.Service().SetDB(database.GetDB())
		market.Service().SetInstrumentFinder(newInstrumentFinder(database.GetDB(), cfg.RedisOperationTimeout))
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
		go portfolio.Service().RunSessionSnapshotScheduler(ctx)
	}
	marketWS := marketWebsocket.New(market.Service(), cfg.CORSAllowedOrigins, cfg.IsProduction())
	companyFundamentals := fundamentals.New(cfg.IndianAPIKey, cfg.IndianAPIPlan, market.Service().Client(), func(ctx context.Context, symbol string) bool {
		db := database.GetDB()
		if db == nil {
			return false
		}
		var count int64
		err := db.WithContext(ctx).Model(&model.Instrument{}).Where("(UPPER(symbol) = ? OR UPPER(symbol) = ?) AND exchange_segment = 'NSE' AND instrument_type = 'EQUITY' AND active = ? AND is_tradable = ?", symbol, symbol+"-EQ", true, true).Count(&count).Error
		return err == nil && count > 0
	})
	instruments := instrumentHandler.New()
	if ctx != nil {
		go instrumentService.NewService(database.GetDB()).RunLifecycle(ctx)
	}
	stocks := stockHandler.New(market.Service())
	trades := tradeHandler.New()
	watchlist := watchlistHandler.New()
	mentor := aiHandler.New(cfg)
	mentor.Service().OrderPreview = orders.Service().Preview
	risk := riskHandler.New(market.Service())
	fno := fnoHandler.New(market.Service())
	analytics := analyticsHandler.New()
	reports := reportsHandler.New()
	news, err := newsHandler.New(cfg.RedisURL, cfg.RedisOperationTimeout)
	if err != nil {
		panic(err)
	}

	healthHandler.SetDB(database.GetDB())
	if market != nil && market.Service() != nil {
		healthHandler.SetMarketService(market.Service())
		healthHandler.SetRedisClient(market.Service().Client())
	}
	if instruments != nil {
		healthHandler.SetInstrumentService(instruments.Service())
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
	r.GET("/livez", healthHandler.Health)
	r.GET("/ready", healthHandler.Readiness)
	r.GET("/readyz", healthHandler.Readiness)
	r.GET("/openapi.yaml", func(c *gin.Context) {
		c.Data(http.StatusOK, "application/yaml; charset=utf-8", openAPISpec)
	})
	r.GET("/ws/market", marketWS.Serve)
	{
		api.GET("/health", healthHandler.Health)
		api.GET("/livez", healthHandler.Health)
		api.GET("/ready", healthHandler.Readiness)
		api.GET("/readyz", healthHandler.Readiness)
		api.GET("/openapi.yaml", func(c *gin.Context) {
			c.Data(http.StatusOK, "application/yaml; charset=utf-8", openAPISpec)
		})
		api.GET("/market/status", market.Status)
		api.GET("/market/calendar", market.Calendar)
		api.GET("/market/quotes/batch", market.BatchQuotes)
		api.POST("/market/quotes/batch", market.BatchQuotes)
		api.GET("/market/quotes/:symbol", market.Quote)
		api.GET("/market/quotes/:symbol/history", market.History)
		api.GET("/market/quotes/:symbol/fundamentals", companyFundamentals.Handler)
		api.GET("/market/movers", market.Movers)
		api.GET("/market/breadth", market.Breadth)
		api.GET("/market/indices", market.Indices)
		api.GET("/market/sectors", market.Sectors)
		api.GET("/fno/option-chain", fno.GetOptionChain)
		api.GET("/instruments", instruments.List)
		api.GET("/instruments/derivative-underlyings", instruments.DerivativeUnderlyings)
		api.GET("/instruments/derivative-stocks", instruments.DerivativeStocks)
		api.GET("/instruments/futures", instruments.FuturesCatalog)
		api.GET("/instruments/snapshots/active", instruments.GetActiveSnapshot)
		api.GET("/instruments/snapshots", instruments.ListSnapshots)
		api.GET("/instruments/master/status", instruments.GetMasterStatus)
		api.GET("/instruments/:symbol", instruments.GetBySymbol)
		api.GET("/stocks", stocks.Search)
		api.GET("/news", news.List)
		api.GET("/news/status", news.Status)

		authLimit := gin.HandlerFunc(func(c *gin.Context) { c.Next() })
		writeLimit := gin.HandlerFunc(func(c *gin.Context) { c.Next() })
		if rateLimiter != nil {
			authLimit = rateLimiter.Limit("auth", cfg.AuthRateLimitMaxRequests, cfg.RateLimitWindow)
			writeLimit = rateLimiter.Limit("write", cfg.RateLimitMaxRequests, cfg.RateLimitWindow)
		}

		api.POST("/auth/register", authLimit, auth.Register)
		api.POST("/auth/login", authLimit, auth.Login)
		api.POST("/auth/refresh", authLimit, auth.Refresh)
		api.POST("/auth/logout", authLimit, auth.Logout)
		api.GET("/auth/me", authMiddleware.Authenticate(cfg.JWTSecret), auth.Me)

		protected := api.Group("", authMiddleware.Authenticate(cfg.JWTSecret))
		protected.GET("/wallet", wallet.Get)
		protected.GET("/wallet/transactions", wallet.Transactions)
		protected.POST("/wallet/deposit", writeLimit, wallet.Deposit)
		protected.POST("/simulation/deposit", writeLimit, wallet.Deposit)
		protected.POST("/simulation/reset", writeLimit, simulation.Reset)
		protected.POST("/portfolio/reset", writeLimit, simulation.Reset)
		protected.POST("/orders", writeLimit, orders.Create)
		protected.POST("/orders/preview", writeLimit, orders.Preview)
		protected.POST("/orders/:id/execute", writeLimit, orders.Execute)
		protected.POST("/ai/analyze-trade", writeLimit, mentor.Analyze)
		protected.POST("/ai/trade-critique", writeLimit, mentor.Critique)
		protected.POST("/ai/pretrade-check", writeLimit, mentor.PreTradeCheck)
		protected.GET("/portfolio", portfolio.Get)
		protected.GET("/portfolio/positions", portfolio.Positions)
		protected.GET("/portfolio/pnl", portfolio.Pnl)
		protected.GET("/risk/overview", risk.GetOverview)
		protected.POST("/portfolio/positions/:uuid/squareoff", writeLimit, orders.SquareOffPosition)
		protected.POST("/orders/squareoff-mis", writeLimit, orders.SquareOffMIS)
		protected.POST("/simulation/squareoff-mis", writeLimit, orders.SquareOffMIS)
		protected.GET("/orders", orders.List)
		protected.DELETE("/orders/history", writeLimit, orders.ClearHistory)
		protected.DELETE("/orders/clear", writeLimit, orders.ClearHistory)
		protected.GET("/orders/:id", orders.Get)
		protected.DELETE("/orders/:id", writeLimit, orders.Cancel)
		protected.GET("/trades", trades.List)
		protected.PATCH("/trades/:uuid/journal", writeLimit, trades.UpdateJournal)
		protected.GET("/analytics/performance", analytics.GetPerformanceOverview)
		protected.GET("/analytics/pnl-calendar", analytics.GetPnlCalendar)
		protected.GET("/reports/contract-note", reports.GetContractNote)
		protected.GET("/reports/ledger-statement", reports.GetLedgerStatement)
		protected.GET("/watchlist", watchlist.List)
		protected.POST("/watchlist", writeLimit, watchlist.Add)
		protected.DELETE("/watchlist/:symbol", writeLimit, watchlist.Remove)
	}

	return r
}
