import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST, GET } from "../app/api/backend/[...path]/route";
const origin = "http://localhost:3000";
const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
function request(path: string, body = "{}", cookie = "") {
 return new NextRequest(`${origin}/api/backend/${path}`, { method: "POST", headers: { Origin: origin, "X-Requested-With": "stocksim", "Content-Type": "application/json", Cookie: cookie }, body });
}
test("gateway rejects cross-site writes, anonymous reads and unlisted paths", async () => {
 const req = new NextRequest(`${origin}/api/backend/orders`, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
 assert.equal((await POST(req, ctx("orders"))).status, 403);
 assert.equal((await GET(new NextRequest(`${origin}/api/backend/wallet`), ctx("wallet"))).status, 401);
 assert.equal((await GET(new NextRequest(`${origin}/api/backend/market/status`), ctx("market/status"))).status, 404);
 assert.equal((await POST(request("orders", "x".repeat(1024*1024+1), "stocksim_access=a"), ctx("orders"))).status, 413);
});
test("login tokens stay HttpOnly; refresh retries keep identical server key; logout expires cookies", async () => {
 const original = globalThis.fetch; const old = process.env.BACKEND_API_URL;
 process.env.BACKEND_API_URL = "http://localhost:8080/api/v1";
 const access = `test.${Buffer.from(JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000001" })).toString("base64url")}.test`;
 try {
  globalThis.fetch = async () => Response.json({ success: true, data: { access_token: access, refresh_token: "secret-refresh" } });
  const login = await POST(request("auth/login"), ctx("auth/login"));
  const data = JSON.stringify(await login.json()); assert.ok(!data.includes(access)); assert.ok(!data.includes("secret-refresh"));
  const credential = login.cookies.get("stocksim_refresh"); assert.equal(credential?.value, "secret-refresh");
  assert.match(login.headers.get("set-cookie")!, /stocksim_refresh=.*HttpOnly/i);
  assert.match(login.headers.get("cache-control")!, /no-store/);
  const keys: string[] = [];
  globalThis.fetch = async (_url, init) => {
   assert.equal(JSON.parse(init!.body as string).refresh_token, "secret-refresh");
   keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
   return Response.json({ success: true, data: { access_token: access, refresh_token: "rotated" } });
  };
  for (let i=0; i<2; i++) await POST(request("auth/refresh", '{}', "stocksim_refresh=secret-refresh; stocksim_session=account"), ctx("auth/refresh"));
  assert.equal(keys[0], keys[1]); assert.ok(keys[0]);
  globalThis.fetch = async () => { throw new Error("offline"); };
  const logout = await POST(request("auth/logout", '{}', "stocksim_refresh=secret-refresh"), ctx("auth/logout"));
  assert.equal(logout.cookies.get("stocksim_refresh")?.maxAge, 0);
 } finally { globalThis.fetch = original; if(old===undefined) delete process.env.BACKEND_API_URL; else process.env.BACKEND_API_URL=old; }
});
