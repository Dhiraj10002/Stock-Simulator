package handler

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// ConnectionPoolInfo reports database connection pool metrics.
type ConnectionPoolInfo struct {
	Open           int     `json:"open"`
	InUse          int     `json:"in_use"`
	Idle           int     `json:"idle"`
	MaxOpen        int     `json:"max_open"`
	WaitCount      int64   `json:"wait_count"`
	WaitDurationMs float64 `json:"wait_duration_ms"`
}

// DatabaseServiceStatus represents the readiness of the primary database.
type DatabaseServiceStatus struct {
	Status         string             `json:"status"`
	LatencyMs      float64            `json:"latency_ms"`
	ConnectionPool ConnectionPoolInfo `json:"connection_pool"`
	Error          string             `json:"error,omitempty"`
}

// RedisServiceStatus represents the readiness of the Redis instance.
type RedisServiceStatus struct {
	Status    string  `json:"status"`
	LatencyMs float64 `json:"latency_ms"`
	Mode      string  `json:"mode"`
	Error     string  `json:"error,omitempty"`
}

// MarketFeedServiceStatus represents the readiness of the real-time market data feed.
type MarketFeedServiceStatus struct {
	Status                string   `json:"status"`
	Mode                  string   `json:"mode"`
	SupervisorState       string   `json:"supervisor_state"`
	LastTickAgeSeconds    *float64 `json:"last_tick_age_seconds"`
	SubscribedTokensCount int      `json:"subscribed_tokens_count"`
	Error                 string   `json:"error,omitempty"`
}

// WorkerServiceStatus tracks process progress independently of exchange ticks.
type WorkerServiceStatus struct {
	Status              string   `json:"status"`
	HeartbeatAgeSeconds *float64 `json:"heartbeat_age_seconds"`
	MasterVersion       string   `json:"master_version"`
	InitializationStage string   `json:"initialization_stage,omitempty"`
	MasterLoadMs        float64  `json:"master_load_ms,omitempty"`
	Error               string   `json:"error,omitempty"`
}

// InstrumentMasterServiceStatus represents the readiness of the instrument master.
type InstrumentMasterServiceStatus struct {
	Status        string `json:"status"`
	ActiveVersion string `json:"active_version"`
	TotalTradable int    `json:"total_tradable"`
	Error         string `json:"error,omitempty"`
}

// CalendarServiceStatus represents trading calendar state and session boundaries.
type CalendarServiceStatus struct {
	Status          string `json:"status"`
	MarketState     string `json:"market_state"`
	SessionClosesAt string `json:"session_closes_at"`
	MisCutoffAt     string `json:"mis_cutoff_at"`
}

// ReadinessServices encapsulates all inspected backend subsystems.
type ReadinessServices struct {
	Database         DatabaseServiceStatus         `json:"database"`
	Redis            RedisServiceStatus            `json:"redis"`
	MarketFeed       MarketFeedServiceStatus       `json:"market_feed"`
	InstrumentMaster InstrumentMasterServiceStatus `json:"instrument_master"`
	Worker           WorkerServiceStatus           `json:"worker"`
	Calendar         CalendarServiceStatus         `json:"calendar"`
}

// ReadinessResponse is the target payload for GET /ready and /api/v1/ready.
type ReadinessResponse struct {
	Ready     bool              `json:"ready"`
	Status    string            `json:"status"`
	Timestamp string            `json:"timestamp"`
	Services  ReadinessServices `json:"services"`
	// Backwards compatibility envelope fields
	Success bool  `json:"success"`
	Data    gin.H `json:"data,omitempty"`
}

type HealthHandler struct {
	db                *gorm.DB
	marketService     *marketService.Service
	instrumentService *instrumentService.Service
	redisClient       *redis.Client
	nowFunc           func() time.Time
}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

func (h *HealthHandler) SetDB(db *gorm.DB) {
	h.db = db
}

func (h *HealthHandler) SetMarketService(ms *marketService.Service) {
	h.marketService = ms
}

func (h *HealthHandler) SetInstrumentService(is *instrumentService.Service) {
	h.instrumentService = is
}

func (h *HealthHandler) SetRedisClient(rc *redis.Client) {
	h.redisClient = rc
}

func (h *HealthHandler) SetNowFunc(fn func() time.Time) {
	h.nowFunc = fn
}

func (h *HealthHandler) now() time.Time {
	if h.nowFunc != nil {
		return h.nowFunc()
	}
	return time.Now()
}

func (h *HealthHandler) getDB() *gorm.DB {
	if h.db != nil {
		return h.db
	}
	return database.GetDB()
}

func (h *HealthHandler) getRedisClient() *redis.Client {
	if h.redisClient != nil {
		return h.redisClient
	}
	if h.marketService != nil {
		return h.marketService.Client()
	}
	return nil
}

