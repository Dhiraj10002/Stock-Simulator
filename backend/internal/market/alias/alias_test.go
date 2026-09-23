package alias

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestAlias_DefaultResolution(t *testing.T) {
	mgr := NewManager()

	tests := []struct {
		input    string
		expected string
	}{
		{"ZOMATO", "ETERNAL"},
		{"ZOMATO-EQ", "ETERNAL"},
		{"zomato", "ETERNAL"},
		{"ETERNAL", "ETERNAL"},
		{"ETERNAL-EQ", "ETERNAL"},
		{"TATAMOTORS", "TMPV"},
		{"TATAMOTORS-EQ", "TMPV"},
		{"TMPV", "TMPV"},
		{"TMPV-EQ", "TMPV"},
		{"PRAJIND", "PRAJIND"},
		{"PRAJIND-EQ", "PRAJIND"},
		{"LTI", "LTIM"},
		{"MINDTREE", "LTIM"},
		{"RELIANCE", "RELIANCE"},
		{"UNKNOWN_SYMBOL", "UNKNOWN_SYMBOL"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := mgr.ResolveCanonicalSymbol(tt.input)
			if got != tt.expected {
				t.Errorf("ResolveCanonicalSymbol(%q) = %q; want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestAlias_GetAliases(t *testing.T) {
	mgr := NewManager()

	zomatoAliases := mgr.GetAliases("ETERNAL")
	if len(zomatoAliases) == 0 || zomatoAliases[0] != "ZOMATO" {
		t.Fatalf("expected ['ZOMATO'] for ETERNAL, got %v", zomatoAliases)
	}

	tmpvAliases := mgr.GetAliases("TMPV")
	if len(tmpvAliases) == 0 || tmpvAliases[0] != "TATAMOTORS" {
		t.Fatalf("expected ['TATAMOTORS'] for TMPV, got %v", tmpvAliases)
	}

	none := mgr.GetAliases("PRAJIND")
	if len(none) != 0 {
		t.Fatalf("expected empty aliases for PRAJIND, got %v", none)
	}
}

func TestAlias_LoadFromFile(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "custom_aliases.json")

	content := `{
		"CUSTOM_MERGER": "MERGED_TARGET",
		"SUBSIDIARY": "PARENT_CO"
	}`
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}

	mgr := NewManager()
	if err := mgr.LoadFromFile(filePath); err != nil {
		t.Fatalf("LoadFromFile failed: %v", err)
	}

	if got := mgr.ResolveCanonicalSymbol("CUSTOM_MERGER"); got != "MERGED_TARGET" {
		t.Fatalf("expected MERGED_TARGET, got %q", got)
	}
	if got := mgr.ResolveCanonicalSymbol("SUBSIDIARY"); got != "PARENT_CO" {
		t.Fatalf("expected PARENT_CO, got %q", got)
	}
	// Defaults still present
	if got := mgr.ResolveCanonicalSymbol("ZOMATO"); got != "ETERNAL" {
		t.Fatalf("expected ETERNAL, got %q", got)
	}
}

func TestAlias_LoadFromFileWithEnvelope(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "envelope_aliases.json")

	content := `{
		"aliases": {
			"NESTED_ALIAS": "NESTED_CANONICAL"
		}
	}`
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}

	mgr := NewManager()
	if err := mgr.LoadFromFile(filePath); err != nil {
		t.Fatalf("LoadFromFile failed: %v", err)
	}

	if got := mgr.ResolveCanonicalSymbol("NESTED_ALIAS"); got != "NESTED_CANONICAL" {
		t.Fatalf("expected NESTED_CANONICAL, got %q", got)
	}
}

func TestAlias_LoadFromEnvCSV(t *testing.T) {
	os.Setenv("SYMBOL_ALIASES", "CSV_ALIAS1:TARGET1,CSV_ALIAS2:TARGET2")
	defer os.Unsetenv("SYMBOL_ALIASES")

	mgr := NewManager()
	if err := mgr.LoadFromEnv(); err != nil {
		t.Fatalf("LoadFromEnv failed: %v", err)
	}

	if got := mgr.ResolveCanonicalSymbol("CSV_ALIAS1"); got != "TARGET1" {
		t.Fatalf("expected TARGET1, got %q", got)
	}
	if got := mgr.ResolveCanonicalSymbol("CSV_ALIAS2"); got != "TARGET2" {
		t.Fatalf("expected TARGET2, got %q", got)
	}
}

func TestAlias_LoadFromEnvJSON(t *testing.T) {
	os.Setenv("SYMBOL_ALIASES", `{"ENV_JSON_ALIAS": "ENV_JSON_TARGET"}`)
	defer os.Unsetenv("SYMBOL_ALIASES")

	mgr := NewManager()
	if err := mgr.LoadFromEnv(); err != nil {
		t.Fatalf("LoadFromEnv failed: %v", err)
	}

	if got := mgr.ResolveCanonicalSymbol("ENV_JSON_ALIAS"); got != "ENV_JSON_TARGET" {
		t.Fatalf("expected ENV_JSON_TARGET, got %q", got)
	}
}

func TestAlias_DynamicRuntimeUpdatesWithoutCodeEdit(t *testing.T) {
	mgr := NewManager()

	// Initially unknown
	if got := mgr.ResolveCanonicalSymbol("NEW_CORP"); got != "NEW_CORP" {
		t.Fatalf("expected NEW_CORP before update, got %q", got)
	}

	// Update dynamically at runtime
	mgr.SetAlias("NEW_CORP", "CANONICAL_CORP")

	if got := mgr.ResolveCanonicalSymbol("NEW_CORP"); got != "CANONICAL_CORP" {
		t.Fatalf("expected CANONICAL_CORP after update, got %q", got)
	}
	if got := mgr.ResolveCanonicalSymbol("NEW_CORP-EQ"); got != "CANONICAL_CORP" {
		t.Fatalf("expected CANONICAL_CORP for -EQ suffix, got %q", got)
	}

	// Reverse lookup reflects dynamic update
	aliases := mgr.GetAliases("CANONICAL_CORP")
	if len(aliases) != 1 || aliases[0] != "NEW_CORP" {
		t.Fatalf("expected ['NEW_CORP'], got %v", aliases)
	}

	// Bulk updates via map (like Redis HGetAll returns)
	mgr.SetAliases(map[string]string{
		"BULK_A": "TARGET_A",
		"BULK_B": "TARGET_B",
	})
	if got := mgr.ResolveCanonicalSymbol("BULK_A"); got != "TARGET_A" {
		t.Fatalf("expected TARGET_A, got %q", got)
	}
	if got := mgr.ResolveCanonicalSymbol("BULK_B"); got != "TARGET_B" {
		t.Fatalf("expected TARGET_B, got %q", got)
	}
}

func TestAlias_LoadFromRedisNilSafe(t *testing.T) {
	mgr := NewManager()
	if err := mgr.LoadFromRedis(context.Background(), nil); err != nil {
		t.Fatalf("expected nil error for nil redis client, got %v", err)
	}
}
