import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const secure = process.env.NODE_ENV === "production";
const accessName = secure ? "__Host-stocksim_access" : "stocksim_access";
const refreshName = secure ? "__Host-stocksim_refresh" : "stocksim_refresh";
const markerName = "stocksim_session";
const allowed = new Set(["account", "auth", "wallet", "portfolio", "orders", "trades", "watchlist", "reports", "simulation", "analytics", "ai", "risk"]);
const cookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
const maxBody = 1024 * 1024;

function reply(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
}
function failure(status: number, message: string) { return reply({ success: false, message }, status); }
function clear(response: NextResponse) {
  for (const name of [accessName, refreshName, markerName]) response.cookies.set(name, "", { ...cookieOptions, httpOnly: name !== markerName, maxAge: 0 });
}
async function boundedBody(request: NextRequest) {
  if (Number(request.headers.get("content-length")) > maxBody) throw new Error("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBody) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!allowed.has(path[0]) || path.some(part => !/^[a-zA-Z0-9._&+-]+$/.test(part) || part === "." || part === "..")) return failure(404, "Endpoint not found");
  const endpoint = path.join("/");
  const accountStream = endpoint === "account/events";
  if (path[0] === "account" && !accountStream) return failure(404, "Endpoint not found");
  if (accountStream && request.method !== "GET") return failure(405, "Method not allowed");
  const authWrite = ["auth/register", "auth/login", "auth/refresh", "auth/logout"].includes(endpoint);
  if (path[0] === "auth" && endpoint !== "auth/me" && !authWrite) return failure(404, "Endpoint not found");
  if (authWrite && request.method !== "POST") return failure(405, "Method not allowed");
  if (!["GET", "HEAD"].includes(request.method)) {
    // SameSite is complemented by an exact origin check and a non-simple header.
    if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("x-requested-with") !== "stocksim") return failure(403, "Cross-site request rejected");
  }
  const secret = process.env.BACKEND_PROXY_SECRET || "";
  if (secure && secret.length < 32) { const response = failure(503, "Secure session gateway is not configured"); if (endpoint === "auth/logout") clear(response); return response; }
  let base: URL;
  try {
    base = new URL(process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1");
    if (base.username || base.password || base.search || base.hash || (secure && base.protocol !== "https:")) throw new Error("invalid backend");
    if (!base.pathname.endsWith("/api/v1")) base.pathname = base.pathname.replace(/\/$/, "") + "/api/v1";
  } catch { return failure(503, "Backend gateway is not configured"); }
  const access = request.cookies.get(accessName)?.value;
  const refresh = request.cookies.get(refreshName)?.value;
  if (!authWrite && !access) { const response = failure(401, "Please sign in"); if (!refresh) clear(response); return response; }
  if (endpoint === "auth/refresh" && !refresh) { const response = failure(401, "Session expired"); clear(response); return response; }
  const headers = new Headers({ Accept: accountStream ? "text/event-stream" : "application/json" });
  if (access && !authWrite) headers.set("Authorization", `Bearer ${access}`);
  for (const name of ["idempotency-key", "x-request-id"]) {
    const value = request.headers.get(name);
    if (value && value.length <= 128) headers.set(name, value);
  }
  if (secret) {
    headers.set("X-Frontend-Proxy-Secret", secret);
    // Only Vercel's overwritten header is trusted. Local deployments use the peer IP.
    const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() : null;
    if (ip) headers.set("X-Frontend-Client-IP", ip);
  }
  let body: string | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    try { body = await boundedBody(request); } catch { return failure(413, "Request body too large"); }
    if (endpoint === "auth/refresh" || endpoint === "auth/logout") {
      body = JSON.stringify({ refresh_token: refresh || "" });
      if (refresh && endpoint === "auth/refresh") headers.set("Idempotency-Key", createHmac("sha256", secret || "development-only").update(refresh).digest("hex"));
    }
    if (body) headers.set("Content-Type", "application/json");
  }
  if (endpoint === "auth/logout" && !refresh) { const response = reply({ success: true, data: null }, 200); clear(response); return response; }
  try {
    const upstream = await fetch(`${base.toString().replace(/\/$/, "")}/${path.map(part => encodeURIComponent(part)).join("/")}${request.nextUrl.search}`, {
      method: request.method, headers, body, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(accountStream ? 55000 : endpoint.startsWith("ai/") ? 45000 : 20000)]),
    });
    if (accountStream && upstream.ok) {
      if (!upstream.body || !upstream.headers.get("content-type")?.startsWith("text/event-stream")) return failure(502, "Invalid account stream");
      return new NextResponse(upstream.body, { headers: {
        "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store",
        "Vary": "Cookie", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff",
      } });
    }
    if (accountStream && !upstream.ok) return failure(upstream.status, "Account updates temporarily unavailable");
    const payload = await upstream.json();
    if (upstream.ok && (endpoint === "auth/login" || endpoint === "auth/refresh")) {
      const { access_token, refresh_token } = payload.data || {};
      if (typeof access_token !== "string" || typeof refresh_token !== "string") return failure(502, "Invalid session response");
      // The only browser-visible session value is a non-credential cache scope.
      let accountScope = randomUUID() as string;
      try {
        const user = JSON.parse(Buffer.from(access_token.split(".")[1], "base64url").toString("utf8")).user_id;
        if (typeof user === "string" && /^[a-f0-9-]{36}$/i.test(user)) accountScope = user;
      } catch { /* Non-secret fallback; never used for server authorization. */ }
      const marker = endpoint === "auth/refresh" ? request.cookies.get(markerName)?.value || accountScope : accountScope;
      const response = reply({ ...payload, data: { authenticated: true } }, upstream.status);
      response.cookies.set(accessName, access_token, { ...cookieOptions, maxAge: 7 * 86400 });
      response.cookies.set(refreshName, refresh_token, { ...cookieOptions, maxAge: 7 * 86400 });
      response.cookies.set(markerName, marker, { ...cookieOptions, httpOnly: false, maxAge: 7 * 86400 });
      return response;
    }
    const response = reply(payload, upstream.status);
    for (const name of ["x-request-id", "retry-after", "x-ratelimit-remaining"]) { const value = upstream.headers.get(name); if (value) response.headers.set(name, value); }
    if (endpoint === "auth/logout" || (endpoint === "auth/refresh" && !upstream.ok)) clear(response);
    return response;
  } catch {
    // A lost refresh response keeps old cookies and reuses the HMAC retry key.
    const response = failure(502, "Backend temporarily unavailable; retry the same request");
    if (endpoint === "auth/logout") clear(response);
    return response;
  }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
