package logger

import (
	"regexp"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	// Regex matching Bearer authentication tokens
	bearerRegex = regexp.MustCompile(`(?i)\bBearer\s+[^'"\s,;]+`)

	// Regex matching Basic authentication credentials
	basicAuthRegex = regexp.MustCompile(`(?i)\bBasic\s+[A-Za-z0-9+/=]{8,}`)

	// Regex matching standard JWT tokens (header.payload.signature)
	jwtRegex = regexp.MustCompile(`\bey[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b`)

	// Regex matching passwords/secrets/API keys in JSON, key-value pairs, or config strings
	keyValueSecretRegex = regexp.MustCompile(`(?i)(['"](?:token|api[_-]?key|client[_-]?secret|jwt[_-]?secret|password|private[_-]?key|totp[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token)['"]\s*[:=]\s*['"]?|(?:\bapi[_-]?key|\bclient[_-]?secret|\bjwt[_-]?secret|\bpassword|\bprivate[_-]?key|\btotp[_-]?secret|\baccess[_-]?token|\brefresh[_-]?token|\bauth[_-]?token)\s*[:=]\s*['"]?)[^'"\s,;&]+(['"]?)`)

	// Regex matching sensitive query parameters in URLs (e.g. ?token=... or &api_key=...)
	queryParamsRegex = regexp.MustCompile(`(?i)([?&](?:token|key|api_key|secret|password)=)[^&#\s]+`)

	// Regex matching credentials embedded in URLs (e.g. postgres://user:pass@host/db or redis://:pass@host)
	urlCredentialsRegex = regexp.MustCompile(`([a-zA-Z0-9+.-]+://[^:]+:)([^@]+)(@)`)
)

// SensitiveHeaderKeys contains header and key names that must always be redacted.
var sensitiveKeys = map[string]struct{}{
	"authorization":     {},
	"cookie":            {},
	"set-cookie":        {},
	"x-api-key":         {},
	"x-privatekey":      {},
	"x-private-key":     {},
	"x-auth-token":      {},
	"api_key":           {},
	"apikey":            {},
	"private_key":       {},
	"privatekey":        {},
	"password":          {},
	"secret":            {},
	"jwt":               {},
	"jwt_secret":        {},
	"jwtsecret":         {},
	"token":             {},
	"totp_secret":       {},
	"totp":              {},
	"angel_api_key":     {},
	"angel_password":    {},
	"angel_totp_secret": {},
	"client_secret":     {},
}

// IsSensitiveKey returns true if a field key is considered sensitive.
func IsSensitiveKey(key string) bool {
	norm := strings.ToLower(strings.TrimSpace(key))
	if _, ok := sensitiveKeys[norm]; ok {
		return true
	}
	if strings.HasSuffix(norm, "_secret") || strings.HasSuffix(norm, "_password") ||
		strings.HasSuffix(norm, "_token") || strings.HasSuffix(norm, "_apikey") ||
		strings.HasSuffix(norm, "_privatekey") {
		return true
	}
	return false
}

// SanitizeText scrubs JWT tokens, Bearer headers, passwords, and API keys from a text string.
func SanitizeText(text string) string {
	if text == "" {
		return ""
	}
	s := bearerRegex.ReplaceAllString(text, "Bearer [REDACTED]")
	s = basicAuthRegex.ReplaceAllString(s, "Basic [REDACTED]")
	s = jwtRegex.ReplaceAllString(s, "[REDACTED_JWT]")
	s = keyValueSecretRegex.ReplaceAllString(s, "${1}[REDACTED]${2}")
	s = queryParamsRegex.ReplaceAllString(s, "${1}[REDACTED]")
	s = urlCredentialsRegex.ReplaceAllString(s, "${1}[REDACTED]${3}")
	return s
}

// SanitizeField inspects and redacts sensitive field keys or sensitive values.
func SanitizeField(f zapcore.Field) zapcore.Field {
	if IsSensitiveKey(f.Key) {
		return zap.String(f.Key, "[REDACTED]")
	}
	if f.Type == zapcore.StringType {
		f.String = SanitizeText(f.String)
	}
	return f
}

// SanitizingCore wraps an underlying zapcore.Core and ensures all emitted log entries
// and fields are strictly scrubbed of secrets, JWTs, and sensitive headers.
type SanitizingCore struct {
	zapcore.Core
}

// NewSanitizingCore wraps an existing zapcore.Core.
func NewSanitizingCore(core zapcore.Core) zapcore.Core {
	return &SanitizingCore{Core: core}
}

func (c *SanitizingCore) With(fields []zapcore.Field) zapcore.Core {
	sanitized := make([]zapcore.Field, len(fields))
	for i, f := range fields {
		sanitized[i] = SanitizeField(f)
	}
	return &SanitizingCore{Core: c.Core.With(sanitized)}
}

func (c *SanitizingCore) Check(entry zapcore.Entry, ce *zapcore.CheckedEntry) *zapcore.CheckedEntry {
	if c.Enabled(entry.Level) {
		return ce.AddCore(entry, c)
	}
	return ce
}

func (c *SanitizingCore) Write(entry zapcore.Entry, fields []zapcore.Field) error {
	entry.Message = SanitizeText(entry.Message)
	sanitized := make([]zapcore.Field, len(fields))
	for i, f := range fields {
		sanitized[i] = SanitizeField(f)
	}
	return c.Core.Write(entry, sanitized)
}
