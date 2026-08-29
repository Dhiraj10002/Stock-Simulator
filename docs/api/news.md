# News sentiment

The News Worker fetches a configurable public RSS feed every ten minutes and
stores the latest temporary articles in Redis. It scores financial headline
words with a transparent lexicon and labels each article `POSITIVE`, `NEUTRAL`,
or `NEGATIVE`.

The backend exposes the cached results through:

```text
GET /api/v1/news?limit=20
GET /api/v1/news?symbol=RELIANCE
```

Each result contains a title, external source URL, publisher, published time,
sentiment label, score, and recognised project symbols. Sentiment is an
educational indicator only; it must not be treated as a trading signal or
financial advice.

The default RSS feed is Google News search for Indian stock-market news. Change
the worker environment variables in `docker-compose.yml` if you want a
different public RSS source:

```env
NEWS_RSS_URL=https://news.google.com/rss/search?q=Indian+stock+market&hl=en-IN&gl=IN&ceid=IN:en
NEWS_POLL_INTERVAL_SECONDS=600
```
