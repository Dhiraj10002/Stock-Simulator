import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("production cookies are Secure, host-only and HttpOnly; JWT JSON is sanitized", () => {
 const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
 import { NextRequest } from 'next/server';
 import gateway from './src/app/api/backend/[...path]/route.ts';
 const { POST } = gateway;
 globalThis.fetch=async()=>Response.json({success:true,data:{access_token:'test-access',refresh_token:'test-refresh'}});
 const request=new NextRequest('https://frontend.example/api/backend/auth/login',{method:'POST',headers:{Origin:'https://frontend.example','X-Requested-With':'stocksim'},body:'{}'});
 const response=await POST(request,{params:Promise.resolve({path:['auth','login']})});
 const cookies=response.cookies.getAll().filter(c=>c.name.startsWith('__Host-'));
 const body=JSON.stringify(await response.json());
 if(response.status!==200 || cookies.length!==2 || !cookies.every(c=>c.secure&&c.httpOnly&&c.path==='/'&&!c.domain&&c.sameSite==='lax') || body.includes('test-access') || body.includes('test-refresh')) process.exit(1);
 `], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", BACKEND_API_URL: "https://backend.example/api/v1", BACKEND_PROXY_SECRET: "unit-test-secret-with-at-least-32-characters" }, encoding: "utf8" });
 assert.equal(result.status, 0, result.stderr);
});
