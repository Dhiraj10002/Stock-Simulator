import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/terminal/ToastProvider";
import { QueryProvider } from "@/providers/query-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import SearchModal from "@/components/layout/SearchModal";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import ShortcutsModal from "@/components/layout/ShortcutsModal";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stock Simulator — Institutional Paper Trading Platform",
  description:
    "Real-time Indian market paper trading simulator with NSE/BSE execution, integer paise accounting, and automated risk management.",
};

const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('stock_sim_theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var isDark = saved === 'dark' || (!saved && prefersDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.colorScheme = 'light';
      }
    } catch(e) {}
  })();
`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#06080e] text-slate-900 dark:text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950 pb-16 md:pb-0 transition-colors duration-150 relative">
        {/* MotionSites AI Signature Ambient Depth & Glow Mesh (Dark Mode) */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden hidden dark:block">
          {/* Top Center Electric Cyan/Indigo Aurora Flare */}
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1100px] h-[500px] bg-gradient-to-b from-cyan-500/15 via-blue-600/10 to-transparent rounded-full blur-[100px] opacity-75" />
          {/* Right Violet Atmospheric Glow */}
          <div className="absolute top-[20%] -right-48 w-[650px] h-[550px] bg-gradient-to-br from-indigo-600/10 via-purple-600/6 to-transparent rounded-full blur-[110px] opacity-60" />
          {/* Left Emerald Depth Flare */}
          <div className="absolute top-[55%] -left-48 w-[600px] h-[550px] bg-gradient-to-tr from-emerald-500/8 via-cyan-500/5 to-transparent rounded-full blur-[120px] opacity-50" />
          {/* MotionSites Subtle Matrix Grid Mask */}
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_70%,transparent_100%)] opacity-85" />
        </div>

        {/* MotionSites AI Radiant Ambient Aurora Mesh (Light Mode Glassmorphism) */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden block dark:hidden">
          {/* Top Center Radiant Sky Flare */}
          <div className="absolute -top-36 left-1/2 -translate-x-1/2 w-[1100px] h-[520px] bg-gradient-to-b from-sky-400/25 via-cyan-300/12 to-transparent rounded-full blur-[100px] opacity-80" />
          {/* Right Indigo/Violet Ethereal Flare */}
          <div className="absolute top-[15%] -right-40 w-[650px] h-[550px] bg-gradient-to-br from-indigo-300/20 via-purple-300/12 to-transparent rounded-full blur-[110px] opacity-70" />
          {/* Left Emerald/Teal Depth Flare */}
          <div className="absolute top-[50%] -left-40 w-[600px] h-[550px] bg-gradient-to-tr from-emerald-300/18 via-teal-300/10 to-transparent rounded-full blur-[120px] opacity-65" />
          {/* Light Mode Subtle Matrix Grid */}
          <div className="absolute inset-0 bg-[radial-gradient(rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,#000_70%,transparent_100%)] opacity-70" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col">
          <ThemeProvider>
            <QueryProvider>
              <ToastProvider>
                {children}
                <SearchModal />
                <ShortcutsModal />
                <MobileBottomNav />
              </ToastProvider>
            </QueryProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
