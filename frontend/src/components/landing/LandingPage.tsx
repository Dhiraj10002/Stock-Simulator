"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Zap,
  Activity,
  Compass,
  Sparkles,
  Shield,
  Sliders,
  CheckCircle2,
  Award,
  Star,
  ExternalLink,
  Code2,
  Globe,
  BrainCircuit,
  Quote,
  TrendingUp,
  PieChart,
} from "lucide-react";

/* -------------------------------------------------------------
   1. HARDWARE-ACCELERATED SPATIAL 3D CANVAS (COLORFUL PARTICLES)
   ------------------------------------------------------------- */
const PARTICLE_PALETTE = [
  { prefix: "rgba(6, 182, 212, ", hex: "#06b6d4" },   // Electric Cyan
  { prefix: "rgba(249, 115, 22, ", hex: "#f97316" },  // Vibrant Orange
  { prefix: "rgba(16, 185, 129, ", hex: "#10b981" },  // Emerald Green
  { prefix: "rgba(251, 191, 36, ", hex: "#fbbf24" },  // Radiant Amber
  { prefix: "rgba(168, 85, 247, ", hex: "#a855f7" },  // Cosmic Purple
  { prefix: "rgba(244, 114, 182, ", hex: "#f472b6" }, // Neon Rose / Pink
];

