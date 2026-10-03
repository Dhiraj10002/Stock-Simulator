package handler

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(&model.Instrument{}, &model.InstrumentSnapshot{})
	require.NoError(t, err)

	// Seed an active snapshot and tradable instruments
	now := time.Now()
	snap := model.InstrumentSnapshot{
		Version:          "20261001-0800",
		Source:           "angel_one",
		Status:           model.SnapshotStatusActive,
		TotalInstruments: 10,
		EquityCount:      10,
		ActivatedAt:      &now,
	}
	require.NoError(t, db.Create(&snap).Error)

	for i := 1; i <= 10; i++ {
		inst := model.Instrument{
			Symbol:          fmt.Sprintf("SYM%d", i),
			Exchange:        "NSE",
			Token:           fmt.Sprintf("T%d", i),
			Active:          true,
			IsTradable:      true,
			SnapshotVersion: snap.Version,
		}
		require.NoError(t, db.Create(&inst).Error)
	}

	return db
}

func startFakeRedisServer(t *testing.T, feedState map[string]string) (string, func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	stop := make(chan struct{})
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				select {
				case <-stop:
					return
				default:
					return
				}
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 2048)
				for {
					n, err := c.Read(buf)
					if err != nil {
						return
					}
					cmd := string(buf[:n])
					upper := strings.ToUpper(cmd)
					if strings.Contains(upper, "PING") {
						_, _ = c.Write([]byte("+PONG\r\n"))
					} else if strings.Contains(upper, "HGETALL") {
						if len(feedState) == 0 {
							_, _ = c.Write([]byte("*0\r\n"))
						} else {
							var b strings.Builder
							b.WriteString(fmt.Sprintf("*%d\r\n", len(feedState)*2))
							for k, v := range feedState {
								b.WriteString(fmt.Sprintf("$%d\r\n%s\r\n$%d\r\n%s\r\n", len(k), k, len(v), v))
							}
							_, _ = c.Write([]byte(b.String()))
						}
					} else if strings.Contains(upper, "HELLO") {
						_, _ = c.Write([]byte("%1\r\n$5\r\nproto\r\n:3\r\n"))
					} else {
						_, _ = c.Write([]byte("+OK\r\n"))
					}
				}
			}(conn)
		}
	}()

	cleanup := func() {
		close(stop)
		_ = ln.Close()
	}

	return ln.Addr().String(), cleanup
}

func TestReadiness_RedisUnreachable_Returns503(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupTestDB(t)

	// Redis pointing to unreachable port
	unreachableClient := redis.NewClient(&redis.Options{
		Addr:        "127.0.0.1:59999",
		DialTimeout: 50 * time.Millisecond,
	})
	defer unreachableClient.Close()

	h := NewHealthHandler()
	h.SetDB(db)
	h.SetRedisClient(unreachableClient)
	h.SetInstrumentService(instrumentService.NewService(db))

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/ready", nil)

	h.Readiness(c)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var resp ReadinessResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.False(t, resp.Ready, "ready must be false when Redis is unreachable")
	assert.Equal(t, "UNAVAILABLE", resp.Status)
	assert.Equal(t, "DOWN", resp.Services.Redis.Status)
	assert.Equal(t, "UP", resp.Services.Database.Status)
}

