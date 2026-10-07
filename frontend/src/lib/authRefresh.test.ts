import test from "node:test";
import assert from "node:assert/strict";
import { tryRefreshToken, clearAuthTokens, sessionFetch } from "./api";
test("cookie session refresh is single-flight; network failures keep session; logout wins", async () => {
 const originals = new Map(["window", "document", "localStorage", "sessionStorage"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
 const originalFetch = globalThis.fetch;
 const values = new Map<string, string>();
 const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
 const doc = { cookie: "stocksim_session=account" };
 Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => true } });
 Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
 for (const name of ["localStorage", "sessionStorage"]) Object.defineProperty(globalThis, name, { configurable: true, value: storage });
 try {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
   assert.equal(url, "/api/backend/auth/refresh");
   assert.equal(new Headers(options?.headers).get("Authorization"), null);
   assert.equal(options?.body, undefined);
   calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json({ success: true, data: { authenticated: true } });
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => tryRefreshToken("account")));
  assert.equal(calls, 1); assert.deepEqual(new Set(results), new Set(["account"]));
  globalThis.fetch = async () => { throw new Error("response lost"); };
  assert.equal(await tryRefreshToken(), null); assert.equal(doc.cookie, "stocksim_session=account");
  globalThis.fetch = async () => { clearAuthTokens(); return Response.json({ success: true }); };
  assert.equal(await tryRefreshToken(), null);
  doc.cookie = "stocksim_session=account";
  const keys: (string | null)[] = [];
  globalThis.fetch = async (_url, options) => { keys.push(new Headers(options?.headers).get("Idempotency-Key")); throw new Error("lost"); };
  for (let i=0; i<2; i++) await assert.rejects(sessionFetch("/orders", { method: "POST", body: '{"symbol":"TCS"}' }));
  assert.equal(keys.length, 2); assert.ok(keys[0]); assert.equal(keys[0], keys[1]);
  globalThis.fetch = async (_url, options) => { keys.push(new Headers(options?.headers).get("Idempotency-Key")); return new Response("{broken-json", {status:201}); };
  await sessionFetch("/orders", {method:"POST",body:'{"symbol":"TCS"}'});
  assert.equal(keys.at(-1), keys[0]);
  globalThis.fetch = async (_url, options) => { keys.push(new Headers(options?.headers).get("Idempotency-Key")); return Response.json({success:true,data:{uuid:"accepted"}}); };
  await sessionFetch("/orders", {method:"POST",body:'{"symbol":"TCS"}'});
  await sessionFetch("/orders", {method:"POST",body:'{"symbol":"TCS"}'});
  assert.notEqual(keys.at(-1), keys[0]);
  assert.equal(values.get("auth_token"), undefined);
 } finally {
  globalThis.fetch = originalFetch;
  for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
 }
});
