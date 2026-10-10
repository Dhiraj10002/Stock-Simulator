import type { Metadata } from "next";

export const SITE_URL = "https://www.stock-simulator.in";
export const SITE_NAME = "Stock Simulator";
export const SITE_DESCRIPTION = "Practice Indian stock trading with virtual money. Explore NSE stocks and NFO futures and options, place paper orders, and track your portfolio.";
const socialImage = { url: "/brand/social-preview.png", width: 1200, height: 630, alt: "Stock Simulator — practice Indian markets with virtual money" };

export function publicPageMetadata(path: string, title: string, description: string): Metadata {
  return {
    title: path === "/" ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    robots: { index: process.env.VERCEL_ENV !== "preview", follow: true },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_IN", url: path, title, description, images: [socialImage] },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}

export const PUBLIC_PAGES = [
  { path: "/", title: "Stock Simulator — Paper Trading in India", description: SITE_DESCRIPTION },
  { path: "/stocks", title: "NSE Stocks & Paper Trading", description: "Explore NSE equities, charts and market movements. Practice delivery and intraday stock trading with virtual funds." },
  { path: "/options", title: "Futures & Options Paper Trading", description: "Explore NFO futures and options, expiry dates and lot sizes. Practice derivatives trading using virtual money." },
  { path: "/news", title: "Indian Stock Market News", description: "Follow available Indian stock market headlines and company news alongside your paper trading practice." },
  { path: "/about", title: "About Stock Simulator", description: "Learn how Stock Simulator helps you practice NSE equities and NFO derivatives with virtual funds and simulated orders." },
  { path: "/privacy", title: "Privacy Policy", description: "Read how Stock Simulator handles account information, sessions and market data." },
  { path: "/terms", title: "Terms & Paper Trading Disclosure", description: "Read the terms for Stock Simulator. All balances and trades are simulated; no real securities or exchange orders are placed." },
] as const;
