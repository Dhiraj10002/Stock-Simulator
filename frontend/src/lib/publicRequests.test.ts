import test from "node:test";
import assert from "node:assert/strict";
import { publicFetch, sessionFetch } from "./api";
test("body-less public GETs avoid non-safelisted headers; JSON POST keeps its body type", async () => {
 const original = globalThis.fetch;
 try {
  globalThis.fetch = async (_url, init) => {
   const headers = new Headers(init?.headers);
   assert.equal(headers.has("Authorization"), false);
   assert.equal(headers.has("Content-Type"), false);
   assert.equal(headers.has("X-Requested-With"), false);
   return Response.json({ success: true, data: [] });
  };
  await publicFetch("/market/indices");
  await sessionFetch("/market/status");
  globalThis.fetch = async (_url, init) => {
   assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
   return Response.json({ success: true, data: [] });
  };
  await sessionFetch("/market/quotes/batch", { method: "POST", body: '{"symbols":["TCS"]}' });
 } finally { globalThis.fetch = original; }
});
