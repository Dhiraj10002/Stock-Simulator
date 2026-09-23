/**
 * Reusable API client helper for Stock Simulator.
 * Handles auth tokens, JSON parsing, and consistent error handling.
 */

import { getApiUrl } from "./config";

export const API_URL = getApiUrl();

/** Read auth token from localStorage (client-side only). */
export function getAuthToken(): string {
  if (typeof window !== "undefined") {
    return (
      localStorage.getItem("auth_token") ||
      localStorage.getItem("stock-simulator-access-token") ||
      ""
    );
  }
  return "";
}

/** Clear all auth tokens from localStorage (client-side only). */
export function clearAuthTokens(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("stock-simulator-access-token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("stock-simulator-refresh-token");
    window.dispatchEvent(new Event("auth-changed"));
  }
}

/** Try to refresh access token using stored refresh token. */
export async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const refreshToken =
    localStorage.getItem("stock-simulator-refresh-token") ||
    localStorage.getItem("refresh_token");
  if (!refreshToken) {
    clearAuthTokens();
    return null;
  }

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data?.access_token) {
        const newAccess = data.data.access_token as string;
        localStorage.setItem("auth_token", newAccess);
        localStorage.setItem("stock-simulator-access-token", newAccess);
        if (data.data?.refresh_token) {
          localStorage.setItem("stock-simulator-refresh-token", data.data.refresh_token);
          localStorage.setItem("refresh_token", data.data.refresh_token);
        }
        window.dispatchEvent(new Event("auth-changed"));
        return newAccess;
      }
    }
  } catch {
    // network failure
  }

  clearAuthTokens();
  return null;
}

/** Standard API response wrapper from the Go backend. */
export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/** Error thrown when an API call fails. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Typed fetch wrapper with automatic auth headers and JSON parsing.
 * Throws ApiError on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  // If 401 Unauthorized and we were authenticated, try token refresh once
  if (res.status === 401 && token) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });
    }
  }

  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.message) msg = errBody.message;
    } catch {
      // ignore JSON parse errors on error responses
    }
    if (res.status === 401) {
      clearAuthTokens();
    }
    throw new ApiError(msg, res.status);
  }

  const json: ApiEnvelope<T> = await res.json();
  return json.data;
}

/**
 * Public (unauthenticated) fetch — same as apiFetch but never sends auth header.
 */
export async function publicFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.message) msg = errBody.message;
    } catch {
      // ignore
    }
    throw new ApiError(msg, res.status);
  }

  const json: ApiEnvelope<T> = await res.json();
  return json.data;
}
