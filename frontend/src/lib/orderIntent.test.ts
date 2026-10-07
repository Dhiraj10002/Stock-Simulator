import test from "node:test";
import assert from "node:assert/strict";
import { orderIntentKey, completeOrderIntent } from "./orderIntent";
test("uncertain orders keep their key across reload; accepted intents can repeat deliberately", () => {
 const map = new Map<string, string>(); const storage = { getItem: (key: string) => map.get(key) || null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
 assert.equal(orderIntentKey(storage, "user-a", "buy", () => "first"), "first");
 assert.equal(orderIntentKey(storage, "user-a", "buy", () => "second"), "first");
 assert.equal(orderIntentKey(storage, "user-b", "buy", () => "other"), "other");
 assert.equal(orderIntentKey(storage, "user-a", "sell", () => "sell"), "sell");
 completeOrderIntent(storage, "user-a", "buy");
 assert.equal(orderIntentKey(storage, "user-a", "buy", () => "next"), "next");
});
