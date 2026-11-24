// Optional GA4 tracking. Never pass account or trading data to this module.
const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
const consentKey = "stocksim:analytics-consent";
const consentEvent = "stocksim:analytics-consent-changed";
type Consent = "unknown" | "unset" | "granted" | "denied";
type GoogleWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean | undefined;
};
let initialized = false;
let lastPage = "";

function available() {
  return /^G-[A-Z0-9]+$/.test(id) && typeof window !== "undefined" &&
    (window.location.hostname === "www.stock-simulator.in" || process.env.NODE_ENV === "development");
}
export function getAnalyticsConsent(): Consent {
  if (!available()) return "unknown";
  try {
    const value = localStorage.getItem(consentKey);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch { return "denied"; }
}
export const serverAnalyticsConsent = (): Consent => "unknown";
export function subscribeAnalyticsConsent(callback: () => void) {
  window.addEventListener(consentEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(consentEvent, callback);
    window.removeEventListener("storage", callback);
  };
}
export function setAnalyticsConsent(value: "granted" | "denied") {
  if (!available()) return;
  try { localStorage.setItem(consentKey, value); } catch { return; }
  if (value === "denied") {
    (window as GoogleWindow)[`ga-disable-${id}`] = true;
    if (initialized) { window.location.reload(); return; }
  }
  window.dispatchEvent(new Event(consentEvent));
}

const publicPaths = new Set(["/", "/stocks", "/options", "/news", "/about", "/privacy", "/terms", "/login", "/signup"]);
export function analyticsPagePath(path: string) {
  return publicPaths.has(path) ? path : "/app";
}
export function analyticsReferrer(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin + "/" : "";
  } catch { return ""; }
}
function context() {
  const path = analyticsPagePath(window.location.pathname);
  return { page_location: window.location.origin + path, page_title: path === "/" ? "Stock Simulator" : path, page_referrer: analyticsReferrer(document.referrer) };
}
function initialize() {
  if (getAnalyticsConsent() !== "granted") return false;
  const w = window as GoogleWindow;
  w[`ga-disable-${id}`] = false;
  if (initialized) return true;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer?.push(arguments); };
  w.gtag("js", new Date());
  w.gtag("config", id, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...context(),
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(script);
  initialized = true;
  return true;
}
export function trackGrowthPage() {
  try {
    if (!initialize()) return;
    const data = context();
    if (lastPage === data.page_location) return;
    lastPage = data.page_location;
    const tag = (window as GoogleWindow).gtag;
    tag?.("set", data);
    tag?.("event", "page_view", data);
  } catch { /* Analytics must not interrupt the product. */ }
}
export function trackSignup() {
  try {
    if (!initialize()) return;
    (window as GoogleWindow).gtag?.("event", "sign_up", { method: "email", ...context() });
  } catch { /* Analytics must not interrupt registration. */ }
}
