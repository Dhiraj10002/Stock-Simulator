export const COPILOT_TIMEOUT_MS = 35_000;
export function isAuditRequest(question: string): boolean {
  return /\b(audit|critique)\b/i.test(question);
}
export function copilotSourceLabel(source?: string, reason?: string): string {
  if (source === "gemini") return "Gemini response";
  if (source === "rule_based" && reason === "insufficient_history") return "Rule-based review · no order history";
  if (source !== "rule_based") return source === "system" ? "Copilot" : "Response source unavailable";
  const reasons: Record<string, string> = {
    not_configured: "AI not configured", authentication_failed: "AI authentication unavailable",
    model_unavailable: "AI model unavailable", invalid_model: "AI model configuration unavailable",
    rate_limited: "AI quota reached", timeout: "AI timed out", blocked: "AI response unavailable",
    incomplete_response: "AI response incomplete", network_error: "AI connection unavailable",
    request_rejected: "AI request unavailable",
  };
  return `Rule-based fallback · ${reasons[reason || ""] || "AI unavailable"}`;
}
