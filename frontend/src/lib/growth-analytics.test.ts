import assert from "node:assert/strict";
import { test } from "node:test";
import { analyticsPagePath, analyticsReferrer, getAnalyticsConsent, trackGrowthPage, trackSignup } from "./growth-analytics";

test("analytics only exposes approved public paths", () => {
  assert.equal(analyticsPagePath("/stocks"), "/stocks");
  for (const path of ["/stocks/RELIANCE", "/portfolio", "/orders/123", "/signup?email=private", "/mentor"]) {
    assert.equal(analyticsPagePath(path), "/app");
  }
});
test("referrer strips paths, query parameters and fragments", () => {
  assert.equal(analyticsReferrer("https://www.google.com/search?q=private#x"), "https://www.google.com/");
  assert.equal(analyticsReferrer("not a URL"), "");
});
test("analytics safely does nothing on the server", () => {
  assert.equal(getAnalyticsConsent(), "unknown");
  assert.doesNotThrow(trackGrowthPage);
  assert.doesNotThrow(trackSignup);
});
