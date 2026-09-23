/**
 * Currency and financial formatting utilities (Integer Paise Invariant)
 * 1 INR = 100 Paise
 */

export function formatPaise(paise: number = 0): string {
  const sign = paise < 0 ? "-" : "";
  const absRupees = Math.abs(paise) / 100;
  return `${sign}₹${absRupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number = 0): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number = 0, decimals: number = 2): string {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Checks whether the Indian Market (NSE/BSE) is currently in regular trading session.
 * Regular hours: Monday to Friday, 09:15 to 15:30 IST.
 */
export function getIndianMarketStatus(): {
  isOpen: boolean;
  statusText: string;
  istTime: string;
  sessionCloseSeconds: number;
} {
  const now = new Date();
  // Get time in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  const parts = formatter.formatToParts(now);
  const findPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  const weekday = findPart("weekday");
  const year = parseInt(findPart("year"), 10) || now.getFullYear();
  const month = parseInt(findPart("month"), 10) || now.getMonth() + 1;
  const day = parseInt(findPart("day"), 10) || now.getDate();
  const hour = parseInt(findPart("hour"), 10);
  const minute = parseInt(findPart("minute"), 10);

  const istTimeString = `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")} IST`;

  // 15:30 IST corresponds to 10:00:00 UTC
  const todayCloseUtcMs = Date.UTC(year, month - 1, day, 10, 0, 0);
  const oneDayMs = 24 * 60 * 60 * 1000;

  let sessionCloseSeconds = Math.floor(todayCloseUtcMs / 1000);

  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (isWeekend) {
    const daysBack = weekday === "Sat" ? 1 : 2;
    sessionCloseSeconds = Math.floor((todayCloseUtcMs - daysBack * oneDayMs) / 1000);
    return {
      isOpen: false,
      statusText: "MARKET CLOSED (Weekend)",
      istTime: istTimeString,
      sessionCloseSeconds,
    };
  }

  const totalMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 15; // 09:15 IST
  const closeMinutes = 15 * 60 + 30; // 15:30 IST

  if (totalMinutes < openMinutes) {
    const daysBack = weekday === "Mon" ? 3 : 1;
    sessionCloseSeconds = Math.floor((todayCloseUtcMs - daysBack * oneDayMs) / 1000);
    return {
      isOpen: false,
      statusText: "PRE-MARKET (Opens 09:15 IST)",
      istTime: istTimeString,
      sessionCloseSeconds,
    };
  } else if (totalMinutes > closeMinutes) {
    sessionCloseSeconds = Math.floor(todayCloseUtcMs / 1000);
    return {
      isOpen: false,
      statusText: "MARKET CLOSED (Closed 15:30 IST)",
      istTime: istTimeString,
      sessionCloseSeconds,
    };
  }

  return {
    isOpen: true,
    statusText: "MARKET OPEN",
    istTime: istTimeString,
    sessionCloseSeconds: Math.floor(Date.now() / 1000),
  };
}
