package router

import (
	authHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/handler"
	authMiddleware "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/middleware"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/middleware"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/validation"

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

	api := r.Group("/api/v1")
	{
		api.GET("/health", healthHandler.Health)

		api.POST("/auth/register", auth.Register)
		api.POST("/auth/login", auth.Login)
		api.POST("/auth/refresh", auth.Refresh)
		api.POST("/auth/logout", auth.Logout)
		api.GET("/auth/me", authMiddleware.Authenticate(cfg.JWTSecret), auth.Me)
	}

	return r
}
