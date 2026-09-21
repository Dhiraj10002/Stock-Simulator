/**
 * Reusable API client helper for Stock Simulator.
 * Handles auth tokens, JSON parsing, and consistent error handling.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

/** Read auth token from localStorage (client-side only). */
export function getAuthToken(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("auth_token") || "";
  }
  return "";
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

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.message) msg = errBody.message;
    } catch {
      // ignore JSON parse errors on error responses
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
