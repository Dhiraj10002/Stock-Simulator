# Frontend trading UI

The Next.js client now uses the backend contracts directly. Start the backend
and market worker, then start the frontend with `npm run dev` in `frontend/`.

The first screen supports registration and login. On login, access and refresh
tokens are saved in browser local storage and the protected API calls include
the access token as `Authorization: Bearer <token>`.

Available screens are Dashboard, Market, Orders, Portfolio, Wallet, and
Profile. The market screen includes the live chart and an order form. All money
values received in paise are displayed in rupees.

Set these public variables when services are not on their local defaults:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws/market
```
