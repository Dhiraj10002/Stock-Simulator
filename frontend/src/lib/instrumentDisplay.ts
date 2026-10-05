/**
 * Format any raw symbol into clean Zerodha Kite-style display with spaces:
 * Examples:
 * - KEI27OCT26FUT -> "KEI OCT FUT", "NFO"
 * - TCS29SEP26FUT -> "TCS SEP FUT", "NFO"
 * - TCS27OCT262300CE -> "TCS OCT 2300 CE", "NFO"
 * - TCS27OCT262420PE -> "TCS OCT 2420 PE", "NFO"
 * - TCS 4150 CE -> "TCS SEP 4150 CE", "NFO"
 * - TCS -> "TCS", "NSE"
 */
export function formatKiteSymbol(
  symbol: string,
  expiry?: string,
  rawStrike?: string,
  rawOptType?: string,
): { displayName: string; exchangeTag: string; isDerivative: boolean } {
  const expiryMonth = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(expiry || "")) {
      const date = new Date(`${expiry}T12:00:00+05:30`);
      if (Number.isFinite(date.getTime()))
        return date
          .toLocaleDateString("en-IN", {
            month: "short",
            timeZone: "Asia/Kolkata",
          })
          .slice(0, 3)
          .toUpperCase();
    }
    return (
      (expiry || "")
        .match(/JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC/i)?.[0]
        .toUpperCase() || ""
    );
  };
  let s = (symbol || "").trim().toUpperCase();
  s = s.replace(/-EQ$/, "");

  // 1. Futures: e.g. KEI27OCT26FUT, TCS29SEP26FUT, KEI26SEPFUT, NIFTY26SEPFUT
  const futMatch = s.match(/^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?FUT$/);
  if (futMatch) {
    const under = futMatch[1];
    const month = futMatch[3];
    return {
      displayName: `${under} ${month} FUT`,
      exchangeTag: "NFO",
      isDerivative: true,
    };
  }

  // 2. Options: e.g. TCS29SEP261940CE, TCS27OCT262300CE, NIFTY06OCT2625550CE, KEI27OCT264500PE
  const optMatch = s.match(
    /^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?(\d+(?:\.\d+)?)(CE|PE)$/,
  );
  if (optMatch) {
    const under = optMatch[1];
    const month = optMatch[3];
    // Strikes in this API are already normalized rupees. Symbol date formats
    // are ambiguous; never strip the first two digits of the canonical strike.
    const strikeVal =
      rawStrike && Number(rawStrike) > 0
        ? String(Number(rawStrike))
        : undefined;
    const type = optMatch[6];
    if (!strikeVal)
      return { displayName: s, exchangeTag: "NFO", isDerivative: true };
    return {
      displayName: `${under} ${month} ${strikeVal} ${type}`,
      exchangeTag: "NFO",
      isDerivative: true,
    };
  }

  // 3. Spaced option e.g. "TCS 4150 CE"
  if (s.includes(" CE") || s.includes(" PE")) {
    const parts = s.split(/\s+/);
    if (parts.length >= 3) {
      const month = expiryMonth();
      const strike =
        rawStrike && Number(rawStrike) > 0
          ? String(Number(rawStrike))
          : parts[1];
      return {
        displayName: [parts[0], month, strike, parts[2]]
          .filter(Boolean)
          .join(" "),
        exchangeTag: "NFO",
        isDerivative: true,
      };
    }
  }

  // 4. Fallback check using raw fields if provided
  if (rawOptType && (rawOptType === "CE" || rawOptType === "PE")) {
    const month = expiryMonth();
    let strikeVal = rawStrike || "";
    if (strikeVal.includes(".")) {
      const num = parseFloat(strikeVal);
      strikeVal = num.toString();
    }
    return {
      displayName: [s, month, strikeVal, rawOptType].filter(Boolean).join(" "),
      exchangeTag: "NFO",
      isDerivative: true,
    };
  }

  // Standard equity
  const isBse = s.includes("BSE");
  return {
    displayName: s,
    exchangeTag: isBse ? "BSE" : "NSE",
    isDerivative: false,
  };
}
