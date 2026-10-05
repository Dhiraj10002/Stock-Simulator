import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { QueryProvider } from "@/providers/query-provider";
import { ThemeProvider } from "@/providers/theme-provider";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stock Simulator — Practice with virtual money",
  description:
    "Practise Indian stock trading with virtual money, NSE stocks and NFO derivatives.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#06080e] text-slate-900 dark:text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950 transition-colors duration-150 relative">
        <div className="relative z-10 flex-1 flex flex-col">
          <ThemeProvider>
            <QueryProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </QueryProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
