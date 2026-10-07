/**
 * Reusable API client helper for Stock Simulator.
 * Handles auth tokens, JSON parsing, and consistent error handling.
 */

import { orderIntentKey, completeOrderIntent } from "./orderIntent";
import { isAccountMutation, notifyAccountMutation } from "./accountSync";
import { getApiUrl } from "./config";

export const API_URL = getApiUrl();

/** Non-secret session scope for UI/query caches. Credentials are HttpOnly cookies. */
export function getAuthToken(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find(value => value.startsWith("stocksim_session="))?.slice("stocksim_session=".length) || "";
}

export function purgeLegacyCredentials(): void {
  if (typeof window === "undefined") return;
  try {
    for (const name of ["auth_token", "stock-simulator-access-token", "refresh_token", "stock-simulator-refresh-token", "auth-refresh-attempt"]) localStorage.removeItem(name);
  } catch { /* Session cookies work even if storage is blocked. */ }
}
export function notifyAuthChanged(): void {
  if (typeof window === "undefined") return;
  purgeLegacyCredentials();
  sessionRevision = crypto.randomUUID();
  try { localStorage.setItem("auth-session-change", sessionRevision); } catch { /* storage may be blocked */ }
  window.dispatchEvent(new Event("auth-changed"));
}
export function clearAuthTokens(): void {
  if (typeof document !== "undefined") document.cookie = "stocksim_session=; Path=/; Max-Age=0; SameSite=Lax";
  notifyAuthChanged();
}
let sessionRevision = "";
function authRevision(): string | null {
  try { return localStorage.getItem("auth-session-change") || sessionRevision; } catch { return sessionRevision; }
}
const privatePath = (path: string) => /^\/(account|auth|wallet|portfolio|orders|trades|watchlist|reports|simulation|analytics|ai|risk)(?:\/|\?|$)/.test(path);

/** Raw response variant for existing views; never sends credentials to public quote endpoints. */
export async function sessionFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const path = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!privatePath(path)) return fetch(url.startsWith("/") ? `${API_URL}${url}` : url, { ...options, headers });
  headers.delete("Authorization");
  headers.set("X-Requested-With", "stocksim");
  const method = options.method?.toUpperCase() || "GET";
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const intent = path === "/orders" && method === "POST" && typeof options.body === "string" && !headers.has("Idempotency-Key");
  const scope = getAuthToken();
  const revision = authRevision();
  if (intent) headers.set("Idempotency-Key", orderIntentKey(sessionStorage, scope, options.body as string));
  const run = () => fetch(`/api/backend${path}`, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  let res = await run();
  if (res.status === 401 && scope && !path.startsWith("/auth/")) {
    if (await tryRefreshToken(scope, revision) && getAuthToken() === scope) res = await run();
  }
  if (intent && res.ok) {
    try {
      const accepted = await res.clone().json();
      if (accepted.success && typeof accepted.data?.uuid === "string" && accepted.data.uuid) completeOrderIntent(sessionStorage, scope, options.body as string);
    } catch { /* A lost/invalid response body must retain the original intent key. */ }
  }
  if (res.ok && getAuthToken() === scope && isAccountMutation(path, method)) notifyAccountMutation(scope);
  return res;
}
let refreshInFlight: Promise<string | null> | null = null;
export function tryRefreshToken(failedScope = getAuthToken(), failedRevision = authRevision()): Promise<string | null> {
  if (typeof window === "undefined" || !getAuthToken()) return Promise.resolve(null);
  if (refreshInFlight) return refreshInFlight;
  const rotate = async () => {
    if (getAuthToken() !== failedScope || authRevision() !== failedRevision) return getAuthToken() || null;
    try {
      const res = await sessionFetch("/auth/refresh", { method: "POST" });
      if (getAuthToken() !== failedScope) return getAuthToken() || null;
      if (res.ok) { notifyAuthChanged(); return getAuthToken() || null; }
      if (res.status === 401) clearAuthTokens();
    } catch { /* Preserve the server-side retry intent after a lost response. */ }
    return null;
  };
  const run = async () => navigator.locks ? await navigator.locks.request("stock-simulator-auth-refresh", rotate) : await rotate();
  const pending = run().finally(() => { refreshInFlight = null; });
  refreshInFlight = pending;
  return pending;
}
export async function logoutSession() {
  const logout = async () => { try { await sessionFetch("/auth/logout", { method: "POST" }); } finally { clearAuthTokens(); } };
  return navigator.locks ? navigator.locks.request("stock-simulator-auth-refresh", logout) : logout();
}

