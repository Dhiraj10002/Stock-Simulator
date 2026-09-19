"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Zap,
  TrendingUp,
  Activity,
  Layers,
  BrainCircuit,
  Star,
  ChevronRight,
  ExternalLink,
  Code2,
  Globe,
  Menu,
  X,
  ShieldCheck,
  Briefcase,
  Sliders,
  CheckCircle2,
  Award,
} from "lucide-react";
import MeshFlowBackground from "@/components/landing/MeshFlowBackground";

/* Live Ticker Data */
const TICKER_DATA = [
  { symbol: "NIFTY 50", price: "25,378.40", change: "+0.49%", up: true },
  { symbol: "SENSEX", price: "82,890.94", change: "+0.48%", up: true },
  { symbol: "BANKNIFTY", price: "51,942.30", change: "+0.61%", up: true },
  { symbol: "RELIANCE", price: "₹1,226.40", change: "+0.00%", up: true },
  { symbol: "TCS", price: "₹2,105.00", change: "+0.03%", up: true },
  { symbol: "HDFCBANK", price: "₹1,642.10", change: "-0.35%", up: false },
  { symbol: "TATA MOTORS", price: "₹964.80", change: "-0.85%", up: false },
  { symbol: "INFY", price: "₹1,504.20", change: "+0.42%", up: true },
];

/* 6 Pro Terminal Features */
const PRO_FEATURES = [
  {
    icon: Activity,
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10 border-cyan-500/20",
    title: "Level 2 DOM Depth",
    description:
      "Full order book visibility showcasing true market buy/sell depth across 5 bid/ask tiers.",
  },
  {
    icon: Sliders,
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10 border-cyan-500/20",
    title: "Options Chain & Greeks",
    description:
      "Analyze Delta, Gamma, Theta, and Vega on live NIFTY and BankNIFTY contracts instantaneously.",
  },
  {
    icon: Zap,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    title: "Real-Time WebSockets",
    description:
      "No polling or lag. Feeds stream live directly from active market exchanges with sub-50ms tick updates.",
  },
  {
    icon: ShieldCheck,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    title: "Institutional Risk Guard",
    description:
      "Configure max drawdown thresholds, automatic circuit breaker cutoffs, and margin call safety alerts.",
  },
  {
    icon: BrainCircuit,
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10 border-cyan-500/20",
    title: "AI Trading Mentor",
    description:
      "Instant feedback on your trades, pattern errors, risk-reward skew, and revenge trading behavior.",
  },
  {
    icon: Briefcase,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    title: "Multi-Wallet Accounts",
    description:
      "Manage multiple paper portfolios to test intraday scalping, swing trading, and F&O hedging concurrently.",
  },
];

