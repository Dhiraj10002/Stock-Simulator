import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Stock Simulator — Practice with virtual money",
  description: "Practice Indian stock trading with virtual money. Explore NSE stocks and NFO futures and options, place paper orders, and track your portfolio.",
};

export default function Page() {
  return <LandingPage />;
}
