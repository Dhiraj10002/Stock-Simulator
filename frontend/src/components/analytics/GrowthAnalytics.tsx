"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getAnalyticsConsent, serverAnalyticsConsent, subscribeAnalyticsConsent, setAnalyticsConsent, trackGrowthPage } from "@/lib/growth-analytics";

function useAnalyticsConsent() {
  return useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, serverAnalyticsConsent);
}
export function AnalyticsPreferences() {
  const consent = useAnalyticsConsent();
  if (consent === "unknown") return null;
  return <div className="flex flex-wrap gap-2">
    <button type="button" onClick={() => setAnalyticsConsent("granted")} disabled={consent === "granted"} className="rounded-md border px-3 py-2 disabled:opacity-50">Allow analytics</button>
    <button type="button" onClick={() => setAnalyticsConsent("denied")} disabled={consent === "denied"} className="rounded-md border px-3 py-2 disabled:opacity-50">Decline analytics</button>
  </div>;
}
export default function GrowthAnalytics() {
  const consent = useAnalyticsConsent();
  const pathname = usePathname();
  useEffect(() => {
    if (consent === "granted") trackGrowthPage();
  }, [consent, pathname]);
  if (consent !== "unset") return null;
  return <aside aria-label="Optional analytics" className="fixed bottom-3 left-3 right-3 sm:right-auto sm:max-w-sm z-[60] rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <p className="mb-2">Help us improve Stock Simulator with optional Google Analytics. You can change your choice in the <Link href="/privacy" className="underline">privacy policy</Link>.</p>
    <AnalyticsPreferences />
  </aside>;
}
