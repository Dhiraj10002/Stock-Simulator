import type { ApiDiagnostic } from "./api";

/** Expected exchange-session rejections should be notices, not system failures. */
export function marketClosedNotice({ status, code, message }: Pick<ApiDiagnostic, "status" | "code" | "message">): string | null {
  if (![400, 409, 422].includes(status)) return null;
  // Current square-off endpoints still use the generic code; retain compatibility
  // without treating arbitrary network, feed, authorization or server errors as closure.
  const legacyClosure = (!code || code === "SQUAREOFF_FAILED" || code === "MIS_SQUAREOFF_FAILED") && /^market is closed\b/i.test(message.trim());
  if (code !== "MARKET_CLOSED" && !legacyClosure) return null;
  const reason = /^market (?:is )?closed\b/i.test(message.trim())
    ? message.trim().split(/[;\n]/, 1)[0].replace(/[.!?]+$/, "")
    : "This market segment is currently closed";
  return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Please try again during the next trading session.`;
}
