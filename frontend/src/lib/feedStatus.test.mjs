import test from "node:test";
import assert from "node:assert/strict";
import { getAuthoritativeFeedStatus } from "./feedStatus.ts";

test("feedStatus: Angel One live feed with open market", () => {
  const result = getAuthoritativeFeedStatus(
    { feedProvider: "angel_one", feedState: "LIVE", isSynthetic: false },
    "OPEN",
    "connected"
  );
  assert.equal(result.badgeText, "LIVE");
  assert.equal(result.subText, "ANGEL ONE");
  assert.equal(result.isLive, true);
  assert.match(result.pillClasses, /emerald/);
});

test("feedStatus: Angel One live feed with closed market", () => {
  const result = getAuthoritativeFeedStatus(
    { feedProvider: "angel_one", feedState: "LIVE", isSynthetic: false },
    "CLOSED",
    "connected",
    "15:30 IST"
  );
  assert.equal(result.badgeText, "MARKET CLOSED");
  assert.equal(result.subText, "15:30 IST");
  assert.equal(result.isLive, false);
});

test("feedStatus: Synthetic fallback feed", () => {
  const result = getAuthoritativeFeedStatus(
    { feedProvider: "synthetic", feedState: "FALLBACK", isSynthetic: true },
    "OPEN",
    "connected"
  );
  assert.equal(result.badgeText, "SIMULATION");
  assert.equal(result.subText, "SYNTHETIC");
  assert.equal(result.isLive, true);
  assert.match(result.pillClasses, /purple/);
});

test("feedStatus: Reconnecting supervisor state", () => {
  const result = getAuthoritativeFeedStatus(
    { feedProvider: "angel_one", feedState: "RETRYING", isSynthetic: false },
    "OPEN",
    "connected"
  );
  assert.equal(result.badgeText, "DISCONNECTED");
  assert.equal(result.subText, "RECONNECTING");
  assert.equal(result.isLive, false);
});

test("feedStatus: Disconnected frontend websocket", () => {
  const result = getAuthoritativeFeedStatus(
    { feedProvider: "angel_one", feedState: "LIVE", isSynthetic: false },
    "OPEN",
    "disconnected"
  );
  assert.equal(result.badgeText, "DISCONNECTED");
  assert.equal(result.subText, "RECONNECTING");
  assert.equal(result.isLive, false);
});

test("feedStatus: Explicit UNAVAILABLE state", () => {
  const result = getAuthoritativeFeedStatus(
    { feedProvider: "angel_one", feedState: "UNAVAILABLE", isSynthetic: false },
    "OPEN",
    "connected"
  );
  assert.equal(result.badgeText, "UNAVAILABLE");
  assert.equal(result.subText, "NO FEED");
  assert.equal(result.isLive, false);
  assert.match(result.pillClasses, /rose/);
});