// Health is the basic liveness probe (/health, /livez).
func (h *HealthHandler) Health(c *gin.Context) {
	dbStatus := "not_configured"
	if db := h.getDB(); db != nil {
		if sqlDB, err := db.DB(); err == nil {
			if err := sqlDB.PingContext(c.Request.Context()); err == nil {
				dbStatus = "connected"
			} else {
				dbStatus = "unreachable"
			}
		}
	}

	response.Success(
		c,
		http.StatusOK,
		"Stock Simulator API is running",
		gin.H{
			"version":  "v1",
			"status":   "healthy",
			"database": dbStatus,
		},
	)
}

// Readiness evaluates multi-subsystem health across DB, Redis, Market Feed, Master & Calendar.
func (h *HealthHandler) Readiness(c *gin.Context) {
	ctx := c.Request.Context()
	now := h.now()
	ist := now.In(calendar.Location())

	// 1. Inspect Database
	dbStatus, dbLatency, poolInfo, dbErr := h.checkDatabase(ctx)

	// 2. Inspect Redis
	redisStatus, redisLatency, redisMode, redisErr := h.checkRedis(ctx)

	// 3. Inspect Calendar
	calStatus, marketState, sessionClose, misCutoff := h.checkCalendar(ist)

	// 4. Inspect Market Feed
	feedStatus, feedMode, supState, tickAge, subCount, feedErr := h.checkMarketFeed(ctx, now, marketState)

	// 5. Inspect Instrument Master
	masterStatus, activeVersion, tradableCount, masterErr := h.checkInstrumentMaster(ctx)

	worker := h.checkWorker(ctx, now)
	if feedMode == "LIVE" && worker.Status == "UP" && worker.MasterVersion != activeVersion {
		worker.Status = "DOWN"
		worker.Error = "worker has not loaded the activated master"
	}
	// Determine overall readiness
	isReady := true
	overallStatus := "OPERATIONAL"

	if dbStatus != "UP" || redisStatus != "UP" || masterStatus != "UP" || calStatus != "UP" || worker.Status != "UP" {
		isReady = false
		overallStatus = "UNAVAILABLE"
	} else if feedStatus == "DEGRADED" {
		isReady = false
		overallStatus = "DEGRADED"
	} else if feedStatus != "UP" {
		isReady = false
		overallStatus = "UNAVAILABLE"
	}

	services := ReadinessServices{
		Worker: worker,
		Database: DatabaseServiceStatus{
			Status:         dbStatus,
			LatencyMs:      dbLatency,
			ConnectionPool: poolInfo,
			Error:          dbErr,
		},
		Redis: RedisServiceStatus{
			Status:    redisStatus,
			LatencyMs: redisLatency,
			Mode:      redisMode,
			Error:     redisErr,
		},
		MarketFeed: MarketFeedServiceStatus{
			Status:                feedStatus,
			Mode:                  feedMode,
			SupervisorState:       supState,
			LastTickAgeSeconds:    tickAge,
			SubscribedTokensCount: subCount,
			Error:                 feedErr,
		},
		InstrumentMaster: InstrumentMasterServiceStatus{
			Status:        masterStatus,
			ActiveVersion: activeVersion,
			TotalTradable: tradableCount,
			Error:         masterErr,
		},
		Calendar: CalendarServiceStatus{
			Status:          calStatus,
			MarketState:     marketState,
			SessionClosesAt: sessionClose,
			MisCutoffAt:     misCutoff,
		},
	}

	resp := ReadinessResponse{
		Ready:     isReady,
		Status:    overallStatus,
		Timestamp: ist.Format("2006-01-02T15:04:05Z07:00"),
		Services:  services,
		Success:   isReady,
		Data: gin.H{
			"version":        "v1",
			"ready":          isReady,
			"status":         ternary(isReady, "ready", "not_ready"),
			"overall_status": overallStatus,
			"database":       ternary(dbStatus == "UP", "connected", "unreachable"),
			"services":       services,
		},
	}

	statusCode := http.StatusOK
	if !isReady {
		statusCode = http.StatusServiceUnavailable
	}

	c.JSON(statusCode, resp)
}

func ternary(cond bool, a, b string) string {
	if cond {
		return a
	}
	return b
}

func roundLatency(d time.Duration) float64 {
	ms := float64(d.Microseconds()) / 1000.0
	return math.Round(ms*10) / 10
}

func parseTickTime(s string) (time.Time, error) {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05.999999",
		"2006-01-02T15:04:05",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized tick time format: %s", s)
}