func TestReadiness_LiveMode_StaleTickDuringMarketHours_Returns503(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupTestDB(t)

	// Simulate market open time: Wednesday 2026-09-23 at 11:30:00 IST
	simulatedOpenTime := time.Date(2026, 9, 23, 11, 30, 0, 0, calendar.Location())
	require.True(t, calendar.IsMarketOpen(simulatedOpenTime), "simulated time must be during regular market hours")

	// Last tick 75 seconds ago (> 60s threshold)
	staleTickTime := simulatedOpenTime.Add(-75 * time.Second).UTC().Format(time.RFC3339)

	redisAddr, cleanup := startFakeRedisServer(t, map[string]string{
		"feed_provider":           "angel_one",
		"feed_state":              "LIVE",
		"is_synthetic":            "false",
		"last_tick":               staleTickTime,
		"worker_heartbeat":        simulatedOpenTime.UTC().Format(time.RFC3339),
		"worker_master_version":   "20261001-0800",
		"subscribed_tokens_count": "150",
	})
	defer cleanup()

	rClient := redis.NewClient(&redis.Options{Addr: redisAddr, Protocol: 2})
	defer rClient.Close()

	mService, err := marketService.New("redis://"+redisAddr+"?protocol=2", 500*time.Millisecond)
	require.NoError(t, err)
	mService.SetFeedMode(marketDTO.FeedModeLive)

	h := NewHealthHandler()
	h.SetDB(db)
	h.SetRedisClient(rClient)
	h.SetMarketService(mService)
	h.SetInstrumentService(instrumentService.NewService(db))
	h.SetNowFunc(func() time.Time { return simulatedOpenTime })

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/ready", nil)

	h.Readiness(c)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code, "must return HTTP 503 when tick is stale in LIVE mode during market hours")

	var resp ReadinessResponse
	err = json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	t.Logf("response body: %s", w.Body.String())
	assert.False(t, resp.Ready)
	assert.Equal(t, "DEGRADED", resp.Status)
	assert.Equal(t, "DEGRADED", resp.Services.MarketFeed.Status)
	assert.NotNil(t, resp.Services.MarketFeed.LastTickAgeSeconds)
	assert.Greater(t, *resp.Services.MarketFeed.LastTickAgeSeconds, 60.0)
	assert.Equal(t, "OPEN", resp.Services.Calendar.MarketState)
}