/** Standard API response wrapper from the Go backend. */
export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  code?: string;
  request_id?: string;
  data: T;
  errors?: unknown;
}

export interface ApiDiagnostic {
  status: number;
  code?: string;
  message: string;
  requestId?: string;
  endpoint?: string;
  timestamp: string;
  details?: unknown;
}

/** Error thrown when an API call fails with complete diagnostics. */
export class ApiError extends Error {
  status: number;
  code?: string;
  requestId?: string;
  endpoint?: string;
  timestamp: string;
  details?: unknown;

  constructor(
    message: string,
    status: number,
    options?: {
      code?: string;
      requestId?: string;
      endpoint?: string;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options?.code;
    this.requestId = options?.requestId;
    this.endpoint = options?.endpoint;
    this.details = options?.details;
    this.timestamp = new Date().toISOString();
  }

  toDiagnostic(): ApiDiagnostic {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      endpoint: this.endpoint,
      timestamp: this.timestamp,
      details: this.details,
    };
  }
}

/** Helper to extract structured diagnostics from a fetch Response and body. */
export function extractApiDiagnostic(
  res: Response,
  body: unknown,
  endpoint?: string
): ApiDiagnostic {
  const payload =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : undefined;
  const code =
    typeof payload?.code === "string"
      ? payload.code
      : typeof payload?.errors === "string"
      ? (payload.errors as string)
      : undefined;
  const requestId =
    typeof payload?.request_id === "string"
      ? payload.request_id
      : res.headers?.get("x-request-id") || undefined;
  const message =
    typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
      ? payload.error
      : `HTTP ${res.status} request failed`;

  return {
    status: res.status,
    code,
    message,
    requestId,
    endpoint,
    timestamp: new Date().toISOString(),
    details: payload?.errors ?? body,
  };
}

/**
 * Typed fetch wrapper with automatic auth headers and JSON parsing.
 * Throws ApiError on non-2xx responses with stable error codes and request IDs.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await sessionFetch(`${API_URL}${path}`, options);

  if (!res.ok) {
    let msg = `API error ${res.status}`;
    let code: string | undefined;
    let requestId: string | undefined = res.headers.get("x-request-id") || undefined;
    let details: unknown;
    try {
      const errBody = await res.json();
      if (errBody?.message) msg = errBody.message;
      if (errBody?.code) code = errBody.code;
      if (!code && typeof errBody?.errors === "string") code = errBody.errors;
      if (errBody?.request_id) requestId = errBody.request_id;
      if (errBody?.errors) details = errBody.errors;
    } catch {
      // ignore JSON parse errors on error responses
    }
    throw new ApiError(msg, res.status, { code, requestId, endpoint: path, details });
  }

  const json: ApiEnvelope<T> = await res.json();
  return json.data;
}

/**
 * Public (unauthenticated) fetch — same as apiFetch but never sends auth header.
 */
export async function publicFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    signal,
  });

  if (!res.ok) {
    let msg = `API error ${res.status}`;
    let code: string | undefined;
    let requestId: string | undefined = res.headers.get("x-request-id") || undefined;
    let details: unknown;
    try {
      const errBody = await res.json();
      if (errBody?.message) msg = errBody.message;
      if (errBody?.code) code = errBody.code;
      if (!code && typeof errBody?.errors === "string") code = errBody.errors;
      if (errBody?.request_id) requestId = errBody.request_id;
      if (errBody?.errors) details = errBody.errors;
    } catch {
      // ignore
    }
    throw new ApiError(msg, res.status, { code, requestId, endpoint: path, details });
  }

  const json: ApiEnvelope<T> = await res.json();
  return json.data;
}