func (h *HealthHandler) checkDatabase(ctx context.Context) (string, float64, ConnectionPoolInfo, string) {
	db := h.getDB()
	if db == nil {
		return "DOWN", 0, ConnectionPoolInfo{}, "database not configured"
	}
	sqlDB, err := db.DB()
	if err != nil {
		return "DOWN", 0, ConnectionPoolInfo{}, err.Error()
	}

	pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	t0 := time.Now()
	err = sqlDB.PingContext(pingCtx)
	latency := roundLatency(time.Since(t0))

	stats := sqlDB.Stats()
	pool := ConnectionPoolInfo{
		Open:           stats.OpenConnections,
		InUse:          stats.InUse,
		Idle:           stats.Idle,
		MaxOpen:        stats.MaxOpenConnections,
		WaitCount:      stats.WaitCount,
		WaitDurationMs: roundLatency(stats.WaitDuration),
	}

	if err != nil {
		return "DOWN", latency, pool, err.Error()
	}
	return "UP", latency, pool, ""
}

func (h *HealthHandler) checkRedis(ctx context.Context) (string, float64, string, string) {
	client := h.getRedisClient()
	if client == nil {
		return "DOWN", 0, "STANDALONE", "redis client not configured"
	}

	pingCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()

	t0 := time.Now()
	err := client.Ping(pingCtx).Err()
	latency := roundLatency(time.Since(t0))

	if err != nil {
		return "DOWN", latency, "STANDALONE", err.Error()
	}
	return "UP", latency, "STANDALONE", ""
}

func (h *HealthHandler) checkCalendar(ist time.Time) (string, string, string, string) {
	if !calendar.Snapshot(ist.Year()).Available {
		return "UNAVAILABLE", "UNAVAILABLE", "", ""
	}
	marketState := "CLOSED"
	isWeekend := calendar.IsWeekend(ist)
	isHoliday, _ := calendar.IsTradingHoliday(ist)

	currentMinute := ist.Hour()*60 + ist.Minute()

	if isWeekend {
		marketState = "CLOSED"
	} else if isHoliday {
		marketState = "HOLIDAY"
	} else if currentMinute >= 9*60 && currentMinute < 9*60+15 {
		marketState = "PRE_OPEN"
	} else if currentMinute >= 9*60+15 && currentMinute < 15*60+30 {
		marketState = "OPEN"
	} else if currentMinute >= 15*60+30 && currentMinute < 16*60 {
		marketState = "POST_MARKET"
	} else {
		marketState = "CLOSED"
	}

	_, misCutoff, marketClose := calendar.SessionBounds(ist)
	sessionClosesAt := marketClose.Format("2006-01-02T15:04:05Z07:00")
	misCutoffAt := misCutoff.Format("2006-01-02T15:04:05Z07:00")

	return "UP", marketState, sessionClosesAt, misCutoffAt
}

func (h *HealthHandler) checkMarketFeed(ctx context.Context, now time.Time, marketState string) (string, string, string, *float64, int, string) {
	feedMode := "LIVE"
	if h.marketService != nil {
		feedMode = string(h.marketService.FeedMode())
		if feedMode == "" {
			feedMode = "LIVE"
		}
	}

	supervisorState := "DISCONNECTED"
	var lastTickAge *float64
	subCount := 0

	if h.marketService != nil {
		if fs, err := h.marketService.FeedStatus(ctx); err == nil && fs != nil {
			if fs.FeedState != "" {
				supervisorState = fs.FeedState
			}
			subCount = fs.SubscribedTokensCount
			if fs.LastTick != "" {
				if t, err := parseTickTime(fs.LastTick); err == nil {
					age := now.Sub(t).Seconds()
					if age < -5 {
						return "DOWN", feedMode, supervisorState, nil, subCount, "market tick timestamp is in the future"
					}
					if age < 0 {
						age = 0
					}
					rounded := math.Round(age*10) / 10
					lastTickAge = &rounded
				}
			}
		}
	}

	status := "UP"
	var feedErr string
	if feedMode != "LIVE" && feedMode != "SYNTHETIC" {
		return "DOWN", feedMode, supervisorState, lastTickAge, subCount, "feed mode unavailable"
	}

	if marketState == "OPEN" {
		// Regular trading hours (09:15-15:30 IST on a trading weekday)
		if feedMode == "LIVE" {
			// Criterion 2: In LIVE mode, if last_tick_age_seconds > 60 during regular market hours, /ready reports degraded feed status.
			if lastTickAge == nil || *lastTickAge > 60.0 {
				status = "DEGRADED"
				if lastTickAge == nil {
					feedErr = "no market ticks received during open market hours"
				} else {
					feedErr = fmt.Sprintf("market tick is stale (%v seconds old, threshold 60s)", *lastTickAge)
				}
			} else if supervisorState == "UNAVAILABLE" || supervisorState == "RETRYING" || supervisorState == "DISCONNECTED" {
				status = "DEGRADED"
				feedErr = fmt.Sprintf("market supervisor in state %s during open market hours", supervisorState)
			}
		} else if feedMode == "SYNTHETIC" {
			if lastTickAge != nil && *lastTickAge > 60.0 {
				status = "DEGRADED"
				feedErr = fmt.Sprintf("synthetic tick is stale (%v seconds old, threshold 60s)", *lastTickAge)
			}
		}
	} else {
		// Criterion 3: Outside market hours, aged ticks do not fail readiness; calendar reports CLOSED / HOLIDAY / PRE_OPEN / POST_MARKET
		status = "UP"
	}

	return status, feedMode, supervisorState, lastTickAge, subCount, feedErr
}

