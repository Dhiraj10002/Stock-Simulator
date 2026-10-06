package router

import (
	"context"
	"strings"
	"sync"
	"time"

	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"golang.org/x/sync/singleflight"
	"gorm.io/gorm"
)

// This cache answers existence for quote/history display only. Executable
// instrument status, tokens and product eligibility are validated elsewhere.
// Construction never reads the database or preloads the full instrument master.
func newInstrumentFinder(db *gorm.DB, timeout time.Duration) func(string) (bool, error) {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	type entry struct {
		found   bool
		expires time.Time
	}
	var mu sync.Mutex
	cache := make(map[string]entry)
	var requests singleflight.Group
	defaults := make(map[string]bool)
	for _, inst := range instrumentService.DefaultCanonicalInstruments {
		for _, key := range []string{inst.Symbol, strings.TrimSuffix(inst.Symbol, "-EQ"), inst.Name} {
			defaults[strings.ToUpper(strings.TrimSpace(key))] = true
		}
	}
	return func(symbol string) (bool, error) {
		clean := strings.ToUpper(strings.TrimSpace(symbol))
		if clean == "" {
			return false, nil
		}
		canonical := alias.ResolveCanonicalSymbol(clean)
		if defaults[clean] || defaults[strings.TrimSuffix(clean, "-EQ")] || defaults[canonical] {
			return true, nil
		}
		value, err, _ := requests.Do(clean, func() (any, error) {
			mu.Lock()
			cached, ok := cache[clean]
			mu.Unlock()
			if ok && time.Now().Before(cached.expires) {
				return cached.found, nil
			}
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			defer cancel()
			bare := strings.TrimSuffix(clean, "-EQ")
			var found bool
			if err := db.WithContext(ctx).Raw(
				"SELECT EXISTS (SELECT 1 FROM instruments WHERE UPPER(symbol) IN (?, ?, ?, ?) OR UPPER(name) IN (?, ?))",
				clean, bare, bare+"-EQ", canonical, bare, canonical).Scan(&found).Error; err != nil {
				return false, err // failures are retried; never cached as absence
			}
			// Bound memory even if many distinct invalid symbols are requested.
			mu.Lock()
			if len(cache) >= 2048 {
				clear(cache)
			}
			cache[clean] = entry{found: found, expires: time.Now().Add(30 * time.Second)}
			mu.Unlock()
			return found, nil
		})
		if err != nil {
			return false, err
		}
		return value.(bool), nil
	}
}
