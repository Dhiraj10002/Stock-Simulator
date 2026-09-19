"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Zap,
  Activity,
  Compass,
  Sparkles,
  ChevronDown,
  Shield,
  Sliders,
  CheckCircle2,
  Award,
  Star,
  ExternalLink,
  Code2,
  Globe,
  BrainCircuit,
} from "lucide-react";

/* -------------------------------------------------------------
   1. HARDWARE-ACCELERATED SPATIAL 3D CANVAS
   ------------------------------------------------------------- */
function SpatialCanvas({ scrollProgress, mousePos }: { scrollProgress: number; mousePos: { x: number; y: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const count = 420;
    const particles = Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 2200,
      y: (Math.random() - 0.5) * 2200,
      z: Math.random() * 1000 + 1,
      size: Math.random() * 2.2 + 0.8,
      color: Math.random() > 0.35 ? "rgba(6, 182, 212, " : "rgba(16, 185, 129, ",
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const fov = 400;
      const cx = width / 2 + mousePos.x * 70;
      const cy = height / 2 + mousePos.y * 70;
      const speed = 1.2 + scrollProgress * 6;

      for (let i = 0; i < count; i++) {
        const p = particles[i];
        p.z -= speed;
        if (p.z <= 0) {
          p.z = 1000;
          p.x = (Math.random() - 0.5) * 2200;
          p.y = (Math.random() - 0.5) * 2200;
        }

        const k = fov / p.z;
        const x = p.x * k + cx;
        const y = p.y * k + cy;

        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          const alpha = Math.min(1, Math.max(0.08, (1 - p.z / 1000) * 1.25));
          const rad = Math.max(0.6, p.size * k * 0.8);

          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${alpha})`;
          ctx.shadowColor = alpha > 0.6 ? "#06b6d4" : "transparent";
          ctx.shadowBlur = alpha > 0.6 ? 8 : 0;
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animId);
    };
  }, [scrollProgress, mousePos]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.88 }}
    />
  );
}

/* -------------------------------------------------------------
   2. REUSABLE 3D TILT CARD (MOTIONSITES SIGNATURE)
   ------------------------------------------------------------- */
function TiltCard({
  children,
  className = "",
  glowColor = "rgba(6, 182, 212, 0.2)",
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setRotate({
      x: (y - 0.5) * -14,
      y: (x - 0.5) * 14,
    });
    setGlare({
      x: x * 100,
      y: y * 100,
      opacity: 0.25,
    });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
    setGlare((g) => ({ ...g, opacity: 0 }));
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative rounded-3xl transition-transform duration-200 ease-out ${className}`}
      style={{
        transform: `perspective(1100px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) translateZ(8px)`,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Specular glare layer */}
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none z-20 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, ${glowColor}, transparent 60%)`,
          opacity: glare.opacity,
        }}
      />
      {children}
    </div>
  );
}

/* -------------------------------------------------------------
   3. DATA CONSTANTS
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

const FEATURES_DATA = [
  {
    icon: Activity,
    badge: "ORDER DEPTH",
    title: "Level 2 Market Depth (DOM)",
    description: "5-tier bid/ask ladder with visual depth bars that reveal order-queue dynamics in real time.",
  },
  {
    icon: Sliders,
    badge: "DERIVATIVES",
    title: "Options Chain & Greek Analytics",
    description: "Live NIFTY / BANKNIFTY calls and puts with real-time Delta, Gamma, Theta and Vega on every strike.",
  },
  {
    icon: Zap,
    badge: "LOW LATENCY",
    title: "Real-Time WebSocket Engine",
    description: "Sub-50ms tick streaming mirrored from exchange broadcasts for lifelike, low-latency price action.",
  },
  {
    icon: Shield,
    badge: "PROTECTION",
    title: "Institutional Risk Guard",
    description: "Max daily-loss limits, automatic circuit-breaker cutoffs and margin-call alerts keep discipline enforced.",
  },
  {
    icon: BrainCircuit,
    badge: "AI COPILOT",
    title: "AI Trading Mentor",
    description: "Instant post-trade feedback analysing your risk-reward ratio and flagging revenge-trading behaviour.",
  },
  {
    icon: Compass,
    badge: "PORTFOLIO",
    title: "Multi-Wallet Management",
    description: "Segregate strategies into distinct accounts - Scalping, Swing and F&O Hedging - with isolated P&L.",
  },
];

const LEADERBOARD_DATA = [
  { rank: "1", name: "Arjun_FnO", returnRate: "+84.2%", winRate: "Win 78%", badge: "Gold #1", color: "from-amber-400 to-amber-600" },
  { rank: "2", name: "SwingQueen", returnRate: "+62.1%", winRate: "Win 71%", badge: "Silver #2", color: "from-slate-200 to-slate-400" },
  { rank: "3", name: "Scalp_Raja", returnRate: "+45.8%", winRate: "Win 69%", badge: "Bronze #3", color: "from-amber-600 to-amber-800" },
];

const TESTIMONIALS_DATA = [
  {
    quote: "Tested my Iron Condor strategy for 3 months here before risking real capital. The Greeks and margin behaviour matched my broker almost exactly.",
    name: "Neha Kulkarni",
    role: "College Finance Student",
    initials: "NK",
  },
  {
    quote: "Execution speed and Level 2 depth feel identical to my real broker terminal. I run my morning warm-up scalps here every single day.",
    name: "Rohit Verma",
    role: "Full-Time Intraday Scalper",
    initials: "RV",
  },
  {
    quote: "I train 500+ students with zero financial risk. The AI mentor feedback and leaderboard turn practice into a genuinely competitive classroom.",
    name: "Sanjay Menon",
    role: "Finance Educator",
    initials: "SM",
  },
];

/* -------------------------------------------------------------
   4. HOMEPAGE COMPONENT (3D MOTIONSITES FINAL)
   ------------------------------------------------------------- */
export default function LandingPage() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [cameraMode, setCameraMode] = useState<"scroll" | "orbit">("scroll");

  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(total > 0 ? window.scrollY / total : 0);
    };

    const onMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5,
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[#04060b] text-slate-100 font-sans overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 3D Global Perspective Particle Canvas */}
      <SpatialCanvas scrollProgress={scrollProgress} mousePos={mousePos} />

      {/* Floating Aurora Plasma Spheres (MotionSites signature glow) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full blur-[140px] opacity-40 animate-pulse"
          style={{
            background: "radial-gradient(circle, rgba(6, 182, 212, 0.35), transparent 70%)",
            transform: `translate(${mousePos.x * 50}px, ${mousePos.y * 50}px)`,
          }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[650px] h-[650px] rounded-full blur-[160px] opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(16, 185, 129, 0.3), transparent 70%)",
            transform: `translate(${mousePos.x * -40}px, ${mousePos.y * -40}px)`,
          }}
        />
        <div
          className="absolute -bottom-40 left-1/3 w-[800px] h-[800px] rounded-full blur-[180px] opacity-25"
          style={{
            background: "radial-gradient(circle, rgba(147, 51, 234, 0.25), transparent 70%)",
          }}
        />
      </div>

      {/* ================= HUD HEADER ================= */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between bg-[#04060b]/75 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 via-teal-300 to-emerald-400 p-[1px] shadow-lg shadow-cyan-500/25">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center font-black text-xs text-white">
                SS
              </div>
            </div>
            <div className="font-extrabold text-sm tracking-widest uppercase text-white flex items-center gap-2">
              <span>STOCK SIMULATOR</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                3D SPATIAL
              </span>
            </div>
          </Link>
        </div>

        {/* Center Nav Anchors */}
        <div className="hidden lg:flex items-center gap-7 text-xs font-mono">
          <a href="#hero" className="text-slate-400 hover:text-white transition-colors">HOME</a>
          <a href="#about" className="text-slate-400 hover:text-white transition-colors">ABOUT</a>
          <a href="#features" className="text-slate-400 hover:text-white transition-colors">FEATURES</a>
          <a href="#testimonials" className="text-slate-400 hover:text-white transition-colors">TESTIMONIALS</a>
          <a href="#portal" className="text-cyan-400 hover:text-cyan-300 transition-colors">PORTAL</a>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 border border-white/[0.08] text-xs font-mono">
            <button
              onClick={() => setCameraMode("scroll")}
              className={`px-2.5 py-0.5 rounded-full text-[11px] transition-all ${
                cameraMode === "scroll" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Scroll
            </button>
            <button
              onClick={() => setCameraMode("orbit")}
              className={`px-2.5 py-0.5 rounded-full text-[11px] transition-all ${
                cameraMode === "orbit" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Gyro
            </button>
          </div>

          <Link
            href="/trade"
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 transition-all hover:scale-105"
          >
            Launch Terminal →
          </Link>
        </div>
      </header>

      {/* ================= TICKER MARQUEE ================= */}
      <div className="fixed top-16 left-0 right-0 z-40 bg-[#060912]/80 backdrop-blur-md border-b border-white/[0.05] overflow-hidden">
        <div className="flex animate-ticker-scroll py-2">
          {[...TICKERS, ...TICKERS, ...TICKERS].map((t, idx) => (
            <div key={idx} className="flex items-center gap-2 px-6 whitespace-nowrap text-[11px] font-mono shrink-0">
              <span className="text-slate-400 font-semibold">{t.s}</span>
              <span className="text-white">{t.p}</span>
              <span className={`font-bold ${t.d === "up" ? "text-emerald-400" : t.d === "down" ? "text-rose-400" : "text-slate-500"}`}>
                {t.c}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ================= 1. SECTION 1: SPATIAL 3D HERO ================= */}
      <section id="hero" className="relative z-10 min-h-screen flex flex-col items-center justify-center pt-36 pb-24 px-6 text-center">
        {/* Iridescent Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-mono uppercase tracking-widest backdrop-blur-xl shadow-lg shadow-cyan-500/10 mb-8 animate-bounce">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>MOTIONSITES 3D ENGINE • SPATIAL PAPER TRADING</span>
        </div>

        {/* Kinetic 3D Heading */}
        <div
          className="relative max-w-5xl mx-auto space-y-4"
          style={{
            transform: `perspective(1200px) rotateX(${mousePos.y * -8}deg) rotateY(${mousePos.x * 8}deg)`,
            transition: "transform 0.15s ease-out",
          }}
        >
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.95] text-white">
            MASTER THE MARKET.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-400 drop-shadow-[0_0_35px_rgba(6,182,212,0.45)]">
              ZERO FINANCIAL RISK.
            </span>
          </h1>

          <p className="text-slate-400 text-base sm:text-xl max-w-2xl mx-auto leading-relaxed pt-3">
            Experience institutional-grade paper trading with ₹10,00,000 virtual capital in spatial 3D.
            Practice intraday equities, F&amp;O options strategies, and algo risk rules on real-time market data.
          </p>
        </div>

        {/* Dual 3D Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-5 pt-8">
          <Link
            href="/trade"
            className="group px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 text-slate-950 font-black text-sm tracking-wide uppercase shadow-2xl shadow-cyan-500/40 hover:shadow-cyan-500/60 hover:scale-105 transition-all flex items-center gap-2"
          >
            <span>Enter 3D Terminal</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#about"
            className="px-8 py-4 rounded-2xl bg-[#0a1122]/80 hover:bg-[#0f1b36] border border-cyan-500/30 text-white font-bold text-sm tracking-wide transition-all backdrop-blur-xl hover:border-cyan-400/60"
          >
            Explore 3D Features ↓
          </a>
        </div>

        {/* 3D FLOATING HOLOGRAPHIC TERMINAL SLAB */}
        <div
          className="relative mt-16 max-w-4xl w-full mx-auto"
          style={{
            perspective: "1600px",
          }}
        >
          <div
            className="rounded-3xl bg-gradient-to-b from-[#0a1122]/90 to-[#060a14]/95 backdrop-blur-3xl border border-cyan-500/30 p-7 sm:p-8 shadow-2xl transition-transform duration-300 ease-out text-left"
            style={{
              transform: `rotateX(${15 - mousePos.y * 18 - scrollProgress * 14}deg) rotateY(${mousePos.x * 20}deg) translateZ(30px)`,
              boxShadow: "0 0 100px rgba(6, 182, 212, 0.22), 0 35px 80px rgba(0, 0, 0, 0.8)",
            }}
          >
            {/* Hologram Header Bar */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 mb-6">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                <span className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                <span className="font-mono text-xs font-bold tracking-wider text-cyan-300 ml-2">
                  stocksimulator.app // SPATIAL SCANNER
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-emerald-400 font-bold">LIVE FEED</span>
              </div>
            </div>

            {/* Split Slabs */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
              {/* Left Column: Wallet & Positions */}
              <div className="md:col-span-5 space-y-4 border-b md:border-b-0 md:border-r border-white/[0.06] md:pr-6 pb-6 md:pb-0 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block">
                    PAPER WALLET — BUYING POWER
                  </span>
                  <div className="text-3xl font-black font-mono text-white mt-1">₹10,00,000.00</div>
                  <span className="text-xs font-mono text-slate-400">Margin used ₹1,24,528 • Free ₹8,75,472</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/30">
                  <div className="text-2xl font-black font-mono text-emerald-400">+₹14,280.50</div>
                  <div className="text-xs text-emerald-300 font-mono">Intraday P&amp;L • +1.42% today</div>
                </div>

                <div className="space-y-1.5 font-mono text-xs">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">Live Positions</span>
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span className="text-white">RELIANCE</span>
                    <span className="text-emerald-400 font-bold">+2.1%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span className="text-white">NIFTY 25400 CE</span>
                    <span className="text-emerald-400 font-bold">+18.4%</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Candlestick & Greeks */}
              <div className="md:col-span-7 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <span className="text-sm font-bold text-white font-mono">RELIANCE</span>
                    <span className="text-xs text-slate-500 font-mono ml-2">NSE • 1D</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                    ₹1,226.40 +1.42%
                  </span>
                </div>

                {/* Candlestick Hologram */}
                <div className="h-36 rounded-2xl bg-slate-950/80 border border-white/[0.05] p-3 flex items-end justify-between gap-1.5 overflow-hidden">
                  {[50, 65, 45, 75, 55, 85, 70, 95, 80, 100, 88].map((h, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full rounded-t ${
                          idx % 2 === 0 ? "bg-emerald-400 shadow-md shadow-emerald-500/40" : "bg-rose-500 shadow-md shadow-rose-500/40"
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px] font-mono text-center pt-3 mt-2 border-t border-white/[0.06]">
                  <div className="p-1 rounded bg-white/[0.02]">Δ <b className="text-cyan-400">0.52</b></div>
                  <div className="p-1 rounded bg-white/[0.02]">Γ <b className="text-cyan-400">0.008</b></div>
                  <div className="p-1 rounded bg-white/[0.02]">Θ <b className="text-rose-400">-4.21</b></div>
                  <div className="p-1 rounded bg-white/[0.02]">IV <b className="text-amber-400">12.6%</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="pt-20 flex flex-col items-center gap-2 text-slate-500 text-xs font-mono uppercase tracking-widest">
          <span>SCROLL TO DIVE DEEPER</span>
          <ChevronDown className="w-4 h-4 animate-bounce text-cyan-400" />
        </div>
      </section>

      {/* ================= 2. SECTION 2: 3D ABOUT & MATCHING ENGINE ================= */}
      <section id="about" className="relative z-10 py-32 px-6">
        <div className="max-w-6xl mx-auto space-y-16">
          <div className="text-center space-y-3">
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
              WHY CHOOSE US // ENGINE ARCHITECTURE
            </span>
            <h2 className="text-4xl sm:text-5xl font-black uppercase text-white tracking-tight">
              Built for Serious Traders, Not Gamblers.
            </h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
              Our realistic matching engine goes far beyond a simple price feed. Every fill simulates real slippage,
              live liquidity queues, STT and exchange transaction taxes, and circuit breakers.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left 3D Trust Column */}
            <div className="lg:col-span-6 space-y-6">
              {[
                {
                  title: "True-to-market execution",
                  desc: "Order fills respect Level 2 bid/ask depth, partial fills, and queue priority.",
                },
                {
                  title: "Accurate cost modelling",
                  desc: "STT, brokerage, GST, stamp duty and slippage are baked into every P&L calculation.",
                },
                {
                  title: "Circuit breaker safety",
                  desc: "Upper and lower circuits, margin calls, and squared-off positions behave like real NSE/BSE.",
                },
              ].map((item, idx) => (
                <TiltCard key={idx}>
                  <div className="rounded-2xl bg-[#090e1c]/80 backdrop-blur-xl border border-white/[0.08] p-6 flex items-start gap-4">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white mb-1">{item.title}</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </TiltCard>
              ))}
            </div>

            {/* Right 2x2 Stats Bento with 3D Pop */}
            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                { val: "₹10,00,000", label: "Virtual capital on signup", color: "text-cyan-400", border: "border-cyan-500/30" },
                { val: "100% Free", label: "Zero commissions, zero fees forever", color: "text-emerald-400", border: "border-emerald-500/30" },
                { val: "< 10ms", label: "Simulated institutional latency", color: "text-amber-400", border: "border-amber-500/30" },
                { val: "1,200+", label: "NSE Equities, Indices, F&O", color: "text-purple-400", border: "border-purple-500/30" },
              ].map((stat, idx) => (
                <TiltCard key={idx} glowColor="rgba(6, 182, 212, 0.25)">
                  <div className={`h-full rounded-3xl bg-[#0a1122]/80 backdrop-blur-2xl border ${stat.border} p-8 flex flex-col justify-between shadow-xl`}>
                    <div className={`text-3xl sm:text-4xl font-black font-mono ${stat.color} mb-2`}>
                      {stat.val}
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed font-medium">
                      {stat.label}
                    </div>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= 3. SECTION 3: 3D PRO FEATURES BENTO ================= */}
      <section id="features" className="relative z-10 py-32 px-6">
        <div className="max-w-6xl mx-auto space-y-16">
          <div className="text-center space-y-3">
            <span className="text-xs font-mono uppercase tracking-widest text-emerald-400">
              PLATFORM FEATURES // COMPLETE SUITE
            </span>
            <h2 className="text-4xl sm:text-5xl font-black uppercase text-white tracking-tight">
              Everything a Pro Desk Needs
            </h2>
            <p className="text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
              Institutional tooling, retail simplicity. 6 spatial modules engineered to build disciplined traders.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES_DATA.map((feature, idx) => (
              <TiltCard key={idx} glowColor="rgba(6, 182, 212, 0.2)">
                <div className="h-full rounded-3xl bg-[#0a1122]/85 backdrop-blur-2xl border border-white/[0.08] hover:border-cyan-500/40 p-7 flex flex-col justify-between shadow-2xl transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        <feature.icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]">
                        {feature.badge}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{feature.description}</p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-cyan-400">
                    <span>EXPLORE MODULE</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ================= 4. SECTION 4: 3D LEADERBOARD & REVIEWS ================= */}
      <section id="testimonials" className="relative z-10 py-32 px-6">
        <div className="max-w-6xl mx-auto space-y-16">
          {/* Weekly Leaderboard 3D Podium */}
          <TiltCard glowColor="rgba(245, 158, 11, 0.2)">
            <div className="rounded-3xl bg-[#090e1c]/90 backdrop-blur-2xl border border-amber-500/30 p-8 sm:p-10 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-white/[0.08] pb-5">
                <div className="flex items-center gap-3">
                  <Award className="w-6 h-6 text-amber-400" />
                  <h3 className="text-2xl font-black uppercase text-white tracking-tight">
                    Weekly Simulated Leaderboard
                  </h3>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>LIVE • RESETS MONDAY</span>
                </div>
              </div>

              {/* 3 Podium Ranks */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {LEADERBOARD_DATA.map((trader, i) => (
                  <div
                    key={i}
                    className="p-6 rounded-2xl bg-slate-950/70 border border-white/[0.06] flex items-center gap-4 hover:border-amber-500/40 transition-all"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${trader.color} flex items-center justify-center font-black text-slate-950 text-base shadow-lg shrink-0`}>
                      {trader.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{trader.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono font-bold text-emerald-400">{trader.returnRate}</span>
                        <span className="text-[10px] font-mono text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-950/50 border border-cyan-500/20">
                          {trader.winRate}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>

          {/* Testimonials */}
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
                VERIFIED SOCIAL PROOF
              </span>
              <h2 className="text-3xl sm:text-4xl font-black uppercase text-white tracking-tight">
                Trusted by Students, Scalpers &amp; Educators
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TESTIMONIALS_DATA.map((t, idx) => (
                <TiltCard key={idx} glowColor="rgba(6, 182, 212, 0.2)">
                  <div className="h-full rounded-3xl bg-[#090e1c]/80 backdrop-blur-xl border border-white/[0.08] p-7 flex flex-col justify-between shadow-xl">
                    <div>
                      <div className="flex items-center gap-1 text-amber-400 mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                        ))}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed italic mb-6">
                        &ldquo;{t.quote}&rdquo;
                      </p>
                    </div>

                    <div className="pt-4 border-t border-white/[0.06] flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-xs">
                        {t.initials}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{t.name}</div>
                        <div className="text-[10px] text-slate-400">{t.role}</div>
                      </div>
                    </div>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= 5. SECTION 5: 3D PORTAL CTA & FOOTER ================= */}
      <section id="portal" className="relative z-10 py-32 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <TiltCard glowColor="rgba(6, 182, 212, 0.35)">
            <div
              className="relative rounded-3xl p-12 overflow-hidden bg-gradient-to-b from-[#0b1428]/95 to-[#050914]/95 border border-cyan-500/40 shadow-2xl"
              style={{
                boxShadow: "0 0 120px rgba(6, 182, 212, 0.25)",
              }}
            >
              {/* Glowing Center Core */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-6">
                <span className="text-xs font-mono uppercase tracking-widest text-cyan-300">
                  ZERO BARRIERS • ZERO CAPITAL RISK
                </span>
                <h2 className="text-4xl sm:text-5xl font-black uppercase text-white tracking-tight leading-tight">
                  READY TO TEST YOUR EDGE WITHOUT RISKING CAPITAL?
                </h2>
                <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
                  Join thousands of traders sharpening their strategy on live Indian markets. ₹10,00,000 demo capital granted instantly.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                  <Link
                    href="/trade"
                    className="px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-sm uppercase tracking-wide shadow-xl shadow-cyan-500/30 hover:scale-105 transition-all"
                  >
                    Start Trading Free →
                  </Link>
                  <a
                    href="#features"
                    className="px-8 py-4 rounded-2xl border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 text-white font-bold text-sm tracking-wide transition-all"
                  >
                    Explore 3D Features
                  </a>
                </div>
              </div>
            </div>
          </TiltCard>
        </div>

        {/* Comprehensive Institutional Footer */}
        <footer className="pt-28 pb-12 max-w-6xl mx-auto text-left border-t border-white/[0.06] mt-24">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            {/* Brand Column */}
            <div className="col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-xs">
                  SS
                </div>
                <span className="font-extrabold text-sm text-white">STOCK SIMULATOR</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                The institutional-grade 3D paper-trading platform for Indian markets. Practice, compete and master NSE/BSE equities &amp; F&amp;O — risk-free.
              </p>
              <div className="flex items-center gap-3">
                {[ExternalLink, Code2, Globe].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="w-8 h-8 rounded-lg bg-slate-900 border border-white/[0.06] flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </a>
                ))}
              </div>
            </div>

            {/* Product */}
            <div className="space-y-3 font-mono text-xs">
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">PRODUCT</h4>
              <ul className="space-y-2 text-slate-400">
                <li><Link href="/trade" className="hover:text-white transition-colors">Equities</Link></li>
                <li><Link href="/options" className="hover:text-white transition-colors">Options Chain</Link></li>
                <li><Link href="/options" className="hover:text-white transition-colors">Strategy Builder</Link></li>
                <li><Link href="/trade" className="hover:text-white transition-colors">API Docs</Link></li>
              </ul>
            </div>

            {/* Resources */}
            <div className="space-y-3 font-mono text-xs">
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">RESOURCES</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Market Holidays</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Trading Glossary</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Risk Calculator</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div className="space-y-3 font-mono text-xs">
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">LEGAL</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">SEBI Compliance Notice</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
          </div>

          {/* SEBI Disclaimer Banner */}
          <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 text-xs text-slate-400 leading-relaxed mb-8">
            <span className="font-bold text-rose-400 block mb-1">SEBI COMPLIANCE &amp; PAPER TRADING DISCLAIMER:</span>
            Stock Simulator is purely an educational paper-trading simulation. No real financial transactions are executed. Market data is for simulation purposes only.
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-4">
            <div>© 2026 Stock Simulator. All rights reserved.</div>
            <div>POWERED BY MOTIONSITES 3D KINETIC ENGINE</div>
          </div>
        </footer>
      </section>
    </div>
  );
}
