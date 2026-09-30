import test from "node:test";
import assert from "node:assert/strict";
import {tryRefreshToken, clearAuthTokens} from "./api";

test("refresh single-flight, late 401, lost response and logout safety", async () => {
 const values = new Map<string,string>();
 const storage = {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const originalFetch = globalThis.fetch;
 const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis,"window");
 const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis,"localStorage");
 Object.defineProperty(globalThis,"window",{configurable:true,value:{dispatchEvent:()=>true}});
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:storage});
 const seed = () => {values.clear();storage.setItem("auth_token","old-access");storage.setItem("refresh_token","old-refresh");};
 try {
  seed(); let calls=0;
  globalThis.fetch = async () => {calls++;await new Promise(r=>setTimeout(r,5));return Response.json({success:true,data:{access_token:"new-access",refresh_token:"new-refresh"}});};
  const results = await Promise.all(Array.from({length:8},()=>tryRefreshToken("old-access")));
  assert.equal(calls,1);assert.deepEqual(new Set(results),new Set(["new-access"]));
  assert.equal(await tryRefreshToken("old-access"),"new-access");assert.equal(calls,1);
  seed();let key="";
  globalThis.fetch = async (_url,options) => {key=new Headers(options?.headers).get("Idempotency-Key")!;throw new Error("response lost");};
  assert.equal(await tryRefreshToken("old-access"),null);
  assert.equal(storage.getItem("refresh_token"),"old-refresh");
  globalThis.fetch = async (_url,options) => {assert.equal(new Headers(options?.headers).get("Idempotency-Key"),key);return Response.json({success:true,data:{access_token:"recovered",refresh_token:"replacement"}});};
  assert.equal(await tryRefreshToken("old-access"),"recovered");
  seed();globalThis.fetch = async () => {clearAuthTokens();return Response.json({success:true,data:{access_token:"must-not-restore",refresh_token:"must-not-restore"}});};
  assert.equal(await tryRefreshToken("old-access"),null);assert.equal(storage.getItem("auth_token"),null);
 } finally {
  globalThis.fetch=originalFetch;
  if(windowDescriptor) Object.defineProperty(globalThis,"window",windowDescriptor);else Reflect.deleteProperty(globalThis,"window");
  if(storageDescriptor) Object.defineProperty(globalThis,"localStorage",storageDescriptor);else Reflect.deleteProperty(globalThis,"localStorage");
 }
});