func TestReadiness_LiveMode_FreshTickDuringMarketHours_Returns200(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupTestDB(t)

	// Simulate market open time: Wednesday 2026-09-23 at 11:30:00 IST
	simulatedOpenTime := time.Date(2026, 9, 23, 11, 30, 0, 0, calendar.Location())
	require.True(t, calendar.IsMarketOpen(simulatedOpenTime))

	// Last tick 2 seconds ago (< 60s threshold)
	freshTickTime := simulatedOpenTime.Add(-2 * time.Second).UTC().Format(time.RFC3339)

	redisAddr, cleanup := startFakeRedisServer(t, map[string]string{
		"feed_provider":           "angel_one",
		"feed_state":              "LIVE",
		"is_synthetic":            "false",
		"last_tick":               freshTickTime,
		"worker_heartbeat":        simulatedOpenTime.UTC().Format(time.RFC3339),
		"worker_master_version":   "20261001-0800",
		"subscribed_tokens_count": "1420",
	})
	defer cleanup()

	rClient := redis.NewClient(&redis.Options{Addr: redisAddr, Protocol: 2})
	defer rClient.Close()

	mService, err := marketService.New("redis://"+redisAddr+"?protocol=2", 500*time.Millisecond)
	require.NoError(t, err)
	mService.SetFeedMode(marketDTO.FeedModeLive)

	h := NewHealthHandler()
	h.SetDB(db)
	h.SetRedisClient(rClient)
	h.SetMarketService(mService)
	h.SetInstrumentService(instrumentService.NewService(db))
	h.SetNowFunc(func() time.Time { return simulatedOpenTime })

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/ready", nil)

	h.Readiness(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp ReadinessResponse
	err = json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.True(t, resp.Ready)
	assert.Equal(t, "OPERATIONAL", resp.Status)
	assert.Equal(t, "UP", resp.Services.Database.Status)
	assert.Equal(t, "UP", resp.Services.Redis.Status)
	assert.Equal(t, "UP", resp.Services.MarketFeed.Status)
	assert.Equal(t, "UP", resp.Services.InstrumentMaster.Status)
	assert.Equal(t, "20261001-0800", resp.Services.InstrumentMaster.ActiveVersion)
	assert.Equal(t, 10, resp.Services.InstrumentMaster.TotalTradable)
	assert.Equal(t, 1420, resp.Services.MarketFeed.SubscribedTokensCount)
	assert.Equal(t, "OPEN", resp.Services.Calendar.MarketState)
}

func TestReadiness_OutsideMarketHours_AgedTicksDoNotFailReadiness(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupTestDB(t)

	// Simulate market closed time: Saturday 2026-09-26 at 14:00:00 IST
	simulatedClosedTime := time.Date(2026, 9, 26, 14, 0, 0, 0, calendar.Location())
	require.False(t, calendar.IsMarketOpen(simulatedClosedTime), "Saturday must be closed market")

	// Last tick from Friday afternoon (24+ hours ago)
	agedTickTime := simulatedClosedTime.Add(-24 * time.Hour).UTC().Format(time.RFC3339)

	redisAddr, cleanup := startFakeRedisServer(t, map[string]string{
		"feed_provider":           "angel_one",
		"feed_state":              "DISCONNECTED",
		"is_synthetic":            "false",
		"last_tick":               agedTickTime,
		"worker_heartbeat":        simulatedClosedTime.UTC().Format(time.RFC3339),
		"worker_master_version":   "20261001-0800",
		"subscribed_tokens_count": "1420",
	})
	defer cleanup()

	rClient := redis.NewClient(&redis.Options{Addr: redisAddr, Protocol: 2})
	defer rClient.Close()

	mService, err := marketService.New("redis://"+redisAddr+"?protocol=2", 500*time.Millisecond)
	require.NoError(t, err)
	mService.SetFeedMode(marketDTO.FeedModeLive)

	h := NewHealthHandler()
	h.SetDB(db)
	h.SetRedisClient(rClient)
	h.SetMarketService(mService)
	h.SetInstrumentService(instrumentService.NewService(db))
	h.SetNowFunc(func() time.Time { return simulatedClosedTime })

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/ready", nil)

	h.Readiness(c)

	assert.Equal(t, http.StatusOK, w.Code, "outside market hours aged ticks must NOT fail readiness")

	var resp ReadinessResponse
	err = json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.True(t, resp.Ready)
	assert.Equal(t, "OPERATIONAL", resp.Status)
	assert.Equal(t, "UP", resp.Services.MarketFeed.Status)
	assert.Equal(t, "CLOSED", resp.Services.Calendar.MarketState)
}

func TestReadiness_TradingHoliday_ReportsHoliday(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupTestDB(t)

	// Simulate Mahatma Gandhi Jayanti holiday: 2026-10-02 at 11:00:00 IST
	simulatedHolidayTime := time.Date(2026, 10, 2, 11, 0, 0, 0, calendar.Location())
	require.False(t, calendar.IsMarketOpen(simulatedHolidayTime))

	redisAddr, cleanup := startFakeRedisServer(t, map[string]string{
		"worker_heartbeat":      simulatedHolidayTime.UTC().Format(time.RFC3339),
		"worker_master_version": "20261001-0800",
		"feed_provider":         "angel_one",
		"feed_state":            "LIVE",
		"is_synthetic":          "false",
	})
	defer cleanup()

	rClient := redis.NewClient(&redis.Options{Addr: redisAddr, Protocol: 2})
	defer rClient.Close()

	mService, err := marketService.New("redis://"+redisAddr+"?protocol=2", 500*time.Millisecond)
	require.NoError(t, err)

	h := NewHealthHandler()
	h.SetDB(db)
	h.SetRedisClient(rClient)
	h.SetMarketService(mService)
	h.SetInstrumentService(instrumentService.NewService(db))
	h.SetNowFunc(func() time.Time { return simulatedHolidayTime })

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/ready", nil)

	h.Readiness(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp ReadinessResponse
	err = json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.True(t, resp.Ready)
	assert.Equal(t, "HOLIDAY", resp.Services.Calendar.MarketState)
}

func TestReadiness_DatabaseUnreachable_Returns503(t *testing.T) {
	gin.SetMode(gin.TestMode)

	redisAddr, cleanup := startFakeRedisServer(t, nil)
	defer cleanup()
	rClient := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer rClient.Close()

	h := NewHealthHandler()
	h.SetDB(nil) // nil DB
	h.SetRedisClient(rClient)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/ready", nil)

	h.Readiness(c)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var resp ReadinessResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.False(t, resp.Ready)
	assert.Equal(t, "UNAVAILABLE", resp.Status)
	assert.Equal(t, "DOWN", resp.Services.Database.Status)
}

func TestReadinessUnsupportedCalendarYearFailsClosed(t *testing.T) {
	h := &HealthHandler{}
	status, state, close, cutoff := h.checkCalendar(time.Date(2027, 1, 4, 10, 0, 0, 0, calendar.Location()))
	assert.Equal(t, "UNAVAILABLE", status)
	assert.Equal(t, "UNAVAILABLE", state)
	assert.Empty(t, close)
	assert.Empty(t, cutoff)
}

func TestClosedSessionStillRequiresWorkerHeartbeatAndMasterAgreement(t *testing.T) {
	now := time.Date(2026, 9, 26, 12, 0, 0, 0, calendar.Location())
	for _, tc := range []struct{ name, beat, version string }{
		{"missing", "", "20261001-0800"},
		{"expired", now.Add(-91 * time.Second).Format(time.RFC3339), "20261001-0800"},
		{"future", now.Add(6 * time.Second).Format(time.RFC3339), "20261001-0800"},
		{"wrong master", now.Format(time.RFC3339), "old-version"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := setupTestDB(t)
			addr, cleanup := startFakeRedisServer(t, map[string]string{"feed_state": "LIVE", "is_synthetic": "false", "worker_heartbeat": tc.beat, "worker_master_version": tc.version})
			defer cleanup()
			market, err := marketService.New("redis://"+addr+"?protocol=2", 500*time.Millisecond)
			require.NoError(t, err)
			market.SetFeedMode(marketDTO.FeedModeLive)
			defer market.Client().Close()
			h := NewHealthHandler()
			h.SetDB(db)
			h.SetMarketService(market)
			h.SetNowFunc(func() time.Time { return now })
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodGet, "/ready", nil)
			h.Readiness(c)
			assert.Equal(t, http.StatusServiceUnavailable, w.Code)
			var result ReadinessResponse
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &result))
			assert.Equal(t, "DOWN", result.Services.Worker.Status)
		})
	}
}

