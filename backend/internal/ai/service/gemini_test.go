package service

import (
	"context"
	"encoding/json"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"io"
	"math"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
)

type geminiTransport func(*http.Request) (*http.Response, error)

func (f geminiTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func withGeminiResponse(status int, body string) *MentorService {
	svc := New(&config.Config{GeminiAPIKey: "test-secret", GeminiModel: " models/gemini-3.7-flash "})
	svc.client = &http.Client{Transport: geminiTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	return svc
}
func TestGeminiRequestAndMultipartResponse(t *testing.T) {
	svc := withGeminiResponse(200, "")
	svc.client.Transport = geminiTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent" {
			t.Fatal(r.URL.String())
		}
		if r.Header.Get("x-goog-api-key") != "test-secret" || r.URL.RawQuery != "" {
			t.Fatal("authentication must stay in header")
		}
		var payload map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["systemInstruction"] == nil || payload["generationConfig"] == nil {
			t.Fatalf("wrong REST shape: %v", payload)
		}
		if !strings.Contains(string(payload["generationConfig"]), `"thinkingLevel":"low"`) {
			t.Fatal("unbounded thinking")
		}
		if _, ok := r.Context().Deadline(); !ok {
			t.Fatal("missing request deadline")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"private thought","thought":true},{"text":"First answer"},{"text":"Second answer"}]}}]}`))}, nil
	})
	answer := svc.AnalyzeDetailed(context.Background(), "", "Explain margin")
	if answer.Source != "gemini" || answer.Answer != "First answer\nSecond answer" || answer.FallbackReason != "" {
		t.Fatalf("unexpected answer: %+v", answer)
	}
}
func TestGeminiFailuresAreExplicitAndSanitized(t *testing.T) {
	tests := []struct {
		status       int
		body, reason string
	}{
		{400, "secret-response", "request_rejected"}, {403, "secret-response", "authentication_failed"},
		{404, "secret-response", "model_unavailable"}, {429, "secret-response", "rate_limited"},
		{503, "secret-response", "provider_unavailable"}, {200, "bad-json", "invalid_response"},
		{200, `{"candidates":[]}`, "empty_response"},
		{200, `{"promptFeedback":{"blockReason":"SAFETY"}}`, "blocked"},
		{200, `{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"unfinished"}]}}]}`, "incomplete_response"},
	}
	for _, test := range tests {
		t.Run(test.reason, func(t *testing.T) {
			result := withGeminiResponse(test.status, test.body).AnalyzeDetailed(context.Background(), "", "stocks")
			encoded, _ := json.Marshal(result)
			if result.Source != "rule_based" || result.FallbackReason != test.reason {
				t.Fatalf("unexpected result: %+v", result)
			}
			if strings.Contains(string(encoded), "secret") || strings.Contains(string(encoded), "unfinished") {
				t.Fatal("provider content leaked")
			}
			if !strings.Contains(result.Answer, "Explore stocks") {
				t.Fatal("stock intent lost")
			}
		})
	}
}
func TestMissingConfigurationAndCancellation(t *testing.T) {
	result := New(&config.Config{}).AnalyzeDetailed(context.Background(), "", "stocks")
	if result.FallbackReason != "not_configured" || strings.Contains(result.Answer, "10,00,000") {
		t.Fatalf("invented context or hidden configuration failure: %+v", result)
	}
	svc := withGeminiResponse(200, "")
	svc.client.Transport = geminiTransport(func(r *http.Request) (*http.Response, error) { return nil, r.Context().Err() })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if result := svc.AnalyzeDetailed(ctx, "", "stocks"); result.FallbackReason != "timeout" {
		t.Fatalf("unexpected result: %+v", result)
	}
}
func TestFallbackDoesNotInventMarketFactsOrGuarantees(t *testing.T) {
	svc := New(&config.Config{})
	account := UserAccountContext{Available: true, TopSymbol: "TCS-EQ", ConcentrationRatio: 82.4}
	for _, question := range []string{"stocks", "suggest me stocks", "portfolio risk", "hedge my TCS", "news today", "FNO expiry", "MIS square-off"} {
		answer := svc.generateRuleBasedAnswerWithContext("", question, account)
		for _, forbidden := range []string{"consistent premium income", "defending support", "on Thursdays", "NIFTY 50 units", "exactly 15:20", "caps downward portfolio losses"} {
			if strings.Contains(answer, forbidden) {
				t.Fatalf("%s invented %s", question, forbidden)
			}
		}
	}
	risk := svc.generateRuleBasedAnswerWithContext("", "portfolio risk", account)
	if !strings.Contains(risk, "82.4% of gross open-position marked value") || !strings.Contains(risk, "excluding cash") {
		t.Fatal(risk)
	}
}

func TestAccountSnapshotAndAuditReadActualRecords(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "copilot.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	// UUID defaults are PostgreSQL-specific; an explicit minimal test schema
	// exercises the real queries without changing production model metadata.
	for _, statement := range []string{
		"CREATE TABLE wallets (id INTEGER PRIMARY KEY, uuid TEXT, user_uuid TEXT, cash_balance_paise INTEGER, blocked_paise INTEGER)",
		"CREATE TABLE positions (id INTEGER PRIMARY KEY, uuid TEXT, user_uuid TEXT, symbol TEXT, product TEXT, quantity INTEGER, average_price_paise INTEGER, current_price_paise INTEGER, realized_pnl_paise INTEGER)",
		"CREATE TABLE orders (id INTEGER PRIMARY KEY, uuid TEXT, user_uuid TEXT, symbol TEXT, product TEXT, type TEXT, quantity INTEGER, price_paise INTEGER, status TEXT, created_at DATETIME)",
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	previous := database.GetDB()
	database.SetDBForTesting(db)
	t.Cleanup(func() { database.SetDBForTesting(previous) })
	user := uuid.New()
	if err := db.Exec("INSERT INTO wallets(user_uuid,cash_balance_paise,blocked_paise) VALUES(?,?,?)", user, 69364500, 0).Error; err != nil {
		t.Fatal(err)
	}
	for _, position := range []model.Position{{Symbol: "TCS-EQ", Quantity: 1, CurrentPricePaise: 82400}, {Symbol: "OTHER-EQ", Quantity: 1, CurrentPricePaise: 17600}} {
		if err := db.Exec("INSERT INTO positions(user_uuid,symbol,product,quantity,average_price_paise,current_price_paise,realized_pnl_paise) VALUES(?,?,?,?,?,?,?)", user, position.Symbol, "DELIVERY", position.Quantity, position.CurrentPricePaise, position.CurrentPricePaise, 0).Error; err != nil {
			t.Fatal(err)
		}
	}
	service := New(&config.Config{})
	snapshot := service.fetchUserAccountContext(user.String())
	if !snapshot.Available || snapshot.AvailableBalancePaise != 69364500 || math.Abs(snapshot.ConcentrationRatio-82.4) > 0.001 {
		t.Fatalf("wrong snapshot: %+v", snapshot)
	}
	// Real records must reach Gemini with distinct cash/margin and concentration
	// denominators, so zero blocked funds cannot be presented as zero market risk.
	svc := withGeminiResponse(200, "")
	svc.client.Transport = geminiTransport(func(r *http.Request) (*http.Response, error) {
		var request geminiRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		prompt := request.Contents[0].Parts[0].Text
		for _, fact := range []string{"Available cash: ₹693645.00", "Blocked margin: ₹0.00", "82.4% in TCS-EQ", "excludes cash; not account-equity allocation", "virtual money and simulated holdings", "not invested-capital utilization or a risk score"} {
			if !strings.Contains(prompt, fact) {
				t.Fatalf("missing account context %q in %s", fact, prompt)
			}
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"Stored marks may be stale."}]}}]}`))}, nil
	})
	if answer := svc.AnalyzeDetailed(context.Background(), user.String(), "Analyze my portfolio"); answer.Source != "gemini" {
		t.Fatalf("unexpected fallback: %+v", answer)
	}
	audit, err := service.Critique(context.Background(), user.String())
	if err != nil {
		t.Fatal(err)
	}
	if audit.Metrics.WinRate != 0 || audit.Metrics.RealizedPositionsEvaluated != 0 || audit.Source != "rule_based" {
		t.Fatalf("invented outcome: %+v", audit)
	}
	if err := db.Exec("DROP TABLE positions").Error; err != nil {
		t.Fatal(err)
	}
	if snapshot := service.fetchUserAccountContext(user.String()); snapshot.Available {
		t.Fatal("failed query was presented as an empty live portfolio")
	}
	if _, err := service.Critique(context.Background(), user.String()); err == nil {
		t.Fatal("failed query produced an audit")
	}
}
