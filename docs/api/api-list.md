POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/wallet
GET    /api/v1/wallet/transactions
POST   /api/v1/wallet/reset

GET    /api/v1/portfolio
GET    /api/v1/portfolio/positions
GET    /api/v1/portfolio/pnl

POST   /api/v1/orders
GET    /api/v1/orders
GET    /api/v1/orders/:id
DELETE /api/v1/orders/:id
POST   /api/v1/orders/:id/execute

`POST /api/v1/orders/:id/execute` accepts no request body. The server fills the
order only from a positive, recent Redis market quote; client-supplied prices
are rejected.

GET    /api/v1/trades

GET    /api/v1/market/quotes/:symbol
GET    /api/v1/market/quotes/:symbol/history
GET    /api/v1/news
WS     /ws/market

GET    /api/v1/stocks
GET    /api/v1/stocks/{symbol}

POST   /api/v1/orders
GET    /api/v1/orders

GET    /api/v1/portfolio

GET    /api/v1/watchlist
POST   /api/v1/watchlist

GET    /api/v1/news

POST   /api/v1/ai/analyze-trade
