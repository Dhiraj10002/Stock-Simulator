"use client";

import React, { useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import MeshFlowBackground from "@/components/landing/MeshFlowBackground";

/* Live Ticker Items */
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

interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
  vol: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function genCandles(n: number, start: number, vol: number): Candle[] {
  let price = start;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open + rnd(-vol, vol) * (Math.random() > 0.46 ? 1 : -1);
    const high = Math.max(open, close) + rnd(0, vol * 0.7);
    const low = Math.min(open, close) - rnd(0, vol * 0.7);
    out.push({ open, close, high, low, vol: rnd(0.3, 1) });
    price = close;
  }
  return out;
}

export default function LandingPage() {
  const heroChartRef = useRef<HTMLDivElement>(null);
  const heroMockRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<HTMLDivElement>(null);

  /* Candlestick SVG renderer */
  const renderCandleSVG = useCallback(
    (data: Candle[], w = 560, h = 250, volH = 40) => {
      const pad = 8;
      const chartH = h - volH - pad;
      const highs = data.map((d) => d.high);
      const lows = data.map((d) => d.low);
      const max = Math.max(...highs);
      const min = Math.min(...lows);
      const rng = max - min || 1;
      const cw = w / data.length;
      const bw = Math.max(2, cw * 0.6);
      const y = (v: number) => pad + chartH - ((v - min) / rng) * (chartH - pad);

      let s = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%;display:block">`;
      for (let g = 0; g <= 4; g++) {
        const gy = pad + ((chartH - pad) * g) / 4;
        s += `<line x1="0" y1="${gy}" x2="${w}" y2="${gy}" stroke="rgba(255,255,255,0.04)"/>`;
      }
      data.forEach((d, i) => {
        const x = i * cw + cw / 2;
        const up = d.close >= d.open;
        const col = up ? "#10B981" : "#F43F5E";
        s += `<line x1="${x}" y1="${y(d.high)}" x2="${x}" y2="${y(d.low)}" stroke="${col}" stroke-width="1"/>`;
        const ry = y(Math.max(d.open, d.close));
        const rh = Math.max(1.5, Math.abs(y(d.open) - y(d.close)));
        s += `<rect x="${x - bw / 2}" y="${ry}" width="${bw}" height="${rh}" fill="${col}" rx="1"/>`;
        const vh = d.vol * volH;
        s += `<rect x="${x - bw / 2}" y="${h - vh}" width="${bw}" height="${vh}" fill="rgba(6,182,212,0.35)" rx="1"/>`;
      });
      const last = data[data.length - 1].close;
      s += `<line x1="0" y1="${y(last)}" x2="${w}" y2="${y(last)}" stroke="rgba(6,182,212,0.5)" stroke-width="1" stroke-dasharray="4 4"/>`;
      s += "</svg>";
      return s;
    },
    []
  );

  /* Render hero chart once mounted */
  useEffect(() => {
    if (heroChartRef.current) {
      const candles = genCandles(34, 1180, 14);
      heroChartRef.current.innerHTML = renderCandleSVG(candles, 560, 250, 40);
    }
  }, [renderCandleSVG]);

  /* Parallax mesh and hero 3D card tilt */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const cx = e.clientX / window.innerWidth - 0.5;
      const cy = e.clientY / window.innerHeight - 0.5;
      if (meshRef.current) {
        meshRef.current.style.transform = `translate(${cx * 20}px, ${cy * 20}px)`;
      }
      if (heroMockRef.current) {
        heroMockRef.current.style.transform = `rotateX(${14 - cy * 10}deg) rotateY(${cx * 12}deg)`;
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  /* Reveal on scroll */
  useEffect(() => {
    const elements = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="stock-sim-root">
      {/* SCOPED EXACT CSS FROM USER'S NEW HOMEPAGE SPEC */}
      <style>{`
        :root {
          --canvas: #060910;
          --canvas-2: #080C16;
          --glass: rgba(15, 23, 42, 0.65);
          --glass-solid: rgba(15, 23, 42, 0.9);
          --gb: rgba(255, 255, 255, 0.08);
          --gbh: rgba(6, 182, 212, 0.30);
          --cyan: #06B6D4;
          --emerald: #10B981;
          --rose: #F43F5E;
          --amber: #F59E0B;
          --t1: #F8FAFC;
          --t2: #94A3B8;
          --t3: #64748B;
          --brand: linear-gradient(135deg, #06B6D4 0%, #10B981 100%);
          --r-btn: 10px;
          --r-card: 16px;
          --r-hero: 20px;
          --r-pill: 9999px;
          --sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          --display: "Outfit", "Inter", sans-serif;
          --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        }

        .stock-sim-root {
          font-family: var(--sans);
          background: var(--canvas);
          color: var(--t1);
          line-height: 1.5;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
          min-height: 100vh;
        }

        .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
        .grad-text {
          background: var(--brand);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }

        /* Ambient depth */
        .ambient { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .55; animation: float 20s ease-in-out infinite; will-change: transform; }
        .b1 { width: 680px; height: 680px; top: -200px; left: -140px; background: radial-gradient(circle, rgba(6,182,212,.22), transparent 70%); }
        .b2 { width: 600px; height: 600px; top: 18%; right: -180px; background: radial-gradient(circle, rgba(16,185,129,.18), transparent 70%); animation-delay: -7s; }
        .b3 { width: 560px; height: 560px; bottom: -180px; left: 28%; background: radial-gradient(circle, rgba(6,182,212,.13), transparent 70%); animation-delay: -13s; }
        .mesh {
          position: absolute; inset: -10%;
          background-image: linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px);
          background-size: 58px 58px;
          mask-image: radial-gradient(circle at 50% 25%, #000, transparent 78%);
          -webkit-mask-image: radial-gradient(circle at 50% 25%, #000, transparent 78%);
          will-change: transform;
        }
        @keyframes float { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(46px,-34px) scale(1.09) } }

        .wrap { max-width: 1440px; margin: 0 auto; padding: 0 80px; position: relative; z-index: 2; }
        .reveal { opacity: 0; transform: translateY(34px); transition: opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1); }
        .reveal.in { opacity: 1; transform: none; }

        .pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: var(--r-pill); border: 1px solid var(--gb); background: rgba(255,255,255,.03); font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--t2); }
        .pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 10px var(--emerald); animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }

        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; font-weight: 600; border-radius: var(--r-btn); padding: 11px 18px; transition: transform .18s ease, box-shadow .25s ease, background .2s, border-color .2s; white-space: nowrap; cursor: pointer; text-decoration: none; }
        .btn:active { transform: translateY(1px); }
        .btn-primary { background: var(--brand); color: #04121a; box-shadow: 0 8px 24px rgba(6,182,212,.32), inset 0 1px 0 rgba(255,255,255,.35); }
        .btn-primary:hover { box-shadow: 0 12px 34px rgba(6,182,212,.5), inset 0 1px 0 rgba(255,255,255,.4); transform: translateY(-2px); color: #04121a; }
        .btn-ghost { border: 1px solid var(--gb); background: rgba(255,255,255,.02); color: var(--t1); }
        .btn-ghost:hover { border-color: var(--gbh); background: rgba(6,182,212,.06); color: var(--t1); }
        .btn-lg { padding: 15px 26px; font-size: 15px; }

        /* Nav */
        .nav { position: sticky; top: 0; z-index: 60; height: 64px; background: rgba(6,9,16,.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,.06); }
        .nav-inner { max-width: 1440px; margin: 0 auto; padding: 0 80px; height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; text-decoration: none; }
        .brand-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--brand); display: grid; place-items: center; font-family: var(--display); font-weight: 800; font-size: 14px; color: #04121a; box-shadow: 0 0 22px rgba(6,182,212,.55), inset 0 1px 0 rgba(255,255,255,.45); }
        .brand-name { font-family: var(--display); font-weight: 700; letter-spacing: .14em; font-size: 13.5px; color: var(--t1); }
        .nav-links { display: flex; gap: 32px; }
        .nav-links a { font-size: 14px; color: var(--t2); font-weight: 500; transition: color .2s; text-decoration: none; }
        .nav-links a:hover { color: var(--t1); }
        .nav-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .link-btn { font-size: 14px; font-weight: 500; color: var(--t2); padding: 9px 12px; border-radius: var(--r-btn); transition: color .2s; text-decoration: none; }
        .link-btn:hover { color: var(--t1); }

        /* Ticker */
        .ticker { height: 36px; overflow: hidden; border-bottom: 1px solid rgba(255,255,255,.05); background: rgba(8,12,22,.6); backdrop-filter: blur(10px); position: sticky; top: 64px; z-index: 55; }
        .ticker-track { display: flex; align-items: center; gap: 0; height: 36px; white-space: nowrap; animation: marquee 38s linear infinite; will-change: transform; }
        .ticker:hover .ticker-track { animation-play-state: paused; }
        @keyframes marquee { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
        .tk { display: inline-flex; align-items: center; gap: 8px; padding: 0 22px; font-size: 12.5px; font-weight: 500; border-right: 1px solid rgba(255,255,255,.05); }
        .tk .sym { color: var(--t2); font-weight: 600; letter-spacing: .04em; }
        .tk .px { color: var(--t1); }
        .tk .chg { font-weight: 600; }
        .up { color: var(--emerald); } .down { color: var(--rose); } .flat { color: var(--t3); }

        /* Hero */
        .hero { padding: 88px 0 64px; text-align: center; position: relative; }
        .hero .pill { margin-bottom: 26px; }
        .hero h1 { font-family: var(--display); font-weight: 800; font-size: 64px; line-height: 1.05; letter-spacing: -.02em; max-width: 820px; margin: 0 auto 22px; }
        .hero p.sub { font-size: 18px; color: var(--t2); max-width: 640px; margin: 0 auto 34px; }
        .hero .ctas { display: flex; gap: 14px; justify-content: center; margin-bottom: 64px; }

        /* Hero terminal mockup */
        .hero-mock-stage { perspective: 1800px; max-width: 960px; margin: 0 auto; }
        .hero-mock { width: 100%; max-width: 960px; border-radius: var(--r-hero); background: var(--glass); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--gb); box-shadow: 0 40px 120px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.03), inset 0 1px 0 rgba(255,255,255,.06); overflow: hidden; transform: rotateX(14deg) rotateY(0deg); transition: transform .25s ease; transform-style: preserve-3d; will-change: transform; text-align: left; }
        .hm-top { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--gb); background: rgba(8,12,22,.5); }
        .hm-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .hm-body { display: grid; grid-template-columns: 1fr 1.7fr; gap: 1px; background: var(--gb); }
        .hm-left, .hm-right { background: var(--canvas-2); padding: 18px; }
        .hm-label { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--t3); margin-bottom: 8px; }
        .hm-wallet { font-family: var(--mono); font-size: 26px; font-weight: 700; color: var(--t1); margin-bottom: 4px; }
        .hm-sub { font-size: 12px; color: var(--t2); }
        .hm-pnl { display: inline-flex; flex-direction: column; margin-top: 20px; padding: 12px 14px; border-radius: 12px; background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.28); }
        .hm-pnl .big { font-family: var(--mono); font-size: 20px; font-weight: 700; color: var(--emerald); }
        .hm-pnl .lbl { font-size: 11px; color: var(--t2); margin-top: 2px; }
        .hm-chart-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .hm-chart-head .nm { font-weight: 700; font-size: 15px; }
        .hm-chart-head .nm span { color: var(--t3); font-weight: 500; font-size: 12px; margin-left: 6px; }
        .chip { font-family: var(--mono); font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: var(--r-pill); }
        .chip.up { background: rgba(16,185,129,.12); color: var(--emerald); } .chip.down { background: rgba(244,63,94,.12); color: var(--rose); }

        /* Section shells */
        .section { padding: 100px 0; }
        .sec-head { text-align: center; margin-bottom: 56px; }
        .sec-head .pill { margin-bottom: 18px; }
        .sec-head h2 { font-family: var(--display); font-weight: 800; font-size: 42px; letter-spacing: -.02em; line-height: 1.1; }
        .sec-head p { color: var(--t2); font-size: 16px; max-width: 560px; margin: 14px auto 0; }

        .glass { background: var(--glass); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--gb); border-radius: var(--r-card); box-shadow: inset 0 1px 0 rgba(255,255,255,.05); }
        .glass-hover { transition: transform .3s cubic-bezier(.22,1,.36,1), border-color .3s, box-shadow .3s; }
        .glass-hover:hover { transform: translateY(-6px); border-color: var(--gbh); box-shadow: 0 24px 60px rgba(0,0,0,.45), 0 0 30px rgba(6,182,212,.14), inset 0 1px 0 rgba(255,255,255,.07); }

        /* About */
        .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center; }
        .about-left h2 { font-family: var(--display); font-weight: 800; font-size: 38px; letter-spacing: -.02em; line-height: 1.12; margin-bottom: 18px; }
        .about-left p.lead { color: var(--t2); font-size: 16px; margin-bottom: 24px; }
        .checks { display: flex; flex-direction: column; gap: 14px; }
        .check { display: flex; gap: 12px; align-items: flex-start; }
        .check .ic { width: 24px; height: 24px; border-radius: 8px; background: rgba(16,185,129,.14); border: 1px solid rgba(16,185,129,.3); color: var(--emerald); display: grid; place-items: center; flex-shrink: 0; font-size: 13px; margin-top: 1px; }
        .check .tx b { display: block; font-size: 14.5px; font-weight: 600; margin-bottom: 2px; }
        .check .tx span { font-size: 13.5px; color: var(--t2); }
        .stats-2x2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .stat { padding: 26px 22px; border-radius: var(--r-card); }
        .stat .v { font-family: var(--display); font-weight: 800; font-size: 34px; letter-spacing: -.02em; margin-bottom: 6px; }
        .stat .k { font-size: 13px; color: var(--t2); }
        .stat:nth-child(1) .v { color: var(--cyan); } .stat:nth-child(2) .v { color: var(--emerald); }
        .stat:nth-child(3) .v { color: var(--amber); } .stat:nth-child(4) .v { color: var(--t1); }

        /* Bento */
        .bento { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .fcard { padding: 28px; position: relative; overflow: hidden; }
        .fcard .fic { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; margin-bottom: 18px; background: rgba(6,182,212,.1); border: 1px solid rgba(6,182,212,.22); color: var(--cyan); font-size: 20px; }
        .fcard h3 { font-family: var(--display); font-weight: 700; font-size: 18px; margin-bottom: 8px; letter-spacing: -.01em; }
        .fcard p { font-size: 14px; color: var(--t2); line-height: 1.55; }
        .fcard .glow { position: absolute; top: -40%; right: -30%; width: 220px; height: 220px; background: radial-gradient(circle, rgba(6,182,212,.16), transparent 70%); opacity: 0; transition: opacity .35s; pointer-events: none; }
        .fcard:hover .glow { opacity: 1; }

        .mini-dom { margin-top: 16px; display: flex; flex-direction: column; gap: 4px; }
        .mini-dom .row { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 11px; }
        .mini-dom .bar { height: 14px; border-radius: 4px; flex-shrink: 0; }
        .mini-dom .bid .bar { background: rgba(6,182,212,.25); } .mini-dom .ask .bar { background: rgba(244,63,94,.25); }
        .mini-dom .bid span { color: var(--cyan); } .mini-dom .ask span { color: var(--rose); }
        .greek-row { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
        .greek { font-family: var(--mono); font-size: 11px; padding: 5px 9px; border-radius: 8px; background: rgba(255,255,255,.04); border: 1px solid var(--gb); }
        .greek b { color: var(--cyan); }

        /* Leaderboard */
        .leader { padding: 30px 32px; margin-bottom: 40px; }
        .leader-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
        .leader-head h3 { font-family: var(--display); font-weight: 700; font-size: 20px; }
        .leader-head .pill { margin: 0; }
        .podium { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .rank { display: flex; align-items: center; gap: 14px; padding: 18px; border-radius: 14px; background: rgba(255,255,255,.02); border: 1px solid var(--gb); }
        .rank .medal { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; font-family: var(--display); font-weight: 800; font-size: 16px; color: #04121a; flex-shrink: 0; }
        .rank.g .medal { background: linear-gradient(135deg, #FDE68A, #F59E0B); box-shadow: 0 0 20px rgba(245,158,11,.4); }
        .rank.s .medal { background: linear-gradient(135deg, #E2E8F0, #94A3B8); }
        .rank.b .medal { background: linear-gradient(135deg, #FBBF77, #B45309); }
        .rank .nm { font-weight: 600; font-size: 14px; }
        .rank .meta { display: flex; gap: 8px; margin-top: 6px; }
        .rank .pf { font-family: var(--mono); font-weight: 700; color: var(--emerald); font-size: 14px; }
        .wr { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 9999px; background: rgba(6,182,212,.12); color: var(--cyan); }

        /* Testimonials */
        .tgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .tcard { padding: 26px; }
        .stars { color: var(--amber); font-size: 14px; margin-bottom: 14px; letter-spacing: 2px; }
        .tcard p { font-size: 14.5px; color: var(--t1); line-height: 1.6; margin-bottom: 20px; }
        .tuser { display: flex; align-items: center; gap: 12px; }
        .tuser .av { width: 42px; height: 42px; border-radius: 50%; background: var(--brand); display: grid; place-items: center; font-weight: 700; color: #04121a; font-size: 15px; }
        .tuser .nm { font-weight: 600; font-size: 14px; } .tuser .rl { font-size: 12.5px; color: var(--t2); }

        /* Pre-footer CTA */
        .cta-banner { position: relative; overflow: hidden; text-align: center; padding: 64px 40px; border-radius: 24px; background: linear-gradient(135deg, rgba(6,182,212,.12), rgba(16,185,129,.1)); border: 1px solid rgba(6,182,212,.24); }
        .cta-banner::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 50% 0%, rgba(6,182,212,.22), transparent 60%); pointer-events: none; }
        .cta-banner h2 { font-family: var(--display); font-weight: 800; font-size: 40px; letter-spacing: -.02em; position: relative; margin-bottom: 12px; }
        .cta-banner p { color: var(--t2); position: relative; margin-bottom: 28px; font-size: 16px; }

        /* Footer */
        .footer { border-top: 1px solid rgba(255,255,255,.06); padding: 64px 0 34px; margin-top: 80px; }
        .foot-grid { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 44px; }
        .foot-brand p { color: var(--t2); font-size: 14px; margin: 16px 0 20px; max-width: 280px; }
        .socials { display: flex; gap: 10px; }
        .socials a { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--gb); display: grid; place-items: center; color: var(--t2); transition: .2s; text-decoration: none; }
        .socials a:hover { border-color: var(--gbh); color: var(--cyan); background: rgba(6,182,212,.06); }
        .foot-col h4 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--t3); margin-bottom: 16px; }
        .foot-col a { display: block; font-size: 14px; color: var(--t2); margin-bottom: 11px; transition: color .2s; text-decoration: none; }
        .foot-col a:hover { color: var(--t1); }
        .disclaimer { border-top: 1px solid rgba(255,255,255,.06); padding-top: 24px; font-size: 12.5px; color: var(--t3); display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }

        @media(max-width: 1080px) {
          .wrap, .nav-inner { padding: 0 32px; }
          .nav-links { display: none; }
          .hero h1 { font-size: 46px; }
          .about-grid, .bento, .tgrid, .podium, .foot-grid { grid-template-columns: 1fr; }
          .hm-body { grid-template-columns: 1fr; }
        }
        @media(max-width: 560px) {
          .wrap, .nav-inner { padding: 0 20px; }
          .hero { padding: 52px 0 40px; }
          .hero h1 { font-size: 34px; }
          .sec-head h2, .cta-banner h2 { font-size: 28px; }
          .section { padding: 64px 0; }
          .stats-2x2 { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* AMBIENT LAYERS + GLOBAL MESH FLOW */}
      <div className="ambient">
        <div className="blob b1"></div>
        <div className="blob b2"></div>
        <div className="blob b3"></div>
        <div className="mesh" ref={meshRef}></div>
        {/* Interactive gravitational mesh flow canvas everywhere */}
        <MeshFlowBackground
          gridSpacing={46}
          dotRadius={1.2}
          influenceRadius={180}
          sigma={85}
          maxDisplacement={26}
          damping={0.88}
          springStrength={0.045}
          attractionStrength={0.6}
          dotColor="rgba(255, 255, 255, 0.04)"
          lineColor="rgba(255, 255, 255, 0.025)"
          activeDotColor="rgba(6, 182, 212, 0.5)"
          activeLineColor="rgba(6, 182, 212, 0.2)"
        />
      </div>

      {/* ================= EXACT NEW HOMEPAGE ================= */}
      <div id="landing">
        {/* NAV */}
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="brand">
              <div className="brand-icon">SS</div>
              <div className="brand-name">STOCK SIMULATOR</div>
            </Link>
            <div className="nav-links">
              <a href="#home">Home</a>
              <a href="#about">About</a>
              <a href="#features">Features</a>
              <a href="#testimonials">Testimonials</a>
              <Link href="/trade">Terminal</Link>
            </div>
            <div className="nav-right">
              <Link href="/trade" className="link-btn">
                Sign In
              </Link>
              <Link href="/trade" className="btn btn-primary">
                Start Trading Free →
              </Link>
            </div>
          </div>
        </nav>

        {/* TICKER */}
        <div className="ticker">
          <div className="ticker-track">
            {[...TICKERS, ...TICKERS].map((t, idx) => (
              <span className="tk" key={idx}>
                <span className="sym">{t.s}</span>
                <span className="px mono">{t.p}</span>
                <span className={`chg mono ${t.d}`}>{t.c}</span>
              </span>
            ))}
          </div>
        </div>

        {/* HERO */}
        <section className="wrap hero" id="home">
          <span className="pill">
            <span className="dot"></span>
            🟢 NEW: REAL-TIME F&amp;O OPTIONS SIMULATOR • LIVE NSE/BSE FEED
          </span>
          <h1>
            Master the Market.
            <br />
            <span className="grad-text">Zero Financial Risk.</span>
          </h1>
          <p className="sub">
            Experience institutional-grade paper trading with ₹10,00,000 virtual capital.
            Practice intraday equities, F&amp;O options strategies, and algo risk rules on real-time market data.
          </p>
          <div className="ctas">
            <Link href="/trade" className="btn btn-primary btn-lg">
              Open Free Terminal →
            </Link>
            <a href="#features" className="btn btn-ghost btn-lg">
              Explore Features
            </a>
          </div>

          {/* HERO MOCK STAGE WITH TILT */}
          <div className="hero-mock-stage">
            <div className="hero-mock" ref={heroMockRef} id="heroMock">
              <div className="hm-top">
                <span className="hm-dot" style={{ background: "#F43F5E" }}></span>
                <span className="hm-dot" style={{ background: "#F59E0B" }}></span>
                <span className="hm-dot" style={{ background: "#10B981" }}></span>
                <span style={{ marginLeft: "12px", fontSize: "12px", color: "var(--t3)" }} className="mono">
                  stocksimulator.app — paper terminal
                </span>
                <span className="pill" style={{ marginLeft: "auto", padding: "4px 10px", fontSize: "10px" }}>
                  <span className="dot"></span>LIVE
                </span>
              </div>
              <div className="hm-body">
                <div className="hm-left">
                  <div className="hm-label">Paper Wallet — Buying Power</div>
                  <div className="hm-wallet">₹10,00,000.00</div>
                  <div className="hm-sub">Margin used ₹1,24,528 • Free ₹8,75,472</div>
                  <div className="hm-pnl">
                    <span className="big">+₹14,280.50</span>
                    <span className="lbl">Intraday P&amp;L • +1.42% today</span>
                  </div>
                  <div style={{ marginTop: "18px" }} className="hm-label">Positions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }} className="mono">
                      <span>RELIANCE</span>
                      <span className="up">+2.1%</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }} className="mono">
                      <span>NIFTY 25400 CE</span>
                      <span className="up">+18.4%</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }} className="mono">
                      <span>HDFCBANK</span>
                      <span className="down">-0.4%</span>
                    </div>
                  </div>
                </div>
                <div className="hm-right">
                  <div className="hm-chart-head">
                    <div className="nm">
                      RELIANCE <span>NSE • 1D</span>
                    </div>
                    <div className="chip up mono">₹1,226.40 +1.42%</div>
                  </div>
                  <div id="heroChart" ref={heroChartRef}></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ABOUT */}
        <section className="wrap section reveal" id="about">
          <div className="about-grid">
            <div className="about-left">
              <span className="pill">Why Choose Us</span>
              <h2 style={{ marginTop: "16px" }}>
                Built for Serious Traders,
                <br />
                Not Gamblers.
              </h2>
              <p className="lead">
                Our realistic matching engine goes far beyond a price feed. Every fill simulates real slippage,
                live liquidity queues, STT and exchange transaction taxes, and exchange circuit breakers — so your
                paper track record actually reflects live-market behavior.
              </p>
              <div className="checks">
                <div className="check">
                  <div className="ic">✓</div>
                  <div className="tx">
                    <b>True-to-market execution</b>
                    <span>Order fills respect bid/ask depth, partial fills, and queue priority.</span>
                  </div>
                </div>
                <div className="check">
                  <div className="ic">✓</div>
                  <div className="tx">
                    <b>Accurate cost modelling</b>
                    <span>STT, brokerage, GST, stamp duty and slippage baked into every P&amp;L.</span>
                  </div>
                </div>
                <div className="check">
                  <div className="ic">✓</div>
                  <div className="tx">
                    <b>Circuit breaker safety</b>
                    <span>Upper/lower circuits and margin calls behave like the real NSE/BSE.</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="stats-2x2">
              <div className="stat glass glass-hover">
                <div className="v">₹10,00,000</div>
                <div className="k">Virtual capital on signup</div>
              </div>
              <div className="stat glass glass-hover">
                <div className="v">100% Free</div>
                <div className="k">Zero commissions, zero fees forever</div>
              </div>
              <div className="stat glass glass-hover">
                <div className="v">&lt; 10ms</div>
                <div className="k">Simulated institutional execution latency</div>
              </div>
              <div className="stat glass glass-hover">
                <div className="v">1,200+</div>
                <div className="k">NSE Equities, Indices, Futures &amp; Options</div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="wrap section reveal" id="features">
          <div className="sec-head">
            <span className="pill">Platform Features</span>
            <h2>Everything a Pro Desk Needs</h2>
            <p>Institutional tooling, retail simplicity. Built to make disciplined traders out of ambitious ones.</p>
          </div>
          <div className="bento">
            <div className="fcard glass glass-hover">
              <div className="glow"></div>
              <div className="fic">☷</div>
              <h3>Level 2 Market Depth (DOM)</h3>
              <p>5-tier bid/ask ladder with visual depth bars that reveal order-queue dynamics in real time.</p>
              <div className="mini-dom">
                <div className="row bid">
                  <span>1,226.05</span>
                  <div className="bar" style={{ width: "70%" }}></div>
                </div>
                <div className="row bid">
                  <span>1,226.00</span>
                  <div className="bar" style={{ width: "48%" }}></div>
                </div>
                <div className="row ask">
                  <span>1,226.40</span>
                  <div className="bar" style={{ width: "60%" }}></div>
                </div>
                <div className="row ask">
                  <span>1,226.45</span>
                  <div className="bar" style={{ width: "38%" }}></div>
                </div>
              </div>
            </div>

            <div className="fcard glass glass-hover">
              <div className="glow"></div>
              <div className="fic">Δ</div>
              <h3>Options Chain &amp; Greek Analytics</h3>
              <p>Live NIFTY / BANKNIFTY calls and puts with real-time Delta, Gamma, Theta and Vega on every strike.</p>
              <div className="greek-row">
                <span className="greek">Δ <b>0.52</b></span>
                <span className="greek">Γ <b>0.008</b></span>
                <span className="greek">Θ <b>-4.21</b></span>
                <span className="greek">ν <b>12.6</b></span>
              </div>
            </div>

            <div className="fcard glass glass-hover">
              <div className="glow"></div>
              <div className="fic">⚡</div>
              <h3>Real-Time WebSocket Engine</h3>
              <p>Sub-50ms tick streaming mirrored from exchange broadcasts for lifelike, low-latency price action.</p>
            </div>

            <div className="fcard glass glass-hover">
              <div className="glow"></div>
              <div className="fic">⛨</div>
              <h3>Institutional Risk Guard</h3>
              <p>Max daily-loss limits, automatic circuit-breaker cutoffs and margin-call alerts keep discipline enforced.</p>
            </div>

            <div className="fcard glass glass-hover">
              <div className="glow"></div>
              <div className="fic">✦</div>
              <h3>AI Trading Mentor</h3>
              <p>Instant post-trade feedback analysing your risk-reward ratio and flagging revenge-trading behaviour.</p>
            </div>

            <div className="fcard glass glass-hover">
              <div className="glow"></div>
              <div className="fic">▣</div>
              <h3>Multi-Wallet Management</h3>
              <p>Segregate strategies into distinct accounts — Scalping, Swing and F&amp;O Hedging — with isolated P&amp;L.</p>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="wrap section reveal" id="testimonials">
          <div className="leader glass">
            <div className="leader-head">
              <h3>🏆 Weekly Leaderboard</h3>
              <span className="pill">
                <span className="dot"></span>Live • Resets Monday
              </span>
            </div>
            <div className="podium">
              <div className="rank g">
                <div className="medal">1</div>
                <div>
                  <div className="nm">Arjun_FnO</div>
                  <div className="meta">
                    <span className="pf">+84.2%</span>
                    <span className="wr">Win 78%</span>
                  </div>
                </div>
              </div>
              <div className="rank s">
                <div className="medal">2</div>
                <div>
                  <div className="nm">SwingQueen</div>
                  <div className="meta">
                    <span className="pf">+62.1%</span>
                    <span className="wr">Win 71%</span>
                  </div>
                </div>
              </div>
              <div className="rank b">
                <div className="medal">3</div>
                <div>
                  <div className="nm">Scalp_Raja</div>
                  <div className="meta">
                    <span className="pf">+45.8%</span>
                    <span className="wr">Win 69%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="sec-head" style={{ marginBottom: "40px" }}>
            <span className="pill">Loved By Traders</span>
            <h2>Trusted by Students, Scalpers &amp; Educators</h2>
          </div>

          <div className="tgrid">
            <div className="tcard glass glass-hover">
              <div className="stars">★★★★★</div>
              <p>
                &ldquo;Tested my Iron Condor strategy for 3 months here before risking real capital. The Greeks and margin
                behaviour matched my broker almost exactly.&rdquo;
              </p>
              <div className="tuser">
                <div className="av">NK</div>
                <div>
                  <div className="nm">Neha Kulkarni</div>
                  <div className="rl">College Finance Student</div>
                </div>
              </div>
            </div>

            <div className="tcard glass glass-hover">
              <div className="stars">★★★★★</div>
              <p>
                &ldquo;Execution speed and Level 2 depth feel identical to my real broker terminal. I run my morning warm-up
                scalps here every single day.&rdquo;
              </p>
              <div className="tuser">
                <div className="av">RV</div>
                <div>
                  <div className="nm">Rohit Verma</div>
                  <div className="rl">Full-Time Intraday Scalper</div>
                </div>
              </div>
            </div>

            <div className="tcard glass glass-hover">
              <div className="stars">★★★★★</div>
              <p>
                &ldquo;I train 500+ students with zero financial risk. The AI mentor feedback and leaderboard turn practice
                into a genuinely competitive classroom.&rdquo;
              </p>
              <div className="tuser">
                <div className="av">SM</div>
                <div>
                  <div className="nm">Sanjay Menon</div>
                  <div className="rl">Finance Educator</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA BANNER */}
        <section className="wrap reveal">
          <div className="cta-banner">
            <h2>Ready to test your edge without risking your capital?</h2>
            <p>Join thousands of traders sharpening their strategy on live Indian markets — completely free.</p>
            <Link href="/trade" className="btn btn-primary btn-lg">
              Launch Simulator Now — It&apos;s Free →
            </Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="footer">
          <div className="wrap">
            <div className="foot-grid">
              <div className="foot-brand">
                <div className="brand">
                  <div className="brand-icon">SS</div>
                  <div className="brand-name">STOCK SIMULATOR</div>
                </div>
                <p>
                  The institutional-grade paper-trading platform for Indian markets. Practice, compete and master NSE/BSE equities &amp; F&amp;O — risk-free.
                </p>
                <div className="socials">
                  <a href="#" title="X">𝕏</a>
                  <a href="#" title="GitHub">◓</a>
                  <a href="#" title="Discord">◈</a>
                  <a href="#" title="LinkedIn">in</a>
                </div>
              </div>
              <div className="foot-col">
                <h4>Product</h4>
                <Link href="/trade">Equities</Link>
                <Link href="/options">Options Chain</Link>
                <Link href="/options">Strategy Builder</Link>
                <Link href="/trade">API Docs</Link>
              </div>
              <div className="foot-col">
                <h4>Resources</h4>
                <a href="#">Market Holidays</a>
                <a href="#">Trading Glossary</a>
                <a href="#">Risk Calculator</a>
              </div>
              <div className="foot-col">
                <h4>Legal</h4>
                <a href="#">SEBI Compliance Notice</a>
                <a href="#">Terms of Service</a>
                <a href="#">Privacy Policy</a>
              </div>
            </div>
            <div className="disclaimer">
              <span>
                Stock Simulator is an educational paper-trading platform. No real financial transactions are executed. Market data is for simulation purposes only.
              </span>
              <span>© 2026 Stock Simulator</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
