/**
 * Canonical configuration module for frontend environment and service URLs.
 * Handles production domain resolution, protocol matching (HTTPS/WSS),
 * automatic WebSocket URL derivation, and safe development fallbacks.
 */

const isProd = process.env.NODE_ENV === "production";

/**
 * Returns the normalized REST API base URL (guaranteed to end with /api/v1).
 * In production (Vercel + Oracle architecture), NEXT_PUBLIC_API_URL must point
 * to the backend gateway (e.g., https://api.<your-oracle-domain>.com/api/v1).
 */
export function getApiUrl(): string {
  const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envApiUrl) {
    let url = envApiUrl.replace(/\/+$/, "");
    if (!url.endsWith("/api/v1")) {
      url = `${url}/api/v1`;
    }
    // Prevent mixed content when browser runs on HTTPS
    if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("http://")) {
      url = url.replace(/^http:\/\//, "https://");
    }
    return url;
  }

  if (isProd) {
    if (typeof window !== "undefined") {
      console.warn(
        "NEXT_PUBLIC_API_URL is not set in production. In Vercel + Oracle architecture, set NEXT_PUBLIC_API_URL to https://api.<your-oracle-domain>.com/api/v1."
      );
      return `${window.location.origin}/api/v1`;
    }
    return "";
  }

  return "http://localhost:8080/api/v1";
}

/**
 * Returns the normalized WebSocket URL (guaranteed to end with /ws/market).
 * Automatically derived from NEXT_PUBLIC_API_URL if NEXT_PUBLIC_WS_URL is not explicitly set,
 * guaranteeing API and WebSocket endpoints remain synchronized.
 */
export function getWsUrl(): string {
  const envWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (envWsUrl) {
    let url = envWsUrl.replace(/\/+$/, "");
    if (!url.endsWith("/ws/market")) {
      url = `${url}/ws/market`;
    }
    // Prevent insecure WebSocket handshake when browser runs on HTTPS
    if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("ws://")) {
      url = url.replace(/^ws:\/\//, "wss://");
    }
    return url;
  }

  // Automatically derive from NEXT_PUBLIC_API_URL if available
  const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envApiUrl) {
    const base = envApiUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
    if (base.startsWith("https://")) {
      return `${base.replace(/^https:\/\//, "wss://")}/ws/market`;
    }
    if (base.startsWith("http://")) {
      const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss://" : "ws://";
      return `${base.replace(/^http:\/\//, proto)}/ws/market`;
    }
  }

  if (isProd) {
    if (typeof window !== "undefined") {
      console.warn(
        "NEXT_PUBLIC_WS_URL is not set in production. In Vercel + Oracle architecture, set NEXT_PUBLIC_WS_URL to wss://api.<your-oracle-domain>.com/ws/market."
      );
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}/ws/market`;
    }
    return "";
  }

  return "ws://localhost:8080/ws/market";
}