/* Top Simulated Traders Leaderboard */
const LEADERBOARD = [
  {
    rank: "#1",
    name: "Arjun Mehta",
    handle: "@arjun_trades",
    returnRate: "+84.2%",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  {
    rank: "#2",
    name: "Priya Sharma",
    handle: "@priya_fno",
    returnRate: "+62.8%",
    color: "text-slate-300 bg-slate-500/10 border-slate-500/20",
  },
  {
    rank: "#3",
    name: "Karthik Iyer",
    handle: "@karthik_quants",
    returnRate: "+52.1%",
    color: "text-amber-600 bg-amber-700/10 border-amber-700/20",
  },
];

/* Testimonials */
const TESTIMONIALS = [
  {
    quote:
      "The options Greeks simulation is so precise. My transition to live NSE trading felt totally seamless.",
    author: "Siddharth R.",
    handle: "@sidd_trader",
    verified: true,
  },
  {
    quote:
      "Perfect matching engine. I tested my proprietary algorithmic scripts using WebSockets without losing single real rupee.",
    author: "Aditi G.",
    handle: "@aditi_quants",
    verified: true,
  },
  {
    quote:
      "Having Restorable ₹10 Lakhs demo fund allows me to try absurd high-leverage trades guilt-free.",
    author: "Rahul S.",
    handle: "@rahul_scalper",
    verified: true,
  },
];

/* Level 2 Market Depth Sample Data */
const ORDER_DEPTH_ROWS = [
  { price: "25,414.50", qty: "350", width: "70%" },
  { price: "25,413.80", qty: "120", width: "30%" },
  { price: "25,413.00", qty: "240", width: "55%" },
  { price: "25,412.10", qty: "480", width: "90%" },
  { price: "25,411.50", qty: "190", width: "45%" },
  { price: "25,410.00", qty: "510", width: "95%" },
];

/* Navigation Links */
const NAV_LINKS = [
  { label: "Home", href: "#hero" },
  { label: "About", href: "#about" },
  { label: "Features", href: "#features" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "Terminal", href: "/trade" },
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navOpacity = Math.min(scrollY / 100, 1);

  return (
    <div className="min-h-screen bg-[#060910] text-slate-100 font-sans overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. STICKY GLASSMORPHIC NAVBAR */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: `rgba(6, 9, 16, ${0.65 + navOpacity * 0.3})`,
          backdropFilter: `blur(${12 + navOpacity * 8}px)`,
          borderBottom: `1px solid rgba(255, 255, 255, ${0.05 + navOpacity * 0.05})`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center font-black text-slate-950 text-xs shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              SS
            </div>
            <div className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1">
              <span>Stock</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                Simulator
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[13px] font-medium text-slate-400 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/trade"
              className="text-[13px] font-medium text-slate-300 hover:text-white px-4 py-2 rounded-lg hover:bg-slate-800/40 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/trade"
              className="text-[13px] font-bold text-slate-950 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 shadow-md shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all hover:scale-[1.02]"
            >
              Start Trading Free →
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/50 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#060910]/95 backdrop-blur-2xl p-4 space-y-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm font-medium text-slate-300 hover:text-white py-2 px-3 rounded-lg hover:bg-slate-800/50"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <Link
                href="/trade"
                className="block text-center text-sm font-bold text-slate-950 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400"
              >
                Start Trading Free →
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* 2. LIVE TICKER TAPE */}
      <div className="fixed top-16 left-0 right-0 z-40 bg-[#080c14]/90 backdrop-blur-md border-b border-white/[0.06] overflow-hidden">
        <div className="flex animate-ticker-scroll py-2">
          {[...TICKER_DATA, ...TICKER_DATA].map((item, i) => (
            <div
              key={`${item.symbol}-${i}`}
              className="flex items-center gap-2 px-6 whitespace-nowrap text-[11px] shrink-0"
            >
              <span className="font-semibold text-slate-300">{item.symbol}</span>
              <span className="font-mono text-slate-400">{item.price}</span>
              <span
                className={`font-bold font-mono ${
                  item.up ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {item.up ? "↑" : "↓"} {item.change}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. SECTION 1: ASYMMETRIC HERO */}
      <section
        id="hero"
        className="relative min-h-screen flex items-center justify-center pt-32 pb-20 px-4 sm:px-6 lg:px-8"
      >
        {/* Mesh Flow Gravitational Canvas Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-auto">
          <MeshFlowBackground />
        </div>

        {/* Ambient Cyan / Emerald Glows */}
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/[0.07] rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-[450px] h-[450px] bg-emerald-500/[0.05] rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column (Copy + Dual CTAs + Social Proof) */}
          <div
            className={`lg:col-span-6 space-y-6 transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-semibold backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>REAL-TIME F&O SIMULATOR • LIVE NSE FEED</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] text-white">
              Master the Market.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
                Zero Financial Risk.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-lg">
              Trade NSE & BSE derivatives with <span className="text-white font-semibold">₹10,00,000</span> virtual capital.
              Experience identical matching execution speeds, live Level 2 order books, and real-time options Greeks.
            </p>

            {/* Dual CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/trade"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/35 transition-all hover:scale-105"
              >
                <span>Start Trading Free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-700/80 bg-slate-900/40 hover:bg-slate-800/60 text-slate-300 hover:text-white font-medium text-sm transition-all"
              >
                Explore Instruments
              </a>
            </div>

            {/* Social Proof Avatar Stack */}
            <div className="flex items-center gap-3 pt-3">
              <div className="flex -space-x-2 overflow-hidden">
                <span className="inline-block h-8 w-8 rounded-full ring-2 ring-[#060910] bg-cyan-600 text-[11px] font-bold text-white flex items-center justify-center">
                  AM
                </span>
                <span className="inline-block h-8 w-8 rounded-full ring-2 ring-[#060910] bg-emerald-600 text-[11px] font-bold text-white flex items-center justify-center">
                  PS
                </span>
                <span className="inline-block h-8 w-8 rounded-full ring-2 ring-[#060910] bg-purple-600 text-[11px] font-bold text-white flex items-center justify-center">
                  RK
                </span>
                <span className="inline-block h-8 w-8 rounded-full ring-2 ring-[#060910] bg-amber-600 text-[11px] font-bold text-white flex items-center justify-center">
                  VG
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Over <span className="font-bold text-slate-200">45,000+</span> active paper traders in India
              </p>
            </div>
          </div>

          {/* Right Column: Floating Terminal Mockup Card */}
          <div
            className={`lg:col-span-6 transition-all duration-1000 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <div className="relative">
              {/* Floating P&L Pill Badge */}
              <div className="absolute -top-4 -right-2 z-20 px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold shadow-xl flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>+₹14,280.00 Today&apos;s P&L</span>
              </div>

              {/* Main Terminal Card */}
              <div
                className="rounded-2xl bg-[#090e1a]/85 backdrop-blur-2xl border border-cyan-500/20 shadow-2xl p-5 sm:p-6"
                style={{
                  boxShadow: "0 0 60px rgba(6, 182, 212, 0.12), 0 25px 60px rgba(0,0,0,0.6)",
                }}
              >
                {/* Terminal Header */}
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    <span className="ml-2 text-xs font-mono font-semibold text-slate-300">
                      NIFTY SEP FUT • LIVE SIMULATION
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-white">25,412.00</div>
                    <div className="text-[10px] font-mono text-emerald-400 font-semibold">+16.30 (+0.06%)</div>
                  </div>
                </div>

                {/* Candlestick Mock Chart */}
                <div className="h-40 rounded-xl bg-slate-950/60 border border-white/[0.04] p-3 flex items-end justify-between gap-2 overflow-hidden">
                  {[
                    { open: 30, close: 65, high: 80, low: 20, up: true },
                    { open: 65, close: 45, high: 75, low: 35, up: false },
                    { open: 45, close: 70, high: 85, low: 40, up: true },
                    { open: 70, close: 60, high: 75, low: 50, up: false },
                    { open: 60, close: 88, high: 95, low: 55, up: true },
                    { open: 88, close: 80, high: 92, low: 70, up: false },
                    { open: 80, close: 95, high: 100, low: 75, up: true },
                  ].map((candle, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full relative">
                      {/* High-Low Wick */}
                      <div
                        className={`w-[1px] absolute ${candle.up ? "bg-emerald-400/60" : "bg-rose-400/60"}`}
                        style={{
                          height: `${candle.high - candle.low}%`,
                          bottom: `${candle.low}%`,
                        }}
                      />
                      {/* Body */}
                      <div
                        className={`w-full max-w-[18px] rounded-[2px] z-10 ${
                          candle.up ? "bg-emerald-400 shadow-sm shadow-emerald-500/50" : "bg-rose-500 shadow-sm shadow-rose-500/50"
                        }`}
                        style={{
                          height: `${Math.max(12, Math.abs(candle.close - candle.open))}%`,
                          bottom: `${Math.min(candle.open, candle.close)}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Virtual Balance & Action Controls */}
                <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-white/[0.06]">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                      Virtual Balance
                    </span>
                    <span className="text-lg font-black font-mono text-white">
                      ₹10,00,000.00
                    </span>
                    <span className="text-[10px] text-emerald-400 block font-medium">
                      ✓ Demo Funds Restored
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href="/trade"
                      className="px-3.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                    >
                      BUY (Long)
                    </Link>
                    <Link
                      href="/trade"
                      className="px-3.5 py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold hover:bg-rose-500/30 transition-colors"
                    >
                      QUICK SELL
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SECTION 2: "ENGINEERED TO MATCH REALITY" (ABOUT / ENGINE) */}
      <section
        id="about"
        className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.04]"
        style={{
          background: "linear-gradient(180deg, #060910 0%, #080c16 50%, #060910 100%)",
        }}
      >
        <div className="max-w-7xl mx-auto space-y-12">
          {/* Section Header */}
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold tracking-wider uppercase">
              Institutional Engine
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Engineered to match reality
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Most simulators lag behind the real markets. Stock Simulator processes full-scale
              Level 2 data on our dedicated match engine for identical filled prices.
            </p>
          </div>

          {/* Asymmetric 2-Column: Left Level 2 Depth Card, Right 2x2 Stats Bento */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Card: Realistic Matching Engine Depth Queue */}
            <div className="lg:col-span-5 rounded-2xl bg-[#0a0f1d]/70 backdrop-blur-xl border border-white/[0.08] p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white mb-1">
                  Realistic Matching Engine
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-5">
                  Our order matching algorithm simulates slippage and liquidity depth exactly, ensuring that large orders suffer realistic market impact.
                </p>

                {/* Level 2 Order Depth Table */}
                <div className="rounded-xl bg-slate-950/70 border border-white/[0.05] p-3 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-500 text-[10px] pb-2 border-b border-white/[0.05] font-semibold">
                    <span>ASK PRICE</span>
                    <span>QTY (LOTS)</span>
                  </div>
                  <div className="space-y-1.5 pt-2">
                    {ORDER_DEPTH_ROWS.map((row, idx) => (
                      <div key={idx} className="relative flex items-center justify-between py-0.5">
                        <div
                          className="absolute right-0 top-0 bottom-0 bg-rose-500/[0.12] rounded"
                          style={{ width: row.width }}
                        />
                        <span className="relative z-10 text-rose-400 font-semibold">{row.price}</span>
                        <span className="relative z-10 text-slate-300">{row.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-white/[0.05] flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Sub-millisecond simulated fill latency</span>
              </div>
            </div>

            {/* Right 2x2 Stats Bento */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#0a0f1d]/70 backdrop-blur-xl border border-white/[0.08] p-6 hover:border-cyan-500/30 transition-all group">
                <div className="text-3xl font-black font-mono text-cyan-400 mb-1 group-hover:scale-105 transition-transform">
                  ₹10L
                </div>
                <div className="text-sm font-bold text-white mb-1">Demo Capital</div>
                <p className="text-xs text-slate-400">
                  Restorable any time with a single click. Practice high-stakes F&O risk-free.
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1d]/70 backdrop-blur-xl border border-white/[0.08] p-6 hover:border-emerald-500/30 transition-all group">
                <div className="text-3xl font-black font-mono text-emerald-400 mb-1 group-hover:scale-105 transition-transform">
                  100%
                </div>
                <div className="text-sm font-bold text-white mb-1">Always Free</div>
                <p className="text-xs text-slate-400">
                  No credit card, zero commissions, and no hidden subscriptions forever.
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1d]/70 backdrop-blur-xl border border-white/[0.08] p-6 hover:border-cyan-500/30 transition-all group">
                <div className="text-3xl font-black font-mono text-cyan-400 mb-1 group-hover:scale-105 transition-transform">
                  &lt;10ms
                </div>
                <div className="text-sm font-bold text-white mb-1">Execution Latency</div>
                <p className="text-xs text-slate-400">
                  Instant simulated order routing engineered with high-throughput Go microservices.
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1d]/70 backdrop-blur-xl border border-white/[0.08] p-6 hover:border-emerald-500/30 transition-all group">
                <div className="text-3xl font-black font-mono text-emerald-400 mb-1 group-hover:scale-105 transition-transform">
                  1,200+
                </div>
                <div className="text-sm font-bold text-white mb-1">Active Instruments</div>
                <p className="text-xs text-slate-400">
                  Trade NSE equities, NIFTY & BANKNIFTY weekly options, and stock futures.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SECTION 3: "PRO TERMINAL CAPABILITIES" (6-CARD BENTO GRID) */}
      <section id="features" className="relative py-28 px-4 sm:px-6 lg:px-8">
        {/* Luminous Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-cyan-500/[0.04] rounded-full blur-[140px] pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto space-y-12">
          {/* Section Header */}
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold tracking-wider uppercase">
              Complete Suite
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Pro terminal capabilities
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Trade with identical analytical weaponry deployed by institutional derivative desks.
            </p>
          </div>

          {/* 3x2 Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {PRO_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl bg-[#090e1b]/70 backdrop-blur-xl border border-white/[0.07] hover:border-cyan-500/30 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/[0.05] group flex flex-col justify-between"
              >
                <div>
                  <div
                    className={`w-10 h-10 rounded-xl ${feature.iconBg} border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                  >
                    <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <div className="pt-4 mt-4 border-t border-white/[0.04] flex items-center gap-1 text-[11px] font-semibold text-cyan-400 group-hover:translate-x-1 transition-transform">
                  <span>Explore module</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. SECTION 4: HEAR FROM TOP SIMULATED TRADERS (LEADERBOARD + REVIEWS) */}
      <section
        id="testimonials"
        className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.04]"
        style={{
          background: "linear-gradient(180deg, #060910 0%, #080c16 50%, #060910 100%)",
        }}
      >
        <div className="max-w-7xl mx-auto space-y-12">
          {/* Section Header */}
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold tracking-wider uppercase">
              Leaderboard
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Hear from top simulated traders
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Learn from the best. Watch active simulated traders compete with zero capital exposure.
            </p>
          </div>

          {/* Grid: Left Top Return Leaderboard + Right 3 Testimonial Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Top Leaderboard Card */}
            <div className="lg:col-span-4 rounded-2xl bg-[#090e1b]/80 backdrop-blur-xl border border-white/[0.08] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">
                      Top Simulated Return (YTD)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Live Rank</span>
                </div>

                <div className="space-y-3">
                  {LEADERBOARD.map((trader) => (
                    <div
                      key={trader.rank}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-white/[0.04]"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-md text-xs font-bold font-mono flex items-center justify-center border ${trader.color}`}
                        >
                          {trader.rank}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-white">{trader.name}</div>
                          <div className="text-[10px] text-slate-500">{trader.handle}</div>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/20">
                        {trader.returnRate}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-white/[0.05] text-center">
                <Link
                  href="/trade"
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Join the Weekly Simulator Contest →
                </Link>
              </div>
            </div>

            {/* 3 Review Cards */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              {TESTIMONIALS.map((t, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl bg-[#090e1b]/70 backdrop-blur-xl border border-white/[0.07] p-5 flex flex-col justify-between hover:border-white/15 transition-all"
                >
                  <div>
                    {/* 5 Stars */}
                    <div className="flex items-center gap-1 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    {/* Quote */}
                    <p className="text-xs text-slate-300 leading-relaxed italic mb-4">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                  </div>

                  <div className="pt-3 border-t border-white/[0.05]">
                    <div className="text-xs font-bold text-white">{t.author}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-slate-400">{t.handle}</span>
                      {t.verified && (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1 rounded">
                          VERIFIED
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. SECTION 5: HIGH-CONVERSION CTA CALLOUT BANNER */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-3xl bg-gradient-to-b from-[#0a1224] to-[#080d18] border border-cyan-500/30 p-8 sm:p-12 text-center space-y-6 relative overflow-hidden"
            style={{
              boxShadow: "0 0 80px rgba(6, 182, 212, 0.15)",
            }}
          >
            {/* Background Spotlights */}
            <div className="absolute top-0 right-1/4 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight relative z-10">
              Ready to test your edge without risking capital?
            </h2>
            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed relative z-10">
              Instant setups. Instant balance restoration. Learn to execute with absolute confidence on NSE/BSE before placing live money on the line.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2 relative z-10">
              <Link
                href="/trade"
                className="px-7 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/25 hover:scale-105 transition-all"
              >
                Create Free Account
              </Link>
              <a
                href="#footer"
                className="px-6 py-3 rounded-xl border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white font-medium text-sm transition-all"
              >
                Read SEBI Rules
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 8. INSTITUTIONAL FOOTER WITH REGULATORY SEBI DISCLAIMER */}
      <footer id="footer" className="border-t border-white/[0.06] bg-[#050810] pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {/* Brand Column */}
            <div className="col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center font-black text-slate-950 text-xs">
                  SS
                </div>
                <span className="font-extrabold text-sm text-white">StockSimulator</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                Premium paper trading ecosystem engineered specifically for modern Indian index &amp; stock derivatives.
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

            {/* Product Column */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">PRODUCT</h4>
              <ul className="space-y-2 text-xs text-slate-400">
                <li><Link href="/trade" className="hover:text-white transition-colors">Derivative Sim</Link></li>
                <li><Link href="/options" className="hover:text-white transition-colors">Options Chain</Link></li>
                <li><Link href="/trade" className="hover:text-white transition-colors">Level 2 Book</Link></li>
                <li><Link href="/trade" className="hover:text-white transition-colors">Indices</Link></li>
              </ul>
            </div>

            {/* Company Column */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">COMPANY</h4>
              <ul className="space-y-2 text-xs text-slate-400">
                <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#about" className="hover:text-white transition-colors">Matching Engine</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>

            {/* Support Column */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">SUPPORT</h4>
              <ul className="space-y-2 text-xs text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Access</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Support</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
              </ul>
            </div>
          </div>

          {/* SEBI Compliance & Regulatory Disclaimer Banner */}
          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/20 space-y-2">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-bold tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>SEBI Compliance &amp; Paper Trading Disclaimer</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Stock Simulator is purely a virtual paper trading platform. We do not accept real capital deposits, nor do we host real-currency financial accounts. All calculations, trades, Option Chains, and virtual portfolio P&amp;Ls are strictly for simulated training and educational purposes. Historical simulated performance does not guarantee future live trading yields. Futures and Options trading contains extreme volatility and risk of capital loss. Please trade responsibly with real funds.
            </p>
          </div>

          {/* Bottom Copyright & Legal Links */}
          <div className="pt-4 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div>© 2026 Stock Simulator Inc. All rights reserved.</div>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-slate-400 transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
