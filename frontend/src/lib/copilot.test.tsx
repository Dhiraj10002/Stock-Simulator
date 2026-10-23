import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CopilotMarkdown from "../components/mentor/CopilotMarkdown";
import { copilotSourceLabel, isAuditRequest, COPILOT_TIMEOUT_MS } from "./copilot";

test("audit intents are separate from normal chat", () => {
  assert.equal(isAuditRequest("Audit my trading discipline & errors"), true);
  assert.equal(isAuditRequest("critique my trades"), true);
  assert.equal(isAuditRequest("stocks"), false);
  assert.equal(isAuditRequest("explain auditory processing"), false);
});
test("response labels never disguise fallback as Gemini", () => {
  assert.equal(copilotSourceLabel("gemini"), "Gemini response");
  assert.match(copilotSourceLabel("rule_based", "rate_limited"), /Rule-based fallback.*quota/);
  assert.match(copilotSourceLabel(undefined), /unavailable/);
  assert.equal(copilotSourceLabel("system"), "");
  assert.ok(COPILOT_TIMEOUT_MS > 20_000);
});
test("Copilot renders formatting while blocking raw HTML, script links and remote images", () => {
  const html = renderToStaticMarkup(createElement(CopilotMarkdown, { text: "**Risk**\n\n1. Check `TCS-EQ`\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![tracking](https://tracking.invalid/pixel)" }));
  assert.match(html, /<strong>Risk<\/strong>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<code[^>]*>TCS-EQ<\/code>/);
  assert.doesNotMatch(html, /<script|javascript:|<img|tracking.invalid/);
});
