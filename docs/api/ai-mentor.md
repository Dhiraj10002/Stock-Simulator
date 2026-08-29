# AI Trading Mentor

`POST /api/v1/ai/analyze-trade` is a protected endpoint. It sends an
educational trading question from the frontend to the Go backend. The Go
backend then calls Gemini's Generate Content API; the browser never receives or
stores the Gemini key.

Request:

```json
{"question":"Explain the risk of placing a market buy order versus a limit buy order."}
```

Response:

```json
{"success":true,"data":{"answer":"..."}}
```

Set these only in `backend/.env`, never in `frontend/.env`:

```env
GEMINI_API_KEY=your-secret-key
GEMINI_MODEL=gemini-3.7-flash
```

The mentor is deliberately instructed to provide education and risk context,
not personalised financial advice or promises of returns.