function SpatialCanvas({ mousePos }: { mousePos: { x: number; y: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef(mousePos);

  useEffect(() => {
    mouseRef.current = mousePos;
  }, [mousePos]);

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

    const count = 400;
    const particles = Array.from({ length: count }, () => {
      const colorObj = PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)];
      return {
        x: (Math.random() - 0.5) * 2200,
        y: (Math.random() - 0.5) * 2200,
        z: Math.random() * 1000 + 1,
        size: Math.random() * 2.2 + 0.8,
        colorPrefix: colorObj.prefix,
        colorHex: colorObj.hex,
      };
    });

    let currentOffsetX = 0;
    let currentOffsetY = 0;

    let lastStarTime = 0;
    const render = (time: number) => {
      if (document.hidden) {
        animId = requestAnimationFrame(render);
        return;
      }
      if (time - lastStarTime < 33) {
        animId = requestAnimationFrame(render);
        return;
      }
      lastStarTime = time;

      ctx.clearRect(0, 0, width, height);

      const fov = 400;
      // Damped gentle parallax - moving cursor does NOT accelerate forward speed!
      const targetOffsetX = mouseRef.current.x * 15;
      const targetOffsetY = mouseRef.current.y * 15;
      currentOffsetX += (targetOffsetX - currentOffsetX) * 0.04;
      currentOffsetY += (targetOffsetY - currentOffsetY) * 0.04;

      const cx = width / 2 + currentOffsetX;
      const cy = height / 2 + currentOffsetY;

      // Constant calm drift speed: stays completely normal whether cursor moves or is still
      const speed = 0.85;

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
          const alpha = Math.min(1, Math.max(0.1, (1 - p.z / 1000) * 1.3));
          const rad = Math.max(0.65, p.size * k * 0.8);

          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = `${p.colorPrefix}${alpha})`;
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.9 }}
    />
  );
}



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
      className={`inline-block transition-transform duration-150 cursor-default select-none ${className}`}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.classList.remove("rubberBand");
        // Trigger DOM reflow to allow immediate re-triggering of rubberBand animation
        void el.offsetWidth;
        el.classList.add("rubberBand");
      }}
      onAnimationEnd={(e) => {
        e.currentTarget.classList.remove("rubberBand");
      }}
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setRotate({
      x: (y - 0.5) * -12,
      y: (x - 0.5) * 12,
    });
    setGlare({
      x: x * 100,
      y: y * 100,
      opacity: 0.28,
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
      className={`relative rounded-3xl transition-transform duration-200 ease-out group ${className}`}
      style={{
        transform: `perspective(1100px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) translateZ(6px)`,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Specular glare layer */}
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none z-20 transition-opacity duration-300"
        style={{
          background: `radial-gradient(420px circle at ${glare.x}% ${glare.y}%, ${glowColor}, transparent 60%)`,
          opacity: glare.opacity,
        }}
      />
      {children}
    </div>
  );
}

/* -------------------------------------------------------------
   3. 3D TILTING PLATFORM SHOWCASE DECK
   ------------------------------------------------------------- */
function PlatformShowcase({ mousePos }: { mousePos: { x: number; y: number } }) {
  const deckRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ rotX: 0, ty: 0 });

  useEffect(() => {
    const handleScroll = () => {
      if (!deckRef.current) return;
      const rect = deckRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.max(0, Math.min(1, 1 - (rect.top - vh * 0.1) / (vh * 0.7)));
      // Settles perfectly flat/level when user reaches the section
      const rotX = (1 - p) * 4;
      const ty = (1 - p) * 10;
      setTransform({
        rotX,
        ty,
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      ref={deckRef}
      className="relative max-w-5xl w-full mx-auto transition-transform duration-300 ease-out"
      style={{
        transform: `perspective(1600px) translateY(${transform.ty}px) rotateX(${transform.rotX + mousePos.y * -3}deg) rotateY(${mousePos.x * 3.5}deg)`,
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

const FEATURES_DATA = [
  {
    id: "dom",
    icon: Activity,
    badge: "ORDER DEPTH",
    title: "Level 2 Market Depth (DOM)",
    description: "5-tier bid/ask ladder with visual depth bars that reveal order-queue dynamics in real time.",
    borderColor: "border-cyan-500/35 hover:border-cyan-400/80 hover:shadow-[0_0_35px_rgba(6,182,212,0.2)]",
    iconBg: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400",
    badgeStyle: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    linkText: "text-cyan-400 group-hover:text-cyan-300",
    glowColor: "rgba(6, 182, 212, 0.25)",
    beamColor: "from-cyan-400 via-teal-300 to-cyan-500",
  },
  {
    id: "options",
    icon: Sliders,
    badge: "DERIVATIVES",
    title: "Options Chain & Greek Analytics",
    description: "Live NIFTY / BANKNIFTY calls and puts with real-time Delta, Gamma, Theta and Vega on every strike.",
    borderColor: "border-orange-500/35 hover:border-orange-400/80 hover:shadow-[0_0_35px_rgba(249,115,22,0.2)]",
    iconBg: "bg-orange-500/15 border-orange-500/30 text-orange-400",
    badgeStyle: "bg-orange-500/10 text-orange-300 border-orange-500/30",
    linkText: "text-orange-400 group-hover:text-orange-300",
    glowColor: "rgba(249, 115, 22, 0.25)",
    beamColor: "from-orange-400 via-amber-300 to-orange-500",
  },
  {
    id: "websocket",
    icon: Zap,
    badge: "LOW LATENCY",
    title: "Real-Time WebSocket Engine",
    description: "Sub-50ms tick streaming mirrored from exchange broadcasts for lifelike, low-latency price action.",
    borderColor: "border-emerald-500/35 hover:border-emerald-400/80 hover:shadow-[0_0_35px_rgba(16,185,129,0.2)]",
    iconBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
    badgeStyle: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    linkText: "text-emerald-400 group-hover:text-emerald-300",
    glowColor: "rgba(16, 185, 129, 0.25)",
    beamColor: "from-emerald-400 via-teal-300 to-emerald-500",
  },
  {
    id: "risk",
    icon: Shield,
    badge: "PROTECTION",
    title: "Institutional Risk Guard",
    description: "Max daily-loss limits, automatic circuit-breaker cutoffs and margin-call alerts keep discipline enforced.",
    borderColor: "border-amber-500/35 hover:border-amber-400/80 hover:shadow-[0_0_35px_rgba(251,191,36,0.2)]",
    iconBg: "bg-amber-500/15 border-amber-500/30 text-amber-400",
    badgeStyle: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    linkText: "text-amber-400 group-hover:text-amber-300",
    glowColor: "rgba(251, 191, 36, 0.25)",
    beamColor: "from-amber-400 via-yellow-300 to-amber-500",
  },
  {
    id: "ai",
    icon: BrainCircuit,
    badge: "AI COPILOT",
    title: "AI Trading Mentor",
    description: "Instant post-trade feedback analysing your risk-reward ratio and flagging revenge-trading behaviour.",
    borderColor: "border-purple-500/35 hover:border-purple-400/80 hover:shadow-[0_0_35px_rgba(168,85,247,0.2)]",
    iconBg: "bg-purple-500/15 border-purple-500/30 text-purple-400",
    badgeStyle: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    linkText: "text-purple-400 group-hover:text-purple-300",
    glowColor: "rgba(168, 85, 247, 0.25)",
    beamColor: "from-purple-400 via-fuchsia-300 to-purple-500",
  },
  {
    id: "wallet",
    icon: Compass,
    badge: "PORTFOLIO",
    title: "Multi-Wallet Management",
    description: "Segregate strategies into distinct accounts - Scalping, Swing and F&O Hedging - with isolated P&L.",
    borderColor: "border-rose-500/35 hover:border-rose-400/80 hover:shadow-[0_0_35px_rgba(244,63,94,0.2)]",
    iconBg: "bg-rose-500/15 border-rose-500/30 text-rose-400",
    badgeStyle: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    linkText: "text-rose-400 group-hover:text-rose-300",
    glowColor: "rgba(244, 63, 94, 0.25)",
    beamColor: "from-rose-400 via-pink-300 to-rose-500",
  },
];

/* -------------------------------------------------------------
   MAIN COMPONENT: 3D SPATIAL LANDING PAGE
   ------------------------------------------------------------- */
interface LandingPageProps {
  onOpenAuth?: (mode: "login" | "register") => void;
}

export default function LandingPage({ onOpenAuth }: LandingPageProps = {}) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeSection, setActiveSection] = useState("hero");

  // Track global mouse position for 3D gyro tilt
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMousePos({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Track scroll spy to highlight current active section in navbar with light green
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 180;
      for (let i = NAV_ITEMS.length - 1; i >= 0; i--) {
        const el = document.getElementById(NAV_ITEMS[i].id);
        if (el && el.offsetTop <= scrollPosition) {
          setActiveSection(NAV_ITEMS[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="dark relative min-h-screen text-slate-100 font-sans overflow-x-hidden selection:bg-blue-600/30 selection:text-white" data-landing style={{ backgroundColor: '#04060b' }}>
      {/* 3D Global Perspective Particle Canvas (Colorful dots, constant calm speed) */}
      <SpatialCanvas mousePos={mousePos} />


      {/* Floating Aurora Plasma Spheres (Multi-color ambient glow) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full blur-[140px] opacity-30 animate-pulse"
          style={{
            background: "radial-gradient(circle, rgba(6, 182, 212, 0.35), transparent 70%)",
            transform: `translate(${mousePos.x * 35}px, ${mousePos.y * 35}px)`,
          }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[650px] h-[650px] rounded-full blur-[160px] opacity-25"
          style={{
            background: "radial-gradient(circle, rgba(249, 115, 22, 0.22), transparent 70%)",
            transform: `translate(${mousePos.x * -25}px, ${mousePos.y * -25}px)`,
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
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden">
              {/* Gradient border via pseudo background */}
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 rounded-lg" />
              <div className="absolute inset-[1.5px] bg-[#0a0e1a] rounded-[6px] flex items-center justify-center">
                <span className="font-black text-[11px] text-white tracking-wider">SS</span>
              </div>
            </div>
            <span className="hidden sm:block font-bold text-[13px] tracking-[0.15em] uppercase text-white/90 group-hover:text-white transition-colors">
              Stock Simulator
            </span>
          </Link>

          {/* ── Center Navigation ── */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setActiveSection(item.id)}
                  className={`relative px-3.5 py-[6px] rounded-lg text-[12px] font-medium tracking-wide transition-all duration-250 ${isActive
                    ? "text-white bg-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_1px_3px_rgba(0,0,0,0.2)]"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
                    }`}
                >
                  {isActive && (
                    <div className="absolute -bottom-[1px] left-3 right-3 h-[2px] rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                  )}
                  {item.label}
                </a>
              );
            })}
          </div>

          {/* ── Right Actions ── */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => (onOpenAuth ? onOpenAuth("login") : (window.location.href = "/stocks"))}
              className="px-4 py-[6px] rounded-lg text-[12px] font-medium text-white/60 hover:text-white hover:bg-white/[0.07] transition-all cursor-pointer"
            >
              Log In
            </button>
            <button
              onClick={() => (onOpenAuth ? onOpenAuth("register") : (window.location.href = "/stocks"))}
              className="relative px-5 py-[7px] rounded-lg text-[12px] font-semibold text-white overflow-hidden transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              style={{
                background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
              }}
            >
              {/* Inner glass sheen */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-60 pointer-events-none" />
              <span className="relative">Sign Up</span>
            </button>
          </div>
        </div>
      </header>

      {/* ================= TICKER MARQUEE ================= */}
      <div
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
            transform: `perspective(1200px) rotateX(${mousePos.y * -6}deg) rotateY(${mousePos.x * 6}deg)`,
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
          <button
            onClick={() => (onOpenAuth ? onOpenAuth("login") : (window.location.href = "/stocks"))}
            className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-white font-bold text-sm tracking-wide overflow-hidden transition-all hover:scale-[1.04] active:scale-[0.98] cursor-pointer shadow-[0_4px_24px_rgba(6,182,212,0.25),0_8px_32px_rgba(139,92,246,0.15)]"
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
            }}
          >
            {/* Glass sheen overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />
            <span className="relative">Open Dashboard</span>
            <ArrowRight className="relative w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>

          <Link
            href="/stocks"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-cyan-300 hover:text-white font-bold text-sm tracking-wide transition-all border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/60 hover:border-cyan-400 hover:scale-105"
          >
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span>Explore Stocks</span>
          </Link>

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
              transform: `translate3d(${mousePos.x * 18}px, ${mousePos.y * 18}px, 35px)`,
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
              transform: `translate3d(${mousePos.x * -16}px, ${mousePos.y * -16}px, 30px)`,
            }}
          >
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs">
              ✓
            </div>
            <div className="text-left">
              <div className="text-[9px] font-mono text-slate-400 uppercase">Live Order Match</div>
              <div className="text-xs font-black font-mono text-emerald-400">TCS · 50 @ 3,912 FILLED</div>
            </div>
          </div>

          {/* Holographic Slab */}
          <div
            className="rounded-3xl bg-gradient-to-b from-[#0a1122]/90 to-[#060a14]/95 backdrop-blur-3xl border border-cyan-500/35 hover:border-cyan-400/60 p-5 sm:p-7 shadow-2xl transition-all duration-300 ease-out text-left"
            style={{
              transform: `rotateX(${12 - mousePos.y * 12}deg) rotateY(${mousePos.x * 14}deg) translateZ(20px)`,
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
                <span className="text-emerald-400 font-bold">LIVE FEED</span>
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
          <PlatformShowcase mousePos={mousePos} />
        </div>
      </section>

      {/* ================= 3. SECTION 3: HOW IT WORKS (TRADING IN THREE STEPS) ================= */}
      <section id="how" className="relative z-10 pt-5 pb-16 sm:pt-7 sm:pb-20 px-6 text-center scroll-mt-24">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest text-slate-300 bg-white/[0.05] border border-white/10 backdrop-blur-md shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              <span>STEP-BY-STEP WORKFLOW // HOW IT WORKS</span>
            </div>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight leading-[1.05]">
              <AnimatedPhrase
                phrase="Trading in"
                className=""
                letterClassName="text-white"
              />{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 drop-shadow-[0_0_30px_rgba(249,115,22,0.45)]">
                three steps
              </span>
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed pt-0.5">
              From zero to live simulated execution in under a minute. Master Indian equities, F&amp;O options strategies, and risk rules risk-free.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {/* Step 01: Fund Your Virtual Wallet */}
            <TiltCard glowColor="rgba(251, 191, 36, 0.2)">
              <div className="relative h-full rounded-3xl bg-[#090e1c]/80 hover:bg-[#0d1428]/90 backdrop-blur-2xl border border-white/10 hover:border-amber-400/40 p-6 sm:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 overflow-hidden group">
                {/* Glowing Top Beam */}
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 shadow-[0_0_12px_rgba(251,191,36,0.6)]" />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25">
                      STEP 01 // CAPITAL
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300 font-black text-xs shadow-inner">
                      ₹
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-amber-200 transition-colors">
                    Fund your virtual wallet
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed mb-6">
                    Start instantly with ₹10,00,000 virtual paper margin. Zero deposit required, 1-click reset anytime.
                  </p>
                </div>

                {/* Embedded Visual Demonstration Widget: Glass Wallet Ticket */}
                <div className="rounded-2xl bg-black/40 backdrop-blur-md border border-white/[0.08] p-4 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">Available Capital</span>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                      ● INSTANT ACCESS
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-white tracking-tight">
                    ₹10,00,000<span className="text-slate-500 text-sm">.00</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] text-[10px] font-mono">
                    <div>
                      <div className="text-slate-400">CNC Equity</div>
                      <div className="text-slate-200 font-bold">1x Margin</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400">MIS Intraday</div>
                      <div className="text-amber-400 font-bold">5x Leverage</div>
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>

            {/* Step 02: Place Real-Market Orders */}
            <TiltCard glowColor="rgba(6, 182, 212, 0.2)">
              <div className="relative h-full rounded-3xl bg-[#090e1c]/80 hover:bg-[#0d1428]/90 backdrop-blur-2xl border border-white/10 hover:border-cyan-400/40 p-6 sm:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 overflow-hidden group">
                {/* Glowing Top Beam */}
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 shadow-[0_0_12px_rgba(6,182,212,0.6)]" />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-300 font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/25">
                      STEP 02 // EXECUTION
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shadow-inner">
                      <Zap className="w-4 h-4" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-200 transition-colors">
                    Place real-market orders
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed mb-6">
                    Live NSE tick data. Execute MARKET or LIMIT orders across DELIVERY, MIS and F&amp;O with instant fill logic.
                  </p>
                </div>

                {/* Embedded Visual Demonstration Widget: Live Order Ticket */}
                <div className="rounded-2xl bg-black/40 backdrop-blur-md border border-white/[0.08] p-4 space-y-2.5 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white font-mono">RELIANCE</span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded font-bold">BUY</span>
                    </div>
                    <span className="text-xs font-bold font-mono text-white">50 Qty</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400">Order: MIS Limit</span>
                    <span className="text-white font-bold">₹1,226.40</span>
                  </div>
                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-emerald-300">
                    <span className="flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Matched in 0.04s
                    </span>
                    <span className="text-slate-400">Brokerage ₹0</span>
                  </div>
                </div>
              </div>
            </TiltCard>

            {/* Step 03: Track P&L & Learn with AI */}
            <TiltCard glowColor="rgba(168, 85, 247, 0.2)">
              <div className="relative h-full rounded-3xl bg-[#090e1c]/80 hover:bg-[#0d1428]/90 backdrop-blur-2xl border border-white/10 hover:border-purple-400/40 p-6 sm:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 overflow-hidden group">
                {/* Glowing Top Beam */}
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-purple-400 via-fuchsia-300 to-violet-400 shadow-[0_0_12px_rgba(168,85,247,0.6)]" />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-purple-300 font-bold px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/25">
                      STEP 03 // ANALYTICS
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center text-purple-300 shadow-inner">
                      <BrainCircuit className="w-4 h-4" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-200 transition-colors">
                    Track P&amp;L &amp; learn
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed mb-6">
                    Real-time position feeds with automated AI Coach insights explaining entry quality, risk ratio, and discipline.
                  </p>
                </div>

                {/* Embedded Visual Demonstration Widget: P&L + AI Coach */}
                <div className="rounded-2xl bg-black/40 backdrop-blur-md border border-white/[0.08] p-4 space-y-2.5 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">Intraday MTM</span>
                    <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                      ▲ +₹14,280.50
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-500/25 flex items-start gap-2 text-[10px] font-mono text-purple-200/90 leading-relaxed">
                    <Sparkles className="w-3.5 h-3.5 text-purple-300 shrink-0 mt-0.5" />
                    <span>AI Read: &ldquo;Solid 1:2.8 risk-reward. Trailing stop ₹1,221 active.&rdquo;</span>
                  </div>
                </div>
              </div>
            </TiltCard>
          </div>

          {/* ========================================================================= */}
          {/* GAP ADJUSTMENT: Change '!mt-5' or 'marginTop: 20' to your desired spacing */}
          {/* e.g. marginTop: 12 (tighter), 20 (medium), 32 (wider)                   */}
          {/* ========================================================================= */}
          <div className="!mt-5" style={{ marginTop: "6px" }}>
            <TiltCard glowColor="rgba(249, 115, 22, 0.32)">
              <div className="relative rounded-3xl bg-[#090e1e]/90 backdrop-blur-2xl border border-white/[0.1] hover:border-orange-500/40 p-5 sm:p-7 shadow-[0_30px_90px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all duration-300 overflow-hidden text-left">
                {/* Full-width continuous RGB spectrum hairline */}
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-emerald-400 via-cyan-400 via-amber-400 to-purple-400" />

                {/* Console Top HUD Status Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-white/[0.08] text-[10px] font-mono">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="font-bold tracking-widest text-white uppercase">SYSTEM TELEMETRY // CORE ENGINE BENCHMARKS</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400">
                    <span className="text-cyan-300/90 font-bold bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-0.5 rounded-full">
                      REAL-TIME BROKER EMULATION
                    </span>
                  </div>
                </div>

                {/* 4 Unified Telemetry Columns (Divided by Laser Hairlines, NOT detached boxes) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">
                  {/* Column 1: Order Engine */}
                  <div className="p-3 sm:p-4 flex flex-col justify-between space-y-2.5 group/col hover:bg-white/[0.02] rounded-2xl transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md font-bold">
                        ● QUEUE MATCHING
                      </span>
                    </div>
                    <div>
                      <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-emerald-300 via-teal-200 to-emerald-400 drop-shadow-[0_2px_18px_rgba(52,211,153,0.35)]">
                        100%
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono mt-1">
                        Server-Authoritative
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed mt-1">
                        Zero client-side spoofing. True simulated limit &amp; market fill priority.
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Latency Bridge */}
                  <div className="p-3 sm:p-4 flex flex-col justify-between space-y-2.5 group/col hover:bg-white/[0.02] rounded-2xl transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5 rounded-md font-bold">
                        ● NSE DIRECT CO-LO
                      </span>
                    </div>
                    <div>
                      <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-sky-200 to-teal-300 drop-shadow-[0_2px_18px_rgba(6,182,212,0.35)]">
                        24ms
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono mt-1">
                        Feed Refresh Window
                      </div>
                      {/* Live animated frequency tick bars */}
                      <div className="flex items-end gap-1 h-3.5 my-1.5 px-1 bg-black/30 rounded">
                        {[6, 12, 8, 14, 10, 14, 9, 13, 7, 11].map((h, i) => (
                          <div key={i} className="flex-1 bg-cyan-400/80 rounded-t-sm" style={{ height: `${h}px` }} />
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed">
                        Sub-50ms tick streaming mirrored live from exchange broadcasts.
                      </div>
                    </div>
                  </div>

                  {/* Column 3: MIS Leverage */}
                  <div className="p-3 sm:p-4 flex flex-col justify-between space-y-2.5 group/col hover:bg-white/[0.02] rounded-2xl transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md font-bold">
                        ● SEBI COMPLIANT
                      </span>
                    </div>
                    <div>
                      <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-amber-300 via-amber-200 to-orange-400 drop-shadow-[0_2px_18px_rgba(251,191,36,0.35)]">
                        5×
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono mt-1">
                        MIS Margin Leverage
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed mt-1">
                        Realistic intraday margin limits, RMS circuit cutoffs, and square-off rules.
                      </div>
                    </div>
                  </div>

                  {/* Column 4: Virtual Seed */}
                  <div className="p-3 sm:p-4 flex flex-col justify-between space-y-2.5 group/col hover:bg-white/[0.02] rounded-2xl transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-purple-300 bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 rounded-md font-bold">
                        ● RISK-FREE ALLOCATION
                      </span>
                    </div>
                    <div>
                      <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-orange-300 via-pink-300 to-purple-400 drop-shadow-[0_2px_18px_rgba(244,114,182,0.35)]">
                        ₹10.0L
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono mt-1">
                        Virtual Seed Capital
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed mt-1">
                        Full institutional balance unlocked instantly on sign up. Zero real money needed.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* ================= 4. SECTION 4: 3D PRO FEATURES BENTO (NORMAL PROPORTIONS) ================= */}
      <section id="features" className="relative z-10 pt-5 pb-16 sm:pt-7 sm:pb-20 px-6 scroll-mt-24">
        <div className="max-w-6xl mx-auto space-y-10">
          {/* Section Header */}
          <div className="text-center space-y-2.5 relative">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest text-slate-300 bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span>ARCHITECTURAL SUITE // NSE &amp; BSE LIVE</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight leading-tight">
              <AnimatedPhrase
                phrase="Everything"
                className=""
                letterClassName="text-white"
              />{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-400 drop-shadow-[0_0_35px_rgba(52,211,153,0.45)]">
                a Pro Desk Needs
              </span>
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed font-normal">
              Direct exchange depth, algorithmic risk bounds, and sub-50ms tick streaming engineered into a single unified cockpit.
            </p>
          </div>

          {/* 3D Bento Grid (Normal Dimensions & Glassy) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {FEATURES_DATA.map((feature, idx) => (
              <TiltCard key={idx} glowColor={feature.glowColor}>
                <div className={`relative h-full rounded-3xl bg-[#090d1c]/80 hover:bg-[#0c1226]/95 backdrop-blur-2xl border ${feature.borderColor} p-6 sm:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 group overflow-hidden`}>
                  {/* Glowing Top Hairline */}
                  <div className={`absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r ${feature.beamColor}`} />

                  <div>
                    {/* Header: Icon + Badge */}
                    <div className="flex items-center justify-between mb-3.5">
                      <div className={`w-11 h-11 rounded-2xl ${feature.iconBg} flex items-center justify-center shadow-inner`}>
                        <feature.icon className="w-5 h-5" />
                      </div>
                      <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${feature.badgeStyle} font-bold`}>
                        {feature.badge}
                      </span>
                    </div>

                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2 group-hover:text-white transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed mb-4">
                      {feature.description}
                    </p>

                    {/* Simple, Clear & Glassy Micro-Widgets (Normal Size) */}
                    {feature.id === "dom" && (
                      <div className="p-3 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-cyan-500/20 space-y-2 font-mono text-[11px]">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-emerald-400 font-bold">62% Buy (1.42L)</span>
                          <span className="text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[9px]">
                            Spread ₹0.05
                          </span>
                          <span className="text-rose-400 font-bold">38% Sell (0.86L)</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.06] flex overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-l-full" style={{ width: "62%" }} />
                          <div className="h-full bg-rose-400 rounded-r-full" style={{ width: "38%" }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-300 pt-0.5">
                          <span>Bid: <strong className="text-emerald-400">₹25,380.00</strong></span>
                          <span>Ask: <strong className="text-rose-400">₹25,380.05</strong></span>
                        </div>
                      </div>
                    )}

                    {feature.id === "options" && (
                      <div className="p-3 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-orange-500/20 space-y-2 font-mono text-[11px]">
                        <div className="flex justify-between items-center text-[10px] pb-1 border-b border-white/[0.06]">
                          <span className="text-white font-bold">NIFTY 25,400 CE</span>
                          <span className="text-orange-300 font-bold bg-orange-500/15 px-2 py-0.5 rounded text-[10px]">
                            LTP ₹142.50 (+18.4%)
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                          <div className="p-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <span className="text-[9px] text-slate-400 block">DELTA</span>
                            <span className="text-cyan-300 font-bold text-xs">+0.52</span>
                          </div>
                          <div className="p-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <span className="text-[9px] text-slate-400 block">THETA</span>
                            <span className="text-rose-300 font-bold text-xs">-₹4.20</span>
                          </div>
                          <div className="p-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <span className="text-[9px] text-slate-400 block">IV</span>
                            <span className="text-orange-300 font-bold text-xs">12.6%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {feature.id === "websocket" && (
                      <div className="p-3 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-emerald-500/20 space-y-2 font-mono text-[11px]">
                        <div className="flex justify-between items-center text-[10px] pb-1 border-b border-white/[0.06]">
                          <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                            24ms NSE Direct Bridge
                          </span>
                          <span className="text-emerald-400 font-bold">14,820 ticks/sec</span>
                        </div>
                        {/* Live Frequency Wave */}
                        <div className="flex items-end justify-between gap-1 h-5 px-1 bg-white/[0.02] rounded-lg">
                          {[12, 18, 10, 20, 14, 18, 11, 16, 19, 13].map((h, i) => (
                            <div
                              key={i}
                              className="flex-1 bg-gradient-to-t from-emerald-500/30 to-emerald-400 rounded-t-sm"
                              style={{ height: `${h}px` }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {feature.id === "risk" && (
                      <div className="p-3 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-amber-500/20 space-y-2 font-mono text-[11px]">
                        <div className="flex justify-between items-center text-[10px] pb-1 border-b border-white/[0.06]">
                          <span className="text-slate-300 font-bold">Daily Drawdown Ceiling</span>
                          <span className="text-amber-300 bg-amber-500/15 border border-amber-400/30 px-1.5 py-0.5 rounded text-[9px] font-bold">
                            0 BREACHES
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>Drawdown: <strong className="text-amber-300">₹6,000</strong> / ₹25,000</span>
                            <span className="text-emerald-400 font-bold">24% (Safe Margin)</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-orange-500" style={{ width: "24%" }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {feature.id === "ai" && (
                      <div className="p-3 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-purple-500/20 space-y-1.5 font-mono text-[11px]">
                        <div className="flex items-center gap-1.5 text-purple-300 font-bold text-[10px] pb-1 border-b border-white/[0.06]">
                          <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
                          <span>Neural Trade Inspection</span>
                          <span className="ml-auto text-[9px] text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded font-bold">
                            Score 96/100 (A+)
                          </span>
                        </div>
                        <p className="text-purple-200/90 text-[10px] leading-relaxed italic">
                          &ldquo;Clean VWAP retest on BANKNIFTY • Strict 1:2.8 risk-reward adherence.&rdquo;
                        </p>
                      </div>
                    )}

                    {feature.id === "wallet" && (
                      <div className="p-3 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-rose-500/20 space-y-2 font-mono text-[11px]">
                        <div className="flex justify-between items-center text-[10px] pb-1 border-b border-white/[0.06]">
                          <span className="text-slate-300 font-bold">Segregated Strategy Wallets</span>
                          <span className="text-rose-300 text-[9px] bg-rose-500/15 px-1.5 py-0.5 rounded font-bold">
                            ₹10.0L Total
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                          <div className="p-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <span className="text-[8px] text-slate-400 block">SCALP</span>
                            <span className="text-white font-bold">₹4.5L</span>
                          </div>
                          <div className="p-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <span className="text-[8px] text-slate-400 block">HEDGE</span>
                            <span className="text-white font-bold">₹3.5L</span>
                          </div>
                          <div className="p-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <span className="text-[8px] text-slate-400 block">SWING</span>
                            <span className="text-white font-bold">₹2.0L</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>



      {/* ================= 6. SECTION 6: VERIFIED SOCIAL PROOF (4-REVIEWER 2x2 GRID) ================= */}
      <section id="testimonials" className="relative z-10 flex flex-col items-center pt-5 pb-14 sm:pt-7 sm:pb-16 px-6 scroll-mt-24">
        <div className="max-w-7xl mx-auto w-full space-y-5 sm:space-y-6">
          {/* Header */}
          <div className="text-center space-y-2 relative">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 backdrop-blur-md shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              <span>VERIFIED SOCIAL PROOF // INDIAN MARKET TRADERS</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight leading-tight">
              <AnimatedPhrase
                phrase="Trusted by"
                className=""
                letterClassName="text-white"
              />{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 drop-shadow-[0_0_35px_rgba(251,191,36,0.45)]">
                Students, Scalpers &amp; Educators
              </span>
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed font-normal">
              Read how real Indian market participants test F&amp;O and intraday equity setups risk-free before placing real capital on the line.
            </p>
          </div>

          {/* 4 Reviewers in 2x2 Responsive Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 lg:gap-7">
            {/* Reviewer 1: Sanjay Menon (Educator) */}
            <TiltCard glowColor="rgba(16, 185, 129, 0.25)">
              <div className="relative h-full rounded-2xl sm:rounded-3xl bg-[#09151c]/85 hover:bg-[#0c1a24]/95 backdrop-blur-2xl border border-emerald-500/25 hover:border-emerald-500/60 p-5 sm:p-6 lg:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 group overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500" />

                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-bold">
                      500+ STUDENTS MENTORED
                    </span>
                  </div>

                  <p className="text-slate-200 text-xs sm:text-[14px] lg:text-[14.5px] leading-relaxed italic mb-4">
                    &ldquo;I train 500+ students with zero financial risk. The AI Mentor trade audits and real-time execution analytics turn paper practice into a genuinely professional classroom.&rdquo;
                  </p>

                  <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-xs sm:text-[12.5px] font-mono text-slate-300 mb-4">
                    <span className="text-emerald-300 font-bold">Institutional Partner</span>
                    <span className="text-teal-300 font-bold">Indian Market Academy</span>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-white/[0.06] flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 flex items-center justify-center font-black text-slate-950 text-sm shrink-0 border border-white/20 shadow-md">
                    SM
                  </div>
                  <div className="min-w-0 flex-1 flex items-center justify-between">
                    <div>
                      <div className="text-sm sm:text-base font-bold text-white truncate">Sanjay Menon</div>
                      <div className="text-[10px] sm:text-[11px] font-mono text-slate-400">Finance &amp; Market Educator</div>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                      ✓ AUDITED
                    </span>
                  </div>
                </div>
              </div>
            </TiltCard>

            {/* Reviewer 2: Rohit Verma (Scalper) */}
            <TiltCard glowColor="rgba(249, 115, 22, 0.25)">
              <div className="relative h-full rounded-2xl sm:rounded-3xl bg-[#140f1a]/85 hover:bg-[#1a1322]/95 backdrop-blur-2xl border border-orange-500/25 hover:border-orange-500/60 p-5 sm:p-6 lg:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 group overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500" />

                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono px-3 py-1 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-300 font-bold">
                      1-MIN INTRADAY SCALPER
                    </span>
                  </div>

                  <p className="text-slate-200 text-xs sm:text-[14px] lg:text-[14.5px] leading-relaxed italic mb-4">
                    &ldquo;Execution speed and Level 2 depth feel identical to my real broker. I run my morning warm-up scalps here every single day without slippage surprises.&rdquo;
                  </p>

                  <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-xs sm:text-[12.5px] font-mono text-slate-300 mb-4">
                    <span className="text-orange-300 font-bold">BankNifty Breakouts</span>
                    <span className="text-emerald-400 font-bold">Avg Latency 24ms</span>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-white/[0.06] flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center font-black text-slate-950 text-sm shrink-0 border border-white/20 shadow-md">
                    RV
                  </div>
                  <div className="min-w-0 flex-1 flex items-center justify-between">
                    <div>
                      <div className="text-sm sm:text-base font-bold text-white truncate">Rohit Verma</div>
                      <div className="text-[10px] sm:text-[11px] font-mono text-slate-400">Full-Time Intraday Scalper</div>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                      ✓ VERIFIED
                    </span>
                  </div>
                </div>
              </div>
            </TiltCard>

            {/* Reviewer 3: Neha Kulkarni (Options Tester) */}
            <TiltCard glowColor="rgba(6, 182, 212, 0.25)">
              <div className="relative h-full rounded-2xl sm:rounded-3xl bg-[#09111c]/85 hover:bg-[#0d1728]/95 backdrop-blur-2xl border border-cyan-500/25 hover:border-cyan-500/60 p-5 sm:p-6 lg:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 group overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-500" />

                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 font-bold">
                      F&amp;O STRATEGY LAB
                    </span>
                  </div>

                  <p className="text-slate-200 text-xs sm:text-[14px] lg:text-[14.5px] leading-relaxed italic mb-4">
                    &ldquo;Tested my Iron Condor strategy for 3 months here before risking real capital. The Greeks and margin behaviour matched my broker almost exactly.&rdquo;
                  </p>

                  <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-xs sm:text-[12.5px] font-mono text-slate-300 mb-4">
                    <span className="text-cyan-300 font-bold">NIFTY 50 Options</span>
                    <span className="text-emerald-400 font-bold">Win Rate 74%</span>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-white/[0.06] flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-teal-400 flex items-center justify-center font-black text-slate-950 text-sm shrink-0 border border-white/20 shadow-md">
                    NK
                  </div>
                  <div className="min-w-0 flex-1 flex items-center justify-between">
                    <div>
                      <div className="text-sm sm:text-base font-bold text-white truncate">Neha Kulkarni</div>
                      <div className="text-[10px] sm:text-[11px] font-mono text-slate-400">College Finance Student</div>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                      ✓ VERIFIED
                    </span>
                  </div>
                </div>
              </div>
            </TiltCard>

            {/* Reviewer 4: Arjun Mehta (Algo & Swing Trader) */}
            <TiltCard glowColor="rgba(168, 85, 247, 0.25)">
              <div className="relative h-full rounded-2xl sm:rounded-3xl bg-[#110d1f]/85 hover:bg-[#17112b]/95 backdrop-blur-2xl border border-purple-500/25 hover:border-purple-500/60 p-5 sm:p-6 lg:p-7 flex flex-col justify-between shadow-2xl transition-all duration-300 group overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-purple-400 via-pink-300 to-purple-500" />

                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 font-bold">
                      ALGO &amp; SWING TRADER
                    </span>
                  </div>

                  <p className="text-slate-200 text-xs sm:text-[14px] lg:text-[14.5px] leading-relaxed italic mb-4">
                    &ldquo;Automated rule-based trailing stops and multi-timeframe candle sync make testing swing setups effortless. The journaling analytics saved me weeks of manual tracking.&rdquo;
                  </p>

                  <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-xs sm:text-[12.5px] font-mono text-slate-300 mb-4">
                    <span className="text-purple-300 font-bold">Midcap Momentum</span>
                    <span className="text-emerald-400 font-bold">Win Rate 68%</span>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-white/[0.06] flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center font-black text-slate-950 text-sm shrink-0 border border-white/20 shadow-md">
                    AM
                  </div>
                  <div className="min-w-0 flex-1 flex items-center justify-between">
                    <div>
                      <div className="text-sm sm:text-base font-bold text-white truncate">Arjun Mehta</div>
                      <div className="text-[10px] sm:text-[11px] font-mono text-slate-400">Systematic Algo Trader</div>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                      ✓ VERIFIED
                    </span>
                  </div>
                </div>
              </div>
            </TiltCard>
          </div>

          {/* Bottom Horizon Trust Strip */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm font-mono text-slate-400">
            <div className="flex items-center gap-2 text-slate-300">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="font-bold text-white">4.9 / 5.0</span>
              <span className="text-slate-400 text-xs">(12,400+ Indian Paper Traders)</span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Real-Time NSE Order Matching
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Zero Simulated Slippage
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-purple-400" /> SEBI-Aligned Contract Specs
              </span>
            </div>
          </div>
        </div>
      </section>

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
                      <span className="text-slate-400">LATENCY: <span className="text-cyan-400 font-bold">24ms</span></span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> READY
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
                  <Link
                    href="/stocks"
                    className="group inline-flex items-center justify-center gap-3 px-9 py-4 rounded-full bg-[linear-gradient(135deg,#ff7a29_0%,#f43f5e_50%,#7c3aed_100%)] hover:bg-[linear-gradient(135deg,#ff8f4a_0%,#fb7185_50%,#8b5cf6_100%)] text-white font-bold text-sm sm:text-base tracking-wide shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_10px_35px_-4px_rgba(255,122,41,0.5),0_8px_25px_-4px_rgba(124,58,237,0.4)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_16px_45px_-4px_rgba(255,122,41,0.65),0_12px_32px_-4px_rgba(124,58,237,0.55)] border border-white/25 hover:scale-105 transition-all duration-200 w-full sm:w-auto"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1.5" />
                  </Link>

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
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Real NSE/BSE Tick Stream
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
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 via-teal-400 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-xs shadow-md shadow-cyan-500/20 border border-white/20">
                  SS
                </div>
                <div>
                  <span className="font-black text-base tracking-tight text-white block">STOCK SIMULATOR</span>
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    INDIAN FINANCIAL MARKET ENGINE
                  </span>
                </div>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-400 leading-relaxed max-w-md font-normal">
                India&apos;s premier institutional-fidelity paper trading platform. Master NSE/BSE cash equities, BankNifty options chains, and futures risk-free with ₹10,00,000 in virtual seed capital.
              </p>

              {/* Developer & Social Badges */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <Link
                  href="/stocks"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-cyan-500/40 text-slate-400 hover:text-cyan-300 text-xs font-mono transition-all duration-200"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Explore Stocks</span>
                </Link>
                <Link
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
                    <Link href="/stocks" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5 font-bold text-slate-200">
                      <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Stock Explorer</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/stocks" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      <span>Equities Overview</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/options" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      <span>Options Chain (L2)</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">LIVE</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/options" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      <span>Iron Condor Lab</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/mentor" className="hover:text-cyan-300 transition-colors flex items-center gap-1.5">
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
                  <li><Link href="/options" className="hover:text-orange-300 transition-colors">Risk Calculator</Link></li>
                </ul>
              </div>

              {/* Legal & Compliance */}
              <div className="space-y-3 font-mono">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  COMPLIANCE
                </h4>
                <ul className="space-y-2 text-xs text-slate-400">
                  <li><a href="#" className="hover:text-purple-300 transition-colors">SEBI Mandate Notice</a></li>
                  <li><a href="#" className="hover:text-purple-300 transition-colors">Terms of Service</a></li>
                  <li><a href="#" className="hover:text-purple-300 transition-colors">Privacy Policy</a></li>
                  <li><a href="#" className="hover:text-purple-300 transition-colors">Risk Disclosure</a></li>
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
                    REGULATORY NOTICE &amp; SEBI PAPER TRADING COMPLIANCE
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
                BSE EQUITIES
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
    </div>
  );
}
