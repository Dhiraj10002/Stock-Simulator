/**
 * Canonical Symbol Alias Normalization
 * Matches backend internal/market/alias and python-services/market-worker/symbol_aliases.json
 */

const DEFAULT_ALIASES: Record<string, string> = {
  ZOMATO: "ETERNAL",
  TATAMOTORS: "TMPV",
  LTI: "LTIM",
  MINDTREE: "LTIM",
};

/**
 * Clean and normalize a stock symbol by removing segment suffixes and excess whitespace.
 */
export function cleanSymbol(symbol: string): string {
  if (!symbol) return "";
  let clean = symbol.trim().toUpperCase();
  clean = clean.replace(/-(EQ|BE|SM)$/, "");
  return clean;
}

/**
 * Resolves an input symbol or corporate alias to its canonical symbol.
 * e.g. "ZOMATO" -> "ETERNAL", "ZOMATO-EQ" -> "ETERNAL", "TATAMOTORS" -> "TMPV", "RELIANCE" -> "RELIANCE"
 */
export function resolveCanonicalSymbol(symbol: string): string {
  const clean = cleanSymbol(symbol);
  if (!clean) return "";
  return DEFAULT_ALIASES[clean] || clean;
}

/**
 * Returns all aliases that map to the specified canonical symbol.
 * e.g. "ETERNAL" -> ["ZOMATO"], "TMPV" -> ["TATAMOTORS"]
 */
export function getSymbolAliases(canonicalSymbol: string): string[] {
  const clean = cleanSymbol(canonicalSymbol);
  if (!clean) return [];
  const result: string[] = [];
  for (const [alias, target] of Object.entries(DEFAULT_ALIASES)) {
    if (target === clean && alias !== clean) {
      result.push(alias);
    }
  }
  return result.sort();
}
