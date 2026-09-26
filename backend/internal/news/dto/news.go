package dto

type ArticleResponse struct {
	Title       string   `json:"title"`
	URL         string   `json:"url"`
	Source      string   `json:"source"`
	PublishedAt string   `json:"published_at"`
	Sentiment   string   `json:"sentiment"`
	Score       int      `json:"score"`
	Symbols     []string `json:"symbols"`
	Sectors     []string `json:"sectors,omitempty"`
}
