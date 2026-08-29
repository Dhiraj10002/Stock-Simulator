package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
)

const geminiGenerateContentURL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"

type MentorService struct {
	apiKey string
	model  string
	client *http.Client
}

type geminiRequest struct {
	SystemInstruction geminiContent   `json:"system_instruction"`
	Contents          []geminiContent `json:"contents"`
	GenerationConfig  struct {
		MaxOutputTokens int `json:"maxOutputTokens"`
	} `json:"generationConfig"`
}

type geminiContent struct {
	Role  string `json:"role,omitempty"`
	Parts []struct {
		Text string `json:"text"`
	} `json:"parts"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
}

func content(text string) geminiContent {
	item := geminiContent{}
	item.Parts = append(item.Parts, struct {
		Text string `json:"text"`
	}{Text: text})
	return item
}

func New(cfg *config.Config) *MentorService {
	return &MentorService{apiKey: cfg.GeminiAPIKey, model: cfg.GeminiModel, client: &http.Client{Timeout: 30 * time.Second}}
}

func (s *MentorService) Analyze(ctx context.Context, question string) (string, error) {
	if strings.TrimSpace(s.apiKey) == "" {
		return "", fmt.Errorf("AI mentor is not configured; add GEMINI_API_KEY to backend/.env")
	}
	payload := geminiRequest{
		SystemInstruction: content("You are an educational mentor inside a virtual stock simulator. Explain concepts, risks, and trade mechanics clearly. Never promise returns, predict prices with certainty, or provide personalised financial advice. State that the response is educational, not financial advice."),
		Contents:          []geminiContent{{Role: "user", Parts: content(question).Parts}},
	}
	payload.GenerationConfig.MaxOutputTokens = 700
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	url := fmt.Sprintf(geminiGenerateContentURL, s.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", s.apiKey)
	response, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Gemini request failed: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("Gemini returned status %d", response.StatusCode)
	}
	var result geminiResponse
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return "", fmt.Errorf("invalid Gemini response")
	}
	for _, candidate := range result.Candidates {
		for _, part := range candidate.Content.Parts {
			if strings.TrimSpace(part.Text) != "" {
				return part.Text, nil
			}
		}
	}
	return "", fmt.Errorf("Gemini returned no text response")
}
