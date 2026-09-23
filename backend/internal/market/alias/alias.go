package alias

import (
	"context"
	"encoding/json"
	"os"
	"sort"
	"strings"
	"sync"

	"github.com/redis/go-redis/v9"
)

var defaultAliases = map[string]string{
	"ZOMATO":     "ETERNAL",
	"TATAMOTORS": "TMPV",
	"LTI":        "LTIM",
	"MINDTREE":   "LTIM",
}

// Manager maintains dynamic symbol alias mappings with thread-safety.
type Manager struct {
	mu      sync.RWMutex
	aliases map[string]string
}

var globalManager = NewManager()

func init() {
	// Auto-discover configuration from environment or standard JSON file
	_ = globalManager.LoadFromEnv()
	_ = globalManager.loadFromStandardFile()
}

// NewManager initializes a new alias Manager seeded with default canonical aliases.
func NewManager() *Manager {
	m := &Manager{
		aliases: make(map[string]string),
	}
	m.ResetToDefaults()
	return m
}

// CleanSymbol normalizes a symbol by stripping common segment suffixes and whitespace.
func CleanSymbol(s string) string {
	clean := strings.ToUpper(strings.TrimSpace(s))
	clean = strings.TrimSuffix(clean, "-EQ")
	clean = strings.TrimSuffix(clean, "-BE")
	clean = strings.TrimSuffix(clean, "-SM")
	return clean
}

// ResetToDefaults resets the alias map back to the built-in defaults.
func (m *Manager) ResetToDefaults() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.aliases = make(map[string]string, len(defaultAliases))
	for k, v := range defaultAliases {
		m.aliases[CleanSymbol(k)] = CleanSymbol(v)
	}
}

// ResolveCanonicalSymbol returns the canonical corporate symbol for the given input symbol.
// e.g. "ZOMATO" -> "ETERNAL", "ZOMATO-EQ" -> "ETERNAL", "TATAMOTORS" -> "TMPV", "PRAJIND-EQ" -> "PRAJIND".
func (m *Manager) ResolveCanonicalSymbol(symbol string) string {
	clean := CleanSymbol(symbol)
	if clean == "" {
		return ""
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	if target, ok := m.aliases[clean]; ok && target != "" {
		return target
	}
	return clean
}

// GetAliases returns all alias symbols that map to the specified canonical symbol.
// e.g. "ETERNAL" -> ["ZOMATO"], "TMPV" -> ["TATAMOTORS"].
func (m *Manager) GetAliases(canonicalSymbol string) []string {
	clean := CleanSymbol(canonicalSymbol)
	if clean == "" {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []string
	for a, t := range m.aliases {
		if t == clean && a != clean {
			result = append(result, a)
		}
	}
	sort.Strings(result)
	return result
}

// GetAllAliases returns a snapshot of all active alias -> target mappings.
func (m *Manager) GetAllAliases() map[string]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	copied := make(map[string]string, len(m.aliases))
	for k, v := range m.aliases {
		copied[k] = v
	}
	return copied
}

// SetAlias registers or updates a single alias-to-target mapping.
func (m *Manager) SetAlias(alias, target string) {
	aliasClean := CleanSymbol(alias)
	targetClean := CleanSymbol(target)
	if aliasClean == "" || targetClean == "" || aliasClean == targetClean {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.aliases[aliasClean] = targetClean
}

// SetAliases bulk updates mappings.
func (m *Manager) SetAliases(mappings map[string]string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, v := range mappings {
		aliasClean := CleanSymbol(k)
		targetClean := CleanSymbol(v)
		if aliasClean != "" && targetClean != "" && aliasClean != targetClean {
			m.aliases[aliasClean] = targetClean
		}
	}
}

// LoadFromFile reads aliases from a JSON file.
// Supports both a raw map: {"ZOMATO": "ETERNAL"}
// and an envelope: {"aliases": {"ZOMATO": "ETERNAL"}}.
func (m *Manager) LoadFromFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	parsed := parseDynamicMap(raw)
	if len(parsed) > 0 {
		m.SetAliases(parsed)
	}
	return nil
}

// LoadFromEnv parses the SYMBOL_ALIASES environment variable.
// Supports JSON: SYMBOL_ALIASES='{"ZOMATO":"ETERNAL"}'
// Supports CSV:  SYMBOL_ALIASES="ZOMATO:ETERNAL,TATAMOTORS:TMPV"
func (m *Manager) LoadFromEnv() error {
	val := strings.TrimSpace(os.Getenv("SYMBOL_ALIASES"))
	if val == "" {
		return nil
	}
	// Try JSON first
	if strings.HasPrefix(val, "{") {
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(val), &raw); err == nil {
			parsed := parseDynamicMap(raw)
			if len(parsed) > 0 {
				m.SetAliases(parsed)
				return nil
			}
		}
	}
	// Fall back to CSV pairs: "ALIAS:TARGET,ALIAS2:TARGET2"
	parsed := parseCSVPairs(val)
	if len(parsed) > 0 {
		m.SetAliases(parsed)
	}
	return nil
}

