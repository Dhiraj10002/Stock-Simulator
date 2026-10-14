import LandingScrollSections from "./LandingScrollSections";
import BrandLogo from "@/components/brand/BrandLogo";
import React from "react";
import LandingExperience from "./LandingExperience";
import LandingAuthLink from "./LandingAuthLink";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  CheckCircle2,
  ExternalLink,
  Code2,
  TrendingUp,
  PieChart,
} from "lucide-react";

/* -------------------------------------------------------------
   1C. INTERACTIVE RUBBERBAND LETTER HOVER (PORTFOLIO FIDELITY)
   ------------------------------------------------------------- */
function AnimatedLetter({
  char,
  className = "",
}: {
  char: string;
  className?: string;
}) {
  return (
    <span
      className={`landing-letter inline-block transition-transform duration-150 cursor-default select-none ${className}`}
    >
      {char}
    </span>
  );
}

function AnimatedPhrase({
  phrase,
  className = "",
  wordClassName = "",
  letterClassName = "",
}: {
  phrase: string;
  className?: string;
  wordClassName?: string;
  letterClassName?: string;
}) {
  return (
    <span className={`inline-block ${className}`}>
      {phrase.split(" ").map((w, i) => (
        <span key={i} className={`inline-block whitespace-nowrap mr-[0.26em] ${wordClassName}`}>
          {w.split("").map((c, cIdx) => (
            <AnimatedLetter key={cIdx} char={c} className={letterClassName} />
          ))}
        </span>
      ))}
    </span>
  );
}

/* -------------------------------------------------------------
   2. REUSABLE 3D TILT CARD (WITH SPECULAR GLARE & CUSTOM GLOW)
   ------------------------------------------------------------- */
