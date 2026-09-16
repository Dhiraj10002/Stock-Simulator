/**
 * Currency and financial formatting utilities (Integer Paise Invariant)
 * 1 INR = 100 Paise
 */

export function formatPaise(paise: number = 0): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number = 0): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Checks whether the Indian Market (NSE/BSE) is currently in regular trading session.
 * Regular hours: Monday to Friday, 09:15 to 15:30 IST.
 */
export function getIndianMarketStatus(): {
  isOpen: boolean;
  statusText: string;
  istTime: string;
} {
  const now = new Date();
  // Get time in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  const parts = formatter.formatToParts(now);
  const findPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  const weekday = findPart("weekday");
  const hour = parseInt(findPart("hour"), 10);
  const minute = parseInt(findPart("minute"), 10);

  const istTimeString = `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")} IST`;

  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (isWeekend) {
    return {
      isOpen: false,
      statusText: "MARKET CLOSED (Weekend)",
      istTime: istTimeString,
    };
  }

  const totalMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 15; // 09:15 IST
  const closeMinutes = 15 * 60 + 30; // 15:30 IST

  if (totalMinutes < openMinutes) {
    return {
      isOpen: false,
      statusText: "PRE-MARKET (Opens 09:15 IST)",
      istTime: istTimeString,
    };
  } else if (totalMinutes > closeMinutes) {
    return {
      isOpen: false,
      statusText: "MARKET CLOSED (Closed 15:30 IST)",
      istTime: istTimeString,
    };
  }

  return {
    isOpen: true,
    statusText: "MARKET OPEN",
    istTime: istTimeString,
  };
}