// LoadFromRedis reads runtime dynamic aliases from Redis hash "market:symbol_aliases".
func (m *Manager) LoadFromRedis(ctx context.Context, client redis.Cmdable) error {
	if client == nil {
		return nil
	}
	res, err := client.HGetAll(ctx, "market:symbol_aliases").Result()
	if err != nil {
		return err
	}
	if len(res) > 0 {
		m.SetAliases(res)
	}
	return nil
}

func (m *Manager) loadFromStandardFile() error {
	paths := []string{
		os.Getenv("SYMBOL_ALIASES_FILE"),
		os.Getenv("SYMBOL_ALIASES_PATH"),
		"./symbol_aliases.json",
		"../python-services/market-worker/symbol_aliases.json",
		"../../python-services/market-worker/symbol_aliases.json",
	}
	for _, p := range paths {
		if p == "" {
			continue
		}
		if _, err := os.Stat(p); err == nil {
			if err := m.LoadFromFile(p); err == nil {
				return nil
			}
		}
	}
	return nil
}

func parseDynamicMap(raw map[string]interface{}) map[string]string {
	result := make(map[string]string)
	// Check for nested "aliases" envelope
	if nested, ok := raw["aliases"].(map[string]interface{}); ok {
		for k, v := range nested {
			if strVal, ok := v.(string); ok {
				result[k] = strVal
			}
		}
		return result
	}
	for k, v := range raw {
		if strVal, ok := v.(string); ok {
			result[k] = strVal
		}
	}
	return result
}

func parseCSVPairs(s string) map[string]string {
	result := make(map[string]string)
	pairs := strings.Split(s, ",")
	for _, pair := range pairs {
		parts := strings.Split(pair, ":")
		if len(parts) == 2 {
			k := strings.TrimSpace(parts[0])
			v := strings.TrimSpace(parts[1])
			if k != "" && v != "" {
				result[k] = v
			}
		}
	}
	return result
}

// Global convenience wrappers
func ResolveCanonicalSymbol(symbol string) string {
	return globalManager.ResolveCanonicalSymbol(symbol)
}

func GetAliases(canonicalSymbol string) []string {
	return globalManager.GetAliases(canonicalSymbol)
}

func GetAllAliases() map[string]string {
	return globalManager.GetAllAliases()
}

func SetAlias(alias, target string) {
	globalManager.SetAlias(alias, target)
}

func LoadFromFile(path string) error {
	return globalManager.LoadFromFile(path)
}

func LoadFromEnv() error {
	return globalManager.LoadFromEnv()
}

func LoadFromRedis(ctx context.Context, client redis.Cmdable) error {
	return globalManager.LoadFromRedis(ctx, client)
}

func ResetToDefaults() {
	globalManager.ResetToDefaults()
}

func DefaultManager() *Manager {
	return globalManager
}
