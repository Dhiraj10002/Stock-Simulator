package router

import (
	"fmt"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/gin-gonic/gin"
)

func configureProxyTrust(r *gin.Engine, cfg *config.Config) {
	// Caddy replaces X-Forwarded-For at the public boundary. Do not fall back
	// to X-Real-IP, which may be supplied by the original browser unchanged.
	r.RemoteIPHeaders = []string{"X-Forwarded-For"}
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		panic(fmt.Errorf("invalid TRUSTED_PROXIES configuration: %w", err))
	}
}