func TestLiveMasterRejectsLegacyRowsWithoutActivation(t *testing.T) {
	db := setupTestDB(t)
	require.NoError(t, db.Where("1=1").Delete(&model.InstrumentSnapshot{}).Error)
	addr, stop := startFakeRedisServer(t, map[string]string{})
	defer stop()
	market, err := marketService.New("redis://"+addr+"?protocol=2", 500*time.Millisecond)
	require.NoError(t, err)
	defer market.Client().Close()
	market.SetFeedMode(marketDTO.FeedModeLive)
	h := NewHealthHandler()
	h.SetDB(db)
	h.SetMarketService(market)
	status, _, _, _ := h.checkInstrumentMaster(t.Context())
	assert.Equal(t, "DOWN", status)
}

func TestReadinessRejectsFutureFeedTick(t *testing.T) {
	now := time.Date(2026, 9, 23, 11, 30, 0, 0, calendar.Location())
	addr, stop := startFakeRedisServer(t, map[string]string{"feed_state": "LIVE", "last_tick": now.Add(time.Minute).Format(time.RFC3339)})
	defer stop()
	market, err := marketService.New("redis://"+addr+"?protocol=2", 500*time.Millisecond)
	require.NoError(t, err)
	defer market.Client().Close()
	market.SetFeedMode(marketDTO.FeedModeLive)
	h := NewHealthHandler()
	h.SetMarketService(market)
	status, _, _, _, _, _ := h.checkMarketFeed(t.Context(), now, "OPEN")
	assert.Equal(t, "DOWN", status)
}
