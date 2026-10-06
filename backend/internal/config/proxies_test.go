package config

import (
	"reflect"
	"testing"
)

func TestTrustedProxyConfiguration(t *testing.T) {
	for _, value := range []string{"", "   "} {
		proxies, err := parseTrustedProxies(value)
		if err != nil || proxies != nil {
			t.Fatalf("unset allowlist must trust nobody: %v, %v", proxies, err)
		}
	}
	proxies, err := parseTrustedProxies(" 172.30.250.2, 127.0.0.1/32, ::1, fd00::/64 ")
	want := []string{"172.30.250.2", "127.0.0.1/32", "::1", "fd00::/64"}
	if err != nil || !reflect.DeepEqual(proxies, want) {
		t.Fatalf("bounded allowlist: got %v, %v", proxies, err)
	}
	for _, value := range []string{"*", "0.0.0.0/0", "::/0", "::ffff:0.0.0.0/96", "caddy", "https://proxy.example.com", "172.30.250.2,", "127.0.0.1,,::1", "172.30.250.2/33"} {
		if _, err := parseTrustedProxies(value); err == nil {
			t.Errorf("unsafe or malformed allowlist accepted: %q", value)
		}
	}
}

func TestLoadTrustedProxiesFromEnvironment(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://unused/test")
	t.Setenv("JWT_SECRET", testSigningSecret)
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com")
	t.Setenv("TRUSTED_PROXIES", "172.30.250.2")
	cfg, err := Load()
	if err != nil || cfg == nil || !reflect.DeepEqual(cfg.TrustedProxies, []string{"172.30.250.2"}) {
		t.Fatalf("gateway configuration not loaded: %v", err)
	}
	t.Setenv("TRUSTED_PROXIES", "0.0.0.0/0")
	if _, err := Load(); err == nil {
		t.Fatal("Load accepted an internet-wide proxy boundary")
	}
}
