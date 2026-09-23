import test from "node:test";
import assert from "node:assert/strict";
import { getApiUrl, getWsUrl } from "./config";

test("config: getApiUrl returns sanitized URL with /api/v1 suffix", () => {
  const orig = process.env.NEXT_PUBLIC_API_URL;
  try {
    process.env.NEXT_PUBLIC_API_URL = "https://api.your-oracle-domain.com";
    assert.equal(getApiUrl(), "https://api.your-oracle-domain.com/api/v1");

    process.env.NEXT_PUBLIC_API_URL = "https://api.your-oracle-domain.com/api/v1/";
    assert.equal(getApiUrl(), "https://api.your-oracle-domain.com/api/v1");
  } finally {
    process.env.NEXT_PUBLIC_API_URL = orig;
  }
});

test("config: getWsUrl automatically derives wss from https API URL", () => {
  const origApi = process.env.NEXT_PUBLIC_API_URL;
  const origWs = process.env.NEXT_PUBLIC_WS_URL;
  try {
    delete process.env.NEXT_PUBLIC_WS_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.your-oracle-domain.com/api/v1";
    assert.equal(getWsUrl(), "wss://api.your-oracle-domain.com/ws/market");
  } finally {
    process.env.NEXT_PUBLIC_API_URL = origApi;
    if (origWs !== undefined) process.env.NEXT_PUBLIC_WS_URL = origWs;
  }
});

test("config: getWsUrl respects explicit NEXT_PUBLIC_WS_URL", () => {
  const origApi = process.env.NEXT_PUBLIC_API_URL;
  const origWs = process.env.NEXT_PUBLIC_WS_URL;
  try {
    process.env.NEXT_PUBLIC_API_URL = "https://api.your-oracle-domain.com/api/v1";
    process.env.NEXT_PUBLIC_WS_URL = "wss://custom-ws.your-oracle-domain.com/ws/market";
    assert.equal(getWsUrl(), "wss://custom-ws.your-oracle-domain.com/ws/market");
  } finally {
    process.env.NEXT_PUBLIC_API_URL = origApi;
    if (origWs !== undefined) process.env.NEXT_PUBLIC_WS_URL = origWs;
    else delete process.env.NEXT_PUBLIC_WS_URL;
  }
});

test("config: dev fallback returns localhost:8080 when unset", () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origApi = process.env.NEXT_PUBLIC_API_URL;
  const origWs = process.env.NEXT_PUBLIC_WS_URL;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_WS_URL;
    assert.equal(getApiUrl(), "http://localhost:8080/api/v1");
    assert.equal(getWsUrl(), "ws://localhost:8080/ws/market");
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
    if (origApi !== undefined) process.env.NEXT_PUBLIC_API_URL = origApi;
    if (origWs !== undefined) process.env.NEXT_PUBLIC_WS_URL = origWs;
  }
});
