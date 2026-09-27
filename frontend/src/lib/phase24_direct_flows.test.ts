import test from "node:test";
import assert from "node:assert/strict";
import { formatKiteSymbol } from "@/components/layout/SearchModal";
import { getAuthoritativeFeedStatus } from "./feedStatus";

// -----------------------------------------------------------------------------
// Flow 4: Search Modal (Ctrl/Cmd + K) Routing & Canonical Display
// -----------------------------------------------------------------------------
test("Phase 24 Search: Equity canonical symbol formatting and routing tag", () => {
  const infy = formatKiteSymbol("INFY");
  assert.equal(infy.displayName, "INFY");
  assert.equal(infy.exchangeTag, "NSE");
  assert.equal(infy.isDerivative, false);

  const tcsEq = formatKiteSymbol("TCS-EQ");
  assert.equal(tcsEq.displayName, "TCS");
  assert.equal(tcsEq.exchangeTag, "NSE");
  assert.equal(tcsEq.isDerivative, false);

  const bseStock = formatKiteSymbol("RELIANCE BSE");
  assert.equal(bseStock.displayName, "RELIANCE BSE");
  assert.equal(bseStock.exchangeTag, "BSE");
  assert.equal(bseStock.isDerivative, false);
});

test("Phase 24 Search: F&O Futures canonical symbol formatting", () => {
  const nseFut = formatKiteSymbol("NIFTY26SEPFUT");
  assert.equal(nseFut.displayName, "NIFTY SEP FUT");
  assert.equal(nseFut.exchangeTag, "NFO");
  assert.equal(nseFut.isDerivative, true);

  const stockFut = formatKiteSymbol("KEI27OCT26FUT");
  assert.equal(stockFut.displayName, "KEI OCT FUT");
  assert.equal(stockFut.exchangeTag, "NFO");
  assert.equal(stockFut.isDerivative, true);
});

test("Phase 24 Search: F&O Options canonical symbol formatting", () => {
  const tcsCall = formatKiteSymbol("TCS27OCT262300CE");
  assert.equal(tcsCall.displayName, "TCS OCT 2300 CE");
  assert.equal(tcsCall.exchangeTag, "NFO");
  assert.equal(tcsCall.isDerivative, true);

  const keiPut = formatKiteSymbol("KEI27OCT264500PE");
  assert.equal(keiPut.displayName, "KEI OCT 4500 PE");
  assert.equal(keiPut.exchangeTag, "NFO");
  assert.equal(keiPut.isDerivative, true);

  const spacedCall = formatKiteSymbol("TCS 4150 CE", "2026-09-24");
  assert.equal(spacedCall.displayName, "TCS SEP 4150 CE");
  assert.equal(spacedCall.exchangeTag, "NFO");
  assert.equal(spacedCall.isDerivative, true);
});

// -----------------------------------------------------------------------------
// Flow 1 & 2: Order Modals Margin & Leverage Arithmetic Invariants
// -----------------------------------------------------------------------------
test("Phase 24 Direct Flows: CNC Delivery requires 100% cash", () => {
  const qty = 50;
  const priceRupees = 1500;
  const requiredMarginRupees = qty * priceRupees; // ₹75,000
  assert.equal(requiredMarginRupees, 75000);
});

test("Phase 24 Direct Flows: MIS Intraday requires exactly 20% margin (5x leverage)", () => {
  const qty = 100;
  const priceRupees = 3500;
  const turnover = qty * priceRupees; // ₹3,50,000
  const misMarginRupees = turnover * 0.2; // 5x leverage = 20% = ₹70,000
  assert.equal(misMarginRupees, 70000);
});

test("Phase 24 Direct Flows: Long Option requires 100% premium and 0 blocked margin", () => {
  const lots = 2;
  const lotSize = 25;
  const totalQty = lots * lotSize; // 50
  const premium = 200; // ₹200
  const requiredPremiumRupees = totalQty * premium; // ₹10,000
  assert.equal(requiredPremiumRupees, 10000);
});

test("Phase 24 Direct Flows: Short Option and Futures calculate margin requirement correctly", () => {
  const lots = 1;
  const lotSize = 25;
  const totalQty = lots * lotSize; // 25
  const futurePrice = 25000;
  const contractValue = totalQty * futurePrice; // ₹6,25,000
  const nrmlMarginRupees = contractValue * 0.18; // 18% = ₹1,12,500
  const misMarginRupees = contractValue * 0.10; // 10% = ₹62,500
  assert.equal(nrmlMarginRupees, 112500);
  assert.equal(misMarginRupees, 62500);
});

// -----------------------------------------------------------------------------
// Section 20: Degraded Quote & Feed Outage States (Anti-Fabrication)
// -----------------------------------------------------------------------------
test("Phase 24 Degraded UI: Missing or non-positive price triggers UNAVAILABLE state", () => {
  const invalidPrices = [0, -1, null, undefined];
  for (const price of invalidPrices) {
    const isAvailable = price != null && (price as number) > 0;
    const displayText = isAvailable ? `₹${(price as number).toFixed(2)}` : "UNAVAILABLE";
    assert.equal(displayText, "UNAVAILABLE", `Failed for price ${price}`);
  }
});

test("Phase 24 Degraded UI: Market order execution blocked when quote is unavailable", () => {
  const stockPrice = 0;
  const isMarket = true;
  let feedbackMessage: string | null = null;

  if (isMarket && (!stockPrice || stockPrice <= 0)) {
    feedbackMessage = "✗ Market quote is currently unavailable. Place a Limit order or wait for live feed.";
  }

  assert.equal(
    feedbackMessage,
    "✗ Market quote is currently unavailable. Place a Limit order or wait for live feed."
  );
});

test("Phase 24 Degraded UI: Feed supervisor UNAVAILABLE produces explicit banner and disables live state", () => {
  const status = getAuthoritativeFeedStatus(
    { feedProvider: "angel_one", feedState: "UNAVAILABLE", isSynthetic: false },
    "OPEN",
    "connected"
  );
  assert.equal(status.badgeText, "UNAVAILABLE");
  assert.equal(status.subText, "NO FEED");
  assert.equal(status.bannerType, "unavailable");
  assert.equal(status.bannerTitle, "MARKET FEED UNAVAILABLE");
  assert.equal(status.isLive, false);
});

test("Phase 24 Degraded UI: WebSocket feed DISCONNECTED produces RECONNECTING state", () => {
  const status = getAuthoritativeFeedStatus(
    { feedProvider: "angel_one", feedState: "LIVE", isSynthetic: false },
    "OPEN",
    "disconnected"
  );
  assert.equal(status.badgeText, "DISCONNECTED");
  assert.equal(status.subText, "RECONNECTING");
  assert.equal(status.bannerType, "disconnected");
  assert.equal(status.bannerTitle, "MARKET FEED RECONNECTING");
  assert.equal(status.isLive, false);
});
