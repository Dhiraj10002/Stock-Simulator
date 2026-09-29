package config

import (
	"fmt"
	"strings"
)

// Length and placeholder checks prevent common configuration mistakes; they
// cannot prove entropy. Operators must generate secrets with a secure RNG.
func validateJWTSecret(secret string) error {
	invalid := func() error {
		return fmt.Errorf("JWT_SECRET must be a non-placeholder secret of at least 32 bytes; generate one with openssl rand -hex 32")
	}
	if len(secret) < 32 || strings.TrimSpace(secret) != secret {
		return invalid()
	}
	normalized := strings.NewReplacer("_", "", "-", "", " ", "").Replace(strings.ToLower(secret))
	for _, marker := range []string{"changethis", "changeme", "replacewith", "yoursecret", "generatesecure", "placeholder"} {
		if strings.Contains(normalized, marker) {
			return invalid()
		}
	}
	if strings.Trim(secret, string(secret[0])) == "" {
		return invalid()
	}
	return nil
}
