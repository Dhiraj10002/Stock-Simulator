import test from "node:test";
import assert from "node:assert/strict";
import { executeStrategy } from "./strategyExecution";
import type { Order } from "@/types";
const legs = [{ symbol: "CALL", side: "BUY" as const, lotSize: 65 }, { symbol: "CALL2", side: "SELL" as const, lotSize: 65 }];
const order = (symbol: string, status: Order["status"]) => ({ uuid: symbol, symbol, status } as Order);
test("pending HTTP acceptance does not dispatch later legs or claim execution", async () => {
 let created = 0;
 const rows = await executeStrategy(legs, 2, { create: async row => { created++; assert.equal(row.quantity,130); return order(row.symbol,"PENDING"); }, read: async uuid => order(uuid,"PENDING") }, () => {}, { attempts: 1, wait: async () => {} });
 assert.equal(created,1);assert.equal(rows[0].status,"PENDING");assert.equal(rows[1].status,"NOT_SUBMITTED");
});
test("partial fills retain recovery identity and stop at rejection",async()=>{
 let created=0;
 const rows=await executeStrategy(legs,1,{create:async row=>order(row.symbol,++created===1?"EXECUTED":"REJECTED"),read:async uuid=>order(uuid,"EXECUTED")},()=>{});
 assert.equal(rows[0].status,"EXECUTED");assert.equal(rows[1].status,"REJECTED");assert.equal(rows[0].uuid,"CALL");
});
test("lost POST is unknown, never blindly retried",async()=>{
 let created=0;
 const rows=await executeStrategy(legs,1,{create:async()=>{created++;throw new Error("connection lost");},read:async uuid=>order(uuid,"EXECUTED")},()=>{});
 assert.equal(created,1);assert.equal(rows[0].status,"UNKNOWN");assert.equal(rows[1].status,"NOT_SUBMITTED");
});
test("missing canonical lots block submission",async()=>{
 await assert.rejects(executeStrategy([{...legs[0],lotSize:0}],1,{create:async row=>order(row.symbol,"EXECUTED"),read:async uuid=>order(uuid,"EXECUTED")},()=>{}));
});
test("all confirmed fills complete the strategy",async()=>{
 const rows=await executeStrategy(legs,1,{create:async row=>order(row.symbol,"OPEN"),read:async uuid=>order(uuid,"EXECUTED")},()=>{}, { wait:async()=>{} });
 assert.ok(rows.every(row=>row.status==="EXECUTED"));
});