func (h *HealthHandler) checkWorker(ctx context.Context, now time.Time) WorkerServiceStatus {
	result := WorkerServiceStatus{Status: "DOWN"}
	client := h.getRedisClient()
	if client == nil {
		result.Error = "worker heartbeat unavailable"
		return result
	}
	values, err := client.HGetAll(ctx, marketService.FeedStateKey).Result()
	if err != nil {
		result.Error = "worker heartbeat unavailable"
		return result
	}
	result.MasterVersion = values["worker_master_version"]
	result.InitializationStage = values["worker_initialization_stage"]
	result.MasterLoadMs, _ = strconv.ParseFloat(values["worker_master_load_ms"], 64)
	if math.IsNaN(result.MasterLoadMs) || math.IsInf(result.MasterLoadMs, 0) || result.MasterLoadMs < 0 {
		result.MasterLoadMs = 0
	}
	stamp, err := parseTickTime(values["worker_heartbeat"])
	if err != nil {
		result.Error = "worker heartbeat missing or invalid"
		return result
	}
	age := now.Sub(stamp).Seconds()
	result.HeartbeatAgeSeconds = &age
	if age < -5 || age > 90 {
		result.Error = "worker heartbeat expired or future dated"
		return result
	}
	result.Status = "UP"
	return result
}

func (h *HealthHandler) checkInstrumentMaster(ctx context.Context) (string, string, int, string) {
	if h.marketService != nil && h.marketService.FeedMode() == "LIVE" {
		db := h.getDB()
		if db == nil {
			return "DOWN", "none", 0, "database master unavailable"
		}
		var snapshots []model.InstrumentSnapshot
		if err := db.WithContext(ctx).Select("version").Where("status = ?", model.SnapshotStatusActive).Limit(2).Find(&snapshots).Error; err != nil {
			return "DOWN", "none", 0, err.Error()
		}
		if len(snapshots) != 1 {
			return "DOWN", "none", 0, "LIVE requires exactly one activated master"
		}
		snap := snapshots[0]
		var count int64
		if err := db.WithContext(ctx).Model(&model.Instrument{}).Where("active = ? AND is_tradable = ? AND snapshot_version = ?", true, true, snap.Version).Count(&count).Error; err != nil {
			return "DOWN", snap.Version, 0, err.Error()
		}
		if count == 0 {
			return "DOWN", snap.Version, 0, "activated master is empty"
		}
		return "UP", snap.Version, int(count), ""
	}
	activeVersion := ""
	totalTradable := 0

	if h.instrumentService != nil {
		if snap, err := h.instrumentService.GetActiveSnapshot(ctx); err == nil && snap != nil {
			activeVersion = snap.Version
			if db := h.getDB(); db != nil {
				var count int64
				if err := db.WithContext(ctx).Model(&model.Instrument{}).Where("active = ? AND is_tradable = ? AND snapshot_version = ?", true, true, snap.Version).Count(&count).Error; err != nil {
					return "DOWN", snap.Version, 0, err.Error()
				}
				totalTradable = int(count)
			}
		}
	}

	if activeVersion != "" && totalTradable == 0 {
		return "DOWN", activeVersion, 0, "active version has no tradable members"
	}
	if totalTradable == 0 {
		if db := h.getDB(); db != nil {
			var count int64
			_ = db.WithContext(ctx).Model(&model.Instrument{}).
				Where("(active = ? OR active IS NULL) AND (is_tradable = ? OR is_tradable IS NULL)", true, true).
				Count(&count).Error
			totalTradable = int(count)
			if activeVersion == "" && totalTradable > 0 {
				activeVersion = "initial-master"
			}
		}
	}

	if totalTradable == 0 && h.getDB() == nil {
		totalTradable = len(instrumentService.DefaultCanonicalInstruments)
		activeVersion = "builtin-canonical"
	}

	if totalTradable > 0 {
		if activeVersion == "" {
			activeVersion = "initial-master"
		}
		return "UP", activeVersion, totalTradable, ""
	}

	return "DOWN", "none", 0, "no active tradable instruments found in master"
}
