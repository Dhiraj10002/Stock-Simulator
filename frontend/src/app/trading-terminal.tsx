"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import MarketChart from "./market-chart";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
const money = (paise = 0) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
type Api<T> = { success: boolean; message: string; data: T };
type Wallet = { cash_balance_paise: number; available_balance_paise: number; blocked_paise: number };
type Portfolio = { invested_value_paise: number; current_value_paise: number; unrealized_pnl_paise: number; positions: Position[] };
type Position = { uuid: string; symbol: string; quantity: number; average_price_paise: number; current_price_paise: number; current_value_paise: number; unrealized_pnl_paise: number };
type Order = { uuid: string; symbol: string; side: string; type: string; product: string; quantity: number; price_paise: number; status: string };
type Transaction = { uuid: string; type: string; amount_paise: number; note: string; created_at: string };
type User = { name: string; email: string; uuid: string };
type Page = "dashboard" | "market" | "orders" | "portfolio" | "wallet" | "news" | "mentor" | "profile";
type Article = { title: string; url: string; source: string; published_at: string; sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE"; score: number; symbols: string[] };

async function request<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers } });
  const body = await response.json() as Api<T>;
  if (!response.ok || !body.success) throw new Error(body.message || "Request failed");
  return body.data;
}

export default function TradingTerminal() {
  const [token, setToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async (accessToken: string) => {
    try {
      const [nextUser, nextWallet, nextPortfolio, nextOrders, nextTransactions] = await Promise.all([
        request<User>("/auth/me", accessToken), request<Wallet>("/wallet", accessToken), request<Portfolio>("/portfolio", accessToken), request<Order[]>("/orders", accessToken), request<Transaction[]>("/wallet/transactions", accessToken),
      ]);
      setUser(nextUser); setWallet(nextWallet); setPortfolio(nextPortfolio); setOrders(nextOrders); setTransactions(nextTransactions);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to load account"); }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("stock-simulator-access-token");
    const savedRefresh = localStorage.getItem("stock-simulator-refresh-token");
    const timer = window.setTimeout(() => {
      if (saved) { setToken(saved); setRefreshToken(savedRefresh ?? ""); void loadData(saved); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const signOut = async () => {
    if (refreshToken) { try { await request<null>("/auth/logout", token, { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) }); } catch { /* clear local session even if server session already expired */ } }
    localStorage.removeItem("stock-simulator-access-token"); localStorage.removeItem("stock-simulator-refresh-token"); setToken(""); setUser(null); setNotice("Signed out successfully");
  };

  if (!token) return <Auth onAuthenticated={(access, refresh) => { localStorage.setItem("stock-simulator-access-token", access); localStorage.setItem("stock-simulator-refresh-token", refresh); setToken(access); setRefreshToken(refresh); void loadData(access); }} notice={notice} />;
  const refresh = () => void loadData(token);
  return <main className="terminal"><aside><div className="brand">STOCK<span>SIM</span></div>{(["dashboard", "market", "orders", "portfolio", "wallet", "news", "mentor", "profile"] as Page[]).map((item) => <button key={item} className={page === item ? "nav active" : "nav"} onClick={() => setPage(item)}>{item}</button>)}<button className="nav signout" onClick={signOut}>Sign out</button></aside><section className="content"><header className="topbar"><div><p className="eyebrow">VIRTUAL TRADING</p><h1>{page}</h1></div><div className="account">{user?.name}<small>{user?.email}</small></div></header>{notice && <p className="notice">{notice}</p>}<Screen page={page} wallet={wallet} portfolio={portfolio} orders={orders} transactions={transactions} onRefresh={refresh} token={token} onNotice={setNotice} /></section></main>;
}

function Auth({ onAuthenticated, notice }: { onAuthenticated: (access: string, refresh: string) => void; notice: string }) {
  const [register, setRegister] = useState(false); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); try { if (register) await request<null>("/auth/register", "", { method: "POST", body: JSON.stringify({ name, email, password }) }); const tokens = await request<{ access_token: string; refresh_token: string }>("/auth/login", "", { method: "POST", body: JSON.stringify({ email, password }) }); onAuthenticated(tokens.access_token, tokens.refresh_token); } catch (reason) { setError(reason instanceof Error ? reason.message : "Authentication failed"); } };
  return <main className="auth"><form onSubmit={submit}><p className="eyebrow">STOCK SIMULATOR</p><h1>{register ? "Create account" : "Welcome back"}</h1><p>Practice trading without risking real money.</p>{register && <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />}<input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /><input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />{(error || notice) && <p className="notice">{error || notice}</p>}<button className="primary">{register ? "Register and sign in" : "Sign in"}</button><button type="button" className="link" onClick={() => setRegister(!register)}>{register ? "Already have an account? Sign in" : "New here? Create an account"}</button></form></main>;
}

function Screen({ page, wallet, portfolio, orders, transactions, onRefresh, token, onNotice }: { page: Page; wallet: Wallet | null; portfolio: Portfolio | null; orders: Order[]; transactions: Transaction[]; onRefresh: () => void; token: string; onNotice: (notice: string) => void }) {
  if (page === "dashboard") return <><div className="metrics"><Metric label="Available balance" value={money(wallet?.available_balance_paise)} /><Metric label="Portfolio value" value={money(portfolio?.current_value_paise)} /><Metric label="Unrealized P&L" value={money(portfolio?.unrealized_pnl_paise)} /></div><MarketChart /></>;
  if (page === "market") return <div className="two-column"><MarketChart /><OrderForm wallet={wallet} token={token} onDone={onRefresh} onNotice={onNotice} /></div>;
  if (page === "orders") return <DataTable title="Orders" headings={["Symbol", "Side", "Type", "Quantity", "Price", "Status"]} rows={orders.map((o) => [o.symbol, o.side, o.type, String(o.quantity), money(o.price_paise), o.status])} />;
  if (page === "portfolio") return <><div className="metrics"><Metric label="Invested" value={money(portfolio?.invested_value_paise)} /><Metric label="Current value" value={money(portfolio?.current_value_paise)} /><Metric label="P&L" value={money(portfolio?.unrealized_pnl_paise)} /></div><DataTable title="Positions" headings={["Symbol", "Quantity", "Average", "Current", "Value", "P&L"]} rows={(portfolio?.positions ?? []).map((p) => [p.symbol, String(p.quantity), money(p.average_price_paise), money(p.current_price_paise), money(p.current_value_paise), money(p.unrealized_pnl_paise)])} /></>;
  if (page === "wallet") return <><div className="metrics"><Metric label="Cash balance" value={money(wallet?.cash_balance_paise)} /><Metric label="Available" value={money(wallet?.available_balance_paise)} /><Metric label="Blocked / margin" value={money(wallet?.blocked_paise)} /></div><DataTable title="Transaction history" headings={["Type", "Amount", "Note", "Date"]} rows={transactions.map((t) => [t.type, money(t.amount_paise), t.note, new Date(t.created_at).toLocaleString()])} /></>;
  if (page === "news") return <News token={token} />;
  if (page === "mentor") return <Mentor token={token} />;
  return <section className="panel"><h2>Profile</h2><p>Your account is protected with JWT access and refresh tokens. Use the sidebar to view balances, orders, holdings, and virtual trading activity.</p></section>;
}

function Mentor({ token }: { token: string }) {
  const [question, setQuestion] = useState("Explain the risk of placing a market buy order versus a limit buy order.");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(""); try { const response = await request<{ answer: string }>("/ai/analyze-trade", token, { method: "POST", body: JSON.stringify({ question }) }); setAnswer(response.answer); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to contact AI mentor"); } finally { setLoading(false); } };
  return <section className="panel mentor"><h2>AI Trading Mentor</h2><p>Ask for educational explanations of trade mechanics, risk, market context, or your virtual trading decisions. This is not financial advice.</p><form onSubmit={submit}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} minLength={5} maxLength={2000} /><button className="primary" disabled={loading}>{loading ? "Thinking…" : "Ask mentor"}</button></form>{error && <p className="notice">{error}</p>}{answer && <article className="mentor-answer">{answer}</article>}</section>;
}

function News({ token }: { token: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request<Article[]>(`/news?limit=30${symbol ? `&symbol=${symbol}` : ""}`, token).then((data) => { if (active) setArticles(data); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load news"); });
    return () => { active = false; };
  }, [symbol, token]);
  return <section className="panel news"><div className="news-header"><div><h2>Market news sentiment</h2><p>Automated lexical labels are educational signals, not investment advice.</p></div><select value={symbol} onChange={(event) => setSymbol(event.target.value)}><option value="">All symbols</option><option>RELIANCE</option><option>TCS</option><option>INFY</option><option>HDFCBANK</option></select></div>{error && <p className="notice">{error}</p>}<div className="news-list">{articles.length ? articles.map((article) => <article key={article.url} className="news-item"><span className={`sentiment ${article.sentiment.toLowerCase()}`}>{article.sentiment}</span><div><a href={article.url} target="_blank" rel="noreferrer">{article.title}</a><p>{article.source} · {new Date(article.published_at).toLocaleString()} {article.symbols.length ? `· ${article.symbols.join(", ")}` : ""}</p></div></article>) : <p>No news has been ingested yet. Start the Docker news worker and wait for its first refresh.</p>}</div></section>;
}

function OrderForm({ wallet, token, onDone, onNotice }: { wallet: Wallet | null; token: string; onDone: () => void; onNotice: (notice: string) => void }) {
  const [symbol, setSymbol] = useState("RELIANCE"); const [side, setSide] = useState("BUY"); const [type, setType] = useState("MARKET"); const [product, setProduct] = useState("DELIVERY"); const [quantity, setQuantity] = useState(1); const [price, setPrice] = useState(0);
  const estimated = quantity * price;
  const submit = async (event: FormEvent) => { event.preventDefault(); try { const order = await request<Order>("/orders", token, { method: "POST", body: JSON.stringify({ symbol, side, type, product, quantity, price_paise: type === "LIMIT" ? price : 0 }) }); onNotice(`Order ${order.uuid} created successfully.`); onDone(); } catch (error) { onNotice(error instanceof Error ? error.message : "Unable to create order"); } };
  return <form className="panel order-form" onSubmit={submit}><h2>Buy / Sell order</h2><label>Symbol<select value={symbol} onChange={(e) => setSymbol(e.target.value)}><option>RELIANCE</option><option>TCS</option><option>INFY</option><option>HDFCBANK</option></select></label><div className="split"><label>Side<select value={side} onChange={(e) => setSide(e.target.value)}><option>BUY</option><option>SELL</option></select></label><label>Order type<select value={type} onChange={(e) => setType(e.target.value)}><option>MARKET</option><option>LIMIT</option></select></label></div><div className="split"><label>Quantity<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label><label>Product<select value={product} onChange={(e) => setProduct(e.target.value)}><option>DELIVERY</option><option>INTRADAY</option><option>FNO</option></select></label></div>{type === "LIMIT" && <label>Limit price (paise)<input type="number" min="1" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label>}<p>Estimated amount: <strong>{money(estimated)}</strong></p><p>Available balance: <strong>{money(wallet?.available_balance_paise)}</strong></p><button className="primary">Place {side} order</button></form>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
function DataTable({ title, headings, rows }: { title: string; headings: string[]; rows: string[][] }) { return <section className="panel"><h2>{title}</h2><div className="table-wrap"><table><thead><tr>{headings.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={`${row[0]}-${i}`}>{row.map((cell, j) => <td key={`${cell}-${j}`}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length}>No data yet.</td></tr>}</tbody></table></div></section>; }