function TiltCard({
  children,
  className = "",
  glowColor = "rgba(6, 182, 212, 0.22)",
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}) {
  return (
    <div
      data-tilt-card
      className={`relative rounded-3xl transition-transform duration-200 ease-out group ${className}`}
      style={{
        transform: "perspective(1100px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)) translateZ(6px)",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Specular glare layer */}
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none z-20 transition-opacity duration-300"
        style={{
          background: `radial-gradient(420px circle at var(--glare-x, 50%) var(--glare-y, 50%), ${glowColor}, transparent 60%)`,
          opacity: "var(--glare-opacity, 0)",
        }}
      />
      {children}
    </div>
  );
}

/* -------------------------------------------------------------
   3. 3D TILTING PLATFORM SHOWCASE DECK
   ------------------------------------------------------------- */
function PlatformShowcase() {
  return (
    <div
      data-platform-deck
      className="relative max-w-5xl w-full mx-auto transition-transform duration-300 ease-out"
      style={{
        transform: "perspective(1600px) translateY(var(--deck-y, 0px)) rotateX(calc(var(--deck-x, 0deg) + var(--pointer-y, 0) * -3deg)) rotateY(calc(var(--pointer-x, 0) * 3.5deg))",
        opacity: 1,
        transformStyle: "preserve-3d",
      }}
    >
      {/* High-End Light Purple Glassmorphism Slab (Normal Size & Level Perspective) */}
      <div className="relative rounded-3xl bg-[#090a18]/75 backdrop-blur-2xl border border-purple-400/35 hover:border-purple-300/60 p-6 sm:p-7 shadow-[0_30px_90px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.2),0_0_55px_rgba(168,85,247,0.18)] transition-all overflow-hidden">
        {/* Ambient Light Purple Glass Glow Orbs */}
        <div className="absolute -top-24 -left-20 w-72 h-72 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-16 w-72 h-72 bg-fuchsia-500/12 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar with macOS-style frosted dots */}
        <div className="relative z-10 flex items-center gap-2 border-b border-white/[0.08] pb-3.5 mb-5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/90 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/90 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
          <span className="w-2.5 h-2.5 rounded-full bg-purple-400/90 shadow-[0_0_8px_rgba(192,132,252,0.6)]" />
          <span className="ml-2.5 text-xs font-mono text-purple-200/80 font-medium">
            stocksimulator.app / portfolio
          </span>
        </div>

        {/* Dashboard Grid (Main & Side) */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 text-left">
          {/* Main Left Column (Portfolio Value + Chart + Holdings) */}
          <div className="lg:col-span-7 space-y-5 sm:space-y-6">
            {/* Portfolio Value & Spline Chart Glass Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] hover:border-purple-400/35 transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_10px_25px_rgba(0,0,0,0.35)]">
              <div className="flex justify-between items-start mb-3.5">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-purple-200/80 font-semibold">
                    PORTFOLIO VALUE
                  </div>
                  <div className="text-3xl sm:text-4xl font-black font-mono text-white mt-1">
                    ₹10,42,860
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-xs font-mono shadow-sm">
                  ▲ 4.28% all-time
                </span>
              </div>

              {/* Glowing Light Purple Wave Spline Chart */}
              <div className="h-28 sm:h-32 relative overflow-hidden rounded-xl bg-black/40 backdrop-blur-md border border-white/[0.08]">
                <svg viewBox="0 0 600 150" preserveAspectRatio="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C084FC" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#A855F7" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id="g2l" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#E9D5FF" />
                      <stop offset="50%" stopColor="#C084FC" />
                      <stop offset="100%" stopColor="#9333EA" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,120 C60,110 90,96 140,100 C190,104 210,70 260,74 C320,79 340,52 400,58 C460,64 480,30 540,26 C570,24 590,18 600,16"
                    fill="none"
                    stroke="url(#g2l)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,120 C60,110 90,96 140,100 C190,104 210,70 260,74 C320,79 340,52 400,58 C460,64 480,30 540,26 C570,24 590,18 600,16 L600,150 L0,150 Z"
                    fill="url(#g2)"
                  />
                  {/* Pulsing Live Trade Tip Indicator */}
                  <circle cx="598" cy="16" r="4" fill="#E9D5FF" />
                  <circle cx="598" cy="16" r="8" fill="#C084FC" opacity="0.4" />
                </svg>
              </div>
            </div>

            {/* Holdings Glass Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] hover:border-purple-400/35 transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_10px_25px_rgba(0,0,0,0.35)]">
              <div className="text-[11px] font-mono uppercase tracking-widest text-purple-200/80 font-semibold mb-3">
                HOLDINGS
              </div>
              <div className="space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-400/40 flex items-center justify-center font-bold text-purple-300 text-xs">
                      INF
                    </span>
                    <div>
                      <div className="text-white font-bold text-sm">INFY</div>
                      <div className="text-slate-400 text-xs">80 qty · avg ₹1,512</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-sm">₹1,28,960</div>
                    <div className="text-emerald-400 font-bold text-xs">+6.6%</div>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-400/40 flex items-center justify-center font-bold text-violet-300 text-xs">
                      HDF
                    </span>
                    <div>
                      <div className="text-white font-bold text-sm">HDFCBANK</div>
                      <div className="text-slate-400 text-xs">60 qty · avg ₹1,640</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-sm">₹1,04,220</div>
                    <div className="text-emerald-400 font-bold text-xs">+5.9%</div>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/40 flex items-center justify-center font-bold text-fuchsia-300 text-xs">
                      TCS
                    </span>
                    <div>
                      <div className="text-white font-bold text-sm">TCS</div>
                      <div className="text-slate-400 text-xs">30 qty · avg ₹3,980</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-sm">₹1,15,260</div>
                    <div className="text-rose-400 font-bold text-xs">−1.4%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Available Cash Progress + Open Orders) */}
          <div className="lg:col-span-5 space-y-5 sm:space-y-6 flex flex-col justify-between">
            {/* Available Cash Glass Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] hover:border-purple-400/35 transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_10px_25px_rgba(0,0,0,0.35)]">
              <div className="text-[11px] font-mono uppercase tracking-widest text-purple-200/80 font-semibold">
                AVAILABLE CASH
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1 mb-3">
                ₹3,84,120
              </div>

              {/* Glass Progress Bar (Light Purple / Lavender) */}
              <div className="h-2.5 rounded-full bg-white/10 backdrop-blur-sm overflow-hidden border border-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-400 via-fuchsia-400 to-indigo-300 shadow-[0_0_14px_rgba(192,132,252,0.6)]"
                  style={{ width: "62%" }}
                />
              </div>
              <div className="flex justify-between text-xs font-mono text-slate-300 mt-2 font-medium">
                <span>Reserved ₹1.4L</span>
                <span className="text-purple-300 font-bold">62% deployed</span>
              </div>
            </div>

            {/* Open Orders Glass Card (Balanced with 4 items) */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] hover:border-purple-400/35 transition-all flex-1 flex flex-col justify-between shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_10px_25px_rgba(0,0,0,0.35)]">
              <div className="text-[11px] font-mono uppercase tracking-widest text-purple-200/80 font-semibold mb-3">
                OPEN ORDERS
              </div>
              <div className="space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                  <span className="text-white font-bold text-sm">WIPRO LIMIT</span>
                  <span className="px-3 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200 font-bold text-xs">
                    OPEN
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                  <span className="text-white font-bold text-sm">NIFTY FUT</span>
                  <span className="px-3 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/40 text-violet-200 font-bold text-xs">
                    MIS
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                  <span className="text-white font-bold text-sm">SBIN MARKET</span>
                  <span className="px-3 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200 font-bold text-xs">
                    FILLED
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-white font-bold text-sm">RELIANCE CE</span>
                  <span className="px-3 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200 font-bold text-xs">
                    ACTIVE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
   4. DATA CONSTANTS
   ------------------------------------------------------------- */
const TICKERS = [
  { s: "NIFTY 50", p: "25,378.40", c: "+0.49%", d: "up" },
  { s: "SENSEX", p: "82,890.94", c: "+0.48%", d: "up" },
  { s: "BANKNIFTY", p: "51,942.30", c: "+0.61%", d: "up" },
  { s: "RELIANCE", p: "₹1,226.40", c: "+0.00%", d: "flat" },
  { s: "HDFCBANK", p: "₹1,642.10", c: "-0.35%", d: "down" },
  { s: "TCS", p: "₹3,912.55", c: "+0.82%", d: "up" },
  { s: "INFY", p: "₹1,498.20", c: "-0.21%", d: "down" },
  { s: "ICICIBANK", p: "₹1,284.70", c: "+1.04%", d: "up" },
];

const NAV_ITEMS = [
  { id: "hero", label: "HOME" },
  { id: "platform", label: "PLATFORM" },
  { id: "how", label: "HOW IT WORKS" },
  { id: "features", label: "FEATURES" },
  { id: "testimonials", label: "REVIEWS" },
  { id: "portal", label: "PORTAL" },
];

/* -------------------------------------------------------------
   MAIN COMPONENT: 3D SPATIAL LANDING PAGE
   ------------------------------------------------------------- */
export default function LandingPage() {
  return (
    <LandingExperience>
      {/* Floating Aurora Plasma Spheres (Multi-color ambient glow) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full blur-[140px] opacity-30 animate-pulse"
          style={{
            background: "radial-gradient(circle, rgba(6, 182, 212, 0.35), transparent 70%)",
            transform: "translate(calc(var(--pointer-x, 0) * 35px), calc(var(--pointer-y, 0) * 35px))",
          }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[650px] h-[650px] rounded-full blur-[160px] opacity-25"
          style={{
            background: "radial-gradient(circle, rgba(249, 115, 22, 0.22), transparent 70%)",
            transform: "translate(calc(var(--pointer-x, 0) * -25px), calc(var(--pointer-y, 0) * -25px))",
          }}
        />
        <div
          className="absolute -bottom-40 left-1/3 w-[800px] h-[800px] rounded-full blur-[180px] opacity-20"
          style={{
            background: "radial-gradient(circle, rgba(168, 85, 247, 0.22), transparent 70%)",
          }}
        />
      </div>

      {/* ================= PREMIUM FULL-WIDTH GLASSMORPHIC NAVBAR ================= */}
      <header
        data-landing-header
        data-landing
        className="fixed top-0 left-0 right-0 z-50 w-full h-[58px] border-b border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.35)]"
        style={{
          background: 'rgba(6, 9, 18, 0.72)',
          backdropFilter: 'blur(24px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
        }}
      >
        {/* Top specular highlight — simulates real glass light refraction */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 via-white/25 to-transparent pointer-events-none" />

        <div className="w-full h-full px-5 sm:px-6 lg:px-8 flex items-center justify-between relative">
          {/* ── Brand ── */}
          <Link prefetch={false} href="/" className="flex items-center gap-2.5 shrink-0 group">
            <BrandLogo compact className="text-white" />
          </Link>

          {/* ── Center Navigation ── */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <a key={item.id} href={`#${item.id}`} data-landing-nav={item.id}
                aria-current={item.id === "hero" ? "location" : undefined}
                className="landing-nav-link relative px-3.5 py-[6px] rounded-lg text-[12px] font-medium tracking-wide transition-all duration-250 text-white/50 hover:text-white/80 hover:bg-white/[0.05]">
                <div className="landing-nav-line absolute -bottom-[1px] left-3 right-3 h-[2px] rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                {item.label}
              </a>
            ))}
          </div>

          {/* ── Right Actions ── */}
          <div className="flex items-center gap-2 shrink-0">
            <LandingAuthLink mode="login"
              className="px-4 py-[6px] rounded-lg text-[12px] font-medium text-white/60 hover:text-white hover:bg-white/[0.07] transition-all cursor-pointer"
            >
              Log In
            </LandingAuthLink>
            <LandingAuthLink mode="register"
              className="relative px-5 py-[7px] rounded-lg text-[12px] font-semibold text-white overflow-hidden transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              style={{
                background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
              }}
            >
              {/* Inner glass sheen */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-60 pointer-events-none" />
              <span className="relative">Sign Up</span>
            </LandingAuthLink>
          </div>
        </div>
      </header>

      <p className="text-xs text-slate-400 text-center px-4 py-2">Illustrative preview: all homepage prices, balances, orders and trader stories are sample data, not live quotes or measured results.</p>
      {/* ================= TICKER MARQUEE ================= */}
      <div
        data-landing-ticker
        className="fixed top-[58px] left-0 right-0 z-40 w-full border-b border-white/[0.06] overflow-hidden"
        style={{
          background: 'rgba(4, 7, 14, 0.65)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex animate-ticker-scroll py-2">
          {[...TICKERS, ...TICKERS, ...TICKERS].map((t, idx) => (
            <div key={idx} className="flex items-center gap-2 px-6 whitespace-nowrap text-[11px] font-mono shrink-0">
              <span className="text-white/40 font-semibold">{t.s}</span>
              <span className="text-white/80 font-medium">{t.p}</span>
              <span className={`font-bold ${t.d === "up" ? "text-emerald-400" : t.d === "down" ? "text-rose-400" : "text-white/30"}`}>
                {t.c}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ================= 1. SECTION 1: SPATIAL 3D HERO (PERFECT 100% ZOOM FIT) ================= */}
      <section
        id="hero"
        className="relative z-10 min-h-screen flex flex-col items-center justify-center pt-24 pb-8 sm:pt-26 sm:pb-12 px-6 text-center scroll-mt-24"
      >
        {/* Kinetic 3D Heading */}
        <div
          className="relative max-w-4xl mx-auto space-y-4"
          style={{
            transform: "perspective(1200px) rotateX(calc(var(--pointer-y, 0) * -6deg)) rotateY(calc(var(--pointer-x, 0) * 6deg))",
            transition: "transform 0.15s ease-out",
          }}
        >
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black uppercase tracking-tighter leading-[0.98]">
            <AnimatedPhrase
              phrase="MASTER THE MARKET."
              className=""
              letterClassName="text-white"
            />
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-400 drop-shadow-[0_0_35px_rgba(6,182,212,0.45)]">
              ZERO FINANCIAL RISK.
            </span>
          </h1>

          <p className="text-white/50 text-sm sm:text-base max-w-xl mx-auto leading-relaxed pt-1 font-normal">
            Experience institutional-grade paper trading with ₹10,00,000 virtual capital in spatial 3D.
            Practice intraday equities, F&amp;O options strategies, and algo risk rules on real-time market data.
          </p>
        </div>

        {/* Interactive Action Hub */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-7">
          <LandingAuthLink mode="login"
            className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-white font-bold text-sm tracking-wide overflow-hidden transition-all hover:scale-[1.04] active:scale-[0.98] cursor-pointer shadow-[0_4px_24px_rgba(6,182,212,0.25),0_8px_32px_rgba(139,92,246,0.15)]"
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
            }}
          >
            {/* Glass sheen overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />
            <span className="relative">Open Dashboard</span>
            <ArrowRight className="relative w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </LandingAuthLink>

          <a
            href="#platform"
            className="inline-flex items-center gap-1.5 px-6 py-3.5 rounded-xl text-white/70 hover:text-white font-medium text-sm tracking-wide transition-all border border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.05]"
          >
            Explore Platform ↓
          </a>
        </div>

        {/* 3D FLOATING HOLOGRAPHIC PLATFORM SLAB (FITS IN 100% ZOOM FRAME) */}
        <div
          className="relative mt-8 sm:mt-10 max-w-4xl w-full mx-auto"
          style={{
            perspective: "1600px",
          }}
        >
          {/* Floating Parallax Depth Chip 1 (Top Right - Amber/Orange Accent) */}
          <div
            className="hidden sm:flex absolute -top-5 -right-4 z-30 px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-orange-500/40 shadow-xl shadow-orange-500/10 backdrop-blur-xl items-center gap-2.5 transition-transform duration-200"
            style={{
              transform: "translate3d(calc(var(--pointer-x, 0) * 18px), calc(var(--pointer-y, 0) * 18px), 35px)",
            }}
          >
            <div className="w-7 h-7 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold text-xs">
              ₹
            </div>
            <div className="text-left">
              <div className="text-[9px] font-mono text-slate-400 uppercase">Portfolio Edge</div>
              <div className="text-xs font-black font-mono text-white">₹10.4L Allocated</div>
            </div>
          </div>

          {/* Floating Parallax Depth Chip 2 (Bottom Left - Emerald Accent) */}
          <div
            className="hidden sm:flex absolute -bottom-5 -left-4 z-30 px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-emerald-500/40 shadow-xl shadow-emerald-500/10 backdrop-blur-xl items-center gap-2.5 transition-transform duration-200"
            style={{
              transform: "translate3d(calc(var(--pointer-x, 0) * -16px), calc(var(--pointer-y, 0) * -16px), 30px)",
            }}
          >
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs">
              ✓
            </div>
            <div className="text-left">
              <div className="text-[9px] font-mono text-slate-400 uppercase">Sample Order Match</div>
              <div className="text-xs font-black font-mono text-emerald-400">TCS · 50 @ 3,912 FILLED</div>
            </div>
          </div>

          {/* Holographic Slab */}
          <div
            className="rounded-3xl bg-gradient-to-b from-[#0a1122]/90 to-[#060a14]/95 backdrop-blur-3xl border border-cyan-500/35 hover:border-cyan-400/60 p-5 sm:p-7 shadow-2xl transition-all duration-300 ease-out text-left"
            style={{
              transform: "rotateX(calc(12deg + var(--pointer-y, 0) * -12deg)) rotateY(calc(var(--pointer-x, 0) * 14deg)) translateZ(20px)",
              boxShadow: "0 0 50px rgba(6, 182, 212, 0.15), 0 30px 70px rgba(0, 0, 0, 0.8)",
            }}
          >
            {/* Hologram Header Bar */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                <span className="font-mono text-xs font-bold tracking-wider text-cyan-300 ml-2">
                  stocksimulator.app // SPATIAL SCANNER
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-emerald-400 font-bold">SAMPLE FEED</span>
              </div>
            </div>

            {/* Split Slabs */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
              {/* Left Column: Wallet & Positions */}
              <div className="md:col-span-5 space-y-3 border-b md:border-b-0 md:border-r border-white/[0.06] md:pr-5 pb-4 md:pb-0 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block">
                    PAPER WALLET — BUYING POWER
                  </span>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-0.5">₹10,00,000.00</div>
                  <span className="text-[11px] font-mono text-slate-400">Margin used ₹1,24,528 • Free ₹8,75,472</span>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-950/50 border border-emerald-500/30">
                  <div className="text-xl font-black font-mono text-emerald-400">+₹14,280.50</div>
                  <div className="text-[11px] text-emerald-300 font-mono">Intraday P&amp;L • +1.42% today</div>
                </div>

                <div className="space-y-1 font-mono text-[11px]">
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest">Live Positions</span>
                  <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                    <span className="text-white">RELIANCE</span>
                    <span className="text-emerald-400 font-bold">+2.1%</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                    <span className="text-white">NIFTY 25400 CE</span>
                    <span className="text-emerald-400 font-bold">+18.4%</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Candlestick & Greeks */}
              <div className="md:col-span-7 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-2.5">
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-white font-mono">RELIANCE</span>
                    <span className="text-[11px] text-slate-500 font-mono ml-2">NSE • 1D</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                    ₹1,226.40 +1.42%
                  </span>
                </div>

                {/* Candlestick Hologram */}
                <div className="h-28 sm:h-32 rounded-2xl bg-slate-950/80 border border-white/[0.05] p-2.5 flex items-end justify-between gap-1.5 overflow-hidden">
                  {[50, 65, 45, 75, 55, 85, 70, 95, 80, 100, 88].map((h, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full rounded-t ${idx % 2 === 0 ? "bg-emerald-400 shadow-md shadow-emerald-500/40" : "bg-rose-500 shadow-md shadow-rose-500/40"
                          }`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-2 text-[10px] sm:text-[11px] font-mono text-center pt-2.5 mt-2 border-t border-white/[0.06]">
                  <div className="p-1 rounded bg-white/[0.02]">Δ <b className="text-cyan-400">0.52</b></div>
                  <div className="p-1 rounded bg-white/[0.02]">Γ <b className="text-cyan-400">0.008</b></div>
                  <div className="p-1 rounded bg-white/[0.02]">Θ <b className="text-rose-400">-4.21</b></div>
                  <div className="p-1 rounded bg-white/[0.02]">IV <b className="text-amber-400">12.6%</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= 2. SECTION 2: THE PLATFORM (3D SCROLL SHOWCASE DECK - ONE FRAME FIT) ================= */}
      <section
        id="platform"
        className="relative z-10 flex flex-col items-center pt-4 pb-12 sm:pt-6 sm:pb-16 px-4 sm:px-6 text-center scroll-mt-24"
      >
        <div className="max-w-5xl w-full mx-auto space-y-4 sm:space-y-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest text-slate-300 bg-white/[0.05] border border-white/10 backdrop-blur-md shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span>THE PLATFORM // SPATIAL DECK</span>
            </div>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight leading-[1.05]">
              <AnimatedPhrase
                phrase="A dashboard that"
                className=""
                letterClassName="text-white"
              />{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-400 drop-shadow-[0_0_35px_rgba(6,182,212,0.45)]">
                tilts to meet you
              </span>
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed pt-0.5">
              Scroll and watch it settle into place. Every number here is driven by the same engine that powers your trades.
            </p>
          </div>

          {/* Interactive 3D Platform Showcase Deck */}
          <PlatformShowcase />
        </div>
      </section>

      <LandingScrollSections />

      {/* ================= 7. SECTION 7: CTA & FOOTER ================= */}
      <section id="portal" className="relative z-10 pt-5 pb-16 sm:pt-7 sm:pb-24 px-6 text-center scroll-mt-24">
        <div className="max-w-5xl mx-auto">
          <TiltCard glowColor="rgba(249, 115, 22, 0.35)">
            <div
              className="relative rounded-3xl p-8 sm:p-12 lg:p-14 overflow-hidden bg-gradient-to-b from-[#180e1c]/95 via-[#0e0f1c]/95 to-[#070a14]/95 border border-orange-500/35 hover:border-orange-500/65 shadow-2xl transition-all duration-300"
              style={{
                boxShadow: "0 0 80px rgba(249, 115, 22, 0.18), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              {/* Glowing Ambient Nebulae */}
              <div className="absolute -top-24 -left-24 w-80 h-80 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-orange-500/12 rounded-full blur-3xl pointer-events-none" />

              {/* Multi-Spectrum Top Hairline */}
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-400 via-rose-500 to-purple-500" />

              <div className="relative z-10 space-y-6 sm:space-y-7">
                {/* Eyebrow */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest text-orange-300 bg-orange-500/10 border border-orange-500/25 backdrop-blur-md shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                  <span>LIVE SIMULATION ENGINE // INSTANT ACTIVATION</span>
                </div>

                {/* Main Heading */}
                <div className="space-y-3">
                  <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase text-white tracking-tight leading-[1.08]">
                    <AnimatedPhrase
                      phrase="Your First Trade Is"
                      className=""
                      letterClassName="text-white"
                    />
                    <br />
                    <span className="text-transparent bg-clip-text bg-[linear-gradient(135deg,#ff9d42_0%,#ff5e7e_50%,#c084fc_100%)] drop-shadow-[0_2px_30px_rgba(255,94,126,0.35)]">
                      Waiting For You.
                    </span>
                  </h2>
                  <p className="text-slate-300 text-xs sm:text-sm lg:text-base max-w-2xl mx-auto leading-relaxed">
                    Build the instincts of an institutional trader with zero financial risk. Unlock ₹10,00,000 in virtual seed capital and place your first paper order in under 60 seconds.
                  </p>
                </div>

                {/* Interactive Simulated Order Ticket Preview */}
                <div className="max-w-2xl mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl p-3.5 sm:p-4 shadow-inner">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                        BUY
                      </span>
                      <span className="text-white font-bold">NIFTY 25,400 CE</span>
                      <span className="text-slate-400 text-[11px]">1 LOT (50 QTY)</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-slate-400">SEED: <span className="text-emerald-400 font-bold">₹10,00,000</span></span>
                      <span className="text-slate-400">SAMPLE: <span className="text-cyan-400 font-bold">—</span></span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> READY
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
                  <LandingAuthLink
                    mode="register"
                    className="group inline-flex items-center justify-center gap-3 px-9 py-4 rounded-full bg-[linear-gradient(135deg,#ff7a29_0%,#f43f5e_50%,#7c3aed_100%)] hover:bg-[linear-gradient(135deg,#ff8f4a_0%,#fb7185_50%,#8b5cf6_100%)] text-white font-bold text-sm sm:text-base tracking-wide shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_10px_35px_-4px_rgba(255,122,41,0.5),0_8px_25px_-4px_rgba(124,58,237,0.4)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_16px_45px_-4px_rgba(255,122,41,0.65),0_12px_32px_-4px_rgba(124,58,237,0.55)] border border-white/25 hover:scale-105 transition-all duration-200 w-full sm:w-auto cursor-pointer"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1.5" />
                  </LandingAuthLink>

                  <a
                    href="#platform"
                    className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white font-semibold text-sm border border-white/12 hover:border-white/25 transition-all duration-200 w-full sm:w-auto"
                  >
                    <span>Explore Dashboard Preview</span>
                  </a>
                </div>

                {/* Trust Badges */}
                <div className="pt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> ₹10,00,000 Seed Capital
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Real NSE/NFO Tick Stream
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-purple-400" /> 100% Risk-Free Practice
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-amber-400" /> Zero Credit Card Required
                  </span>
                </div>
              </div>
            </div>
          </TiltCard>
        </div>

        {/* Comprehensive Institutional Footer */}
        <footer className="pt-20 pb-12 max-w-7xl mx-auto text-left border-t border-white/[0.08] mt-24 relative">
          {/* Top Horizon Glow Beam */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 via-orange-500/40 to-transparent" />

          {/* Main Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 sm:gap-12 mb-14">
            {/* Brand & Mission Column (Col 5) */}
            <div className="md:col-span-5 space-y-4">
              <BrandLogo className="text-white" tagline="Indian financial market engine" />
              <p className="text-xs sm:text-[13px] text-slate-400 leading-relaxed max-w-md font-normal">
                India&apos;s premier institutional-fidelity paper trading platform. Practise NSE cash equities and NFO options and futures risk-free with ₹10,00,000 in virtual seed capital.
              </p>

              {/* Developer & Social Badges */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <Link prefetch={false}
                  href="/stocks"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-cyan-500/40 text-slate-400 hover:text-cyan-300 text-xs font-mono transition-all duration-200"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Explore Stocks</span>
                </Link>
                <Link prefetch={false}
                  href="/portfolio"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-cyan-500/40 text-slate-400 hover:text-cyan-300 text-xs font-mono transition-all duration-200"
                >
                  <PieChart className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Portfolio</span>
                </Link>
                <a
                  href="#testimonials"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-cyan-500/40 text-slate-400 hover:text-cyan-300 text-xs font-mono transition-all duration-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Trader Reviews</span>
                </a>
              </div>
            </div>

            {/* Navigation Columns (Col 7 split into 3) */}
            <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
              {/* Product */}
              <div className="space-y-3 font-mono">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  PLATFORM
                </h4>
                <ul className="space-y-2 text-xs text-slate-400">
                  <li>
                    <Link prefetch={false} href="/stocks" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5 font-bold text-slate-200">
                      <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Stock Explorer</span>
                    </Link>
                  </li>
                  <li>
                    <Link prefetch={false} href="/stocks" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      <span>Equities Overview</span>
                    </Link>
                  </li>
                  <li>
                    <Link prefetch={false} href="/options" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      <span>Options Chain (L2)</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">LIVE</span>
                    </Link>
                  </li>
                  <li>
                    <Link prefetch={false} href="/options" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      <span>Iron Condor Lab</span>
                    </Link>
                  </li>
                  <li>
                    <Link prefetch={false} href="/mentor" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      <span>AI Trade Debriefs</span>
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Resources */}
              <div className="space-y-3 font-mono">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  RESOURCES
                </h4>
                <ul className="space-y-2 text-xs text-slate-400">
                  <li><a href="#how" className="hover:text-orange-300 transition-colors">How It Works</a></li>
                  <li><a href="#features" className="hover:text-orange-300 transition-colors">Platform Features</a></li>
                  <li><a href="#testimonials" className="hover:text-orange-300 transition-colors">Trader Reviews</a></li>
                  <li><Link prefetch={false} href="/options" className="hover:text-orange-300 transition-colors">Risk Calculator</Link></li>
                </ul>
              </div>

              {/* Legal & Compliance */}
              <div className="space-y-3 font-mono">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  COMPLIANCE
                </h4>
                <ul className="space-y-2 text-xs text-slate-400">
                  <li><Link prefetch={false} href="/about" className="hover:text-purple-300 transition-colors">About Paper Trading</Link></li>
                  <li><Link prefetch={false} href="/terms" className="hover:text-purple-300 transition-colors">Terms of Service</Link></li>
                  <li><Link prefetch={false} href="/privacy" className="hover:text-purple-300 transition-colors">Privacy Policy</Link></li>
                  <li><Link prefetch={false} href="/terms" className="hover:text-purple-300 transition-colors">Risk Disclosure</Link></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Regulatory Disclaimer (SEBI Compliance Card) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900/80 via-[#0a0e1a]/80 to-slate-900/80 border border-white/[0.08] backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                <Shield className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                    EDUCATIONAL PAPER TRADING NOTICE
                  </span>
                  <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                    100% SIMULATED
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed max-w-4xl font-normal">
                  Stock Simulator is strictly a simulated educational platform. We do not accept real currency deposits, hold securities, or place live exchange orders. All trades, P&amp;L statements, margin allocations, and leaderboard statistics are simulated. Trading actual derivatives carries substantial market risk.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Horizon Strip */}
          <div className="pt-6 mt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-500">
            <div className="flex items-center gap-2">
              <span>&copy; 2026 Stock Simulator Inc.</span>
              <span>•</span>
              <span className="text-slate-400">Engineered for Indian Capital Markets</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                NSE TICK STREAM
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                NFO DERIVATIVES
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                NIFTY / BANKNIFTY OPTIONS
              </span>
              <span>•</span>
              <a
                href="#hero"
                className="hover:text-cyan-300 transition-colors flex items-center gap-1 text-slate-300 font-semibold ml-1"
              >
                Top ↑
              </a>
            </div>
          </div>
        </footer>
      </section>
    </LandingExperience>
  );
}
