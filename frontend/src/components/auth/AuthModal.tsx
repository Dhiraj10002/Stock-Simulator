"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Lock,
  Mail,
  User,
  ShieldCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  TrendingUp,
  Zap,
} from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  mode: "login" | "register";
  onClose: () => void;
  onSuccess: () => void;
}

// Harmonious oceanic chromatic palette (Electric Cyan, Sky Blue, Royal Sapphire, Mint Jade, Diamond White)
const PARTICLE_PALETTE = [
  { prefix: "rgba(6, 182, 212, ", hex: "#06b6d4" },   // Electric Cyan
  { prefix: "rgba(14, 165, 233, ", hex: "#0ea5e9" },  // Sky Blue
  { prefix: "rgba(59, 130, 246, ", hex: "#3b82f6" },  // Royal Sapphire
  { prefix: "rgba(16, 185, 129, ", hex: "#10b981" },  // Mint Jade
  { prefix: "rgba(45, 212, 191, ", hex: "#2dd4bf" },  // Vibrant Teal
  { prefix: "rgba(255, 255, 255, ", hex: "#ffffff" },  // Diamond White
];

export default function AuthModal({
  isOpen,
  mode: initialMode,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync mode if initialMode changes
  useEffect(() => {
    queueMicrotask(() => {
      setMode(initialMode);
      setError(null);
    });
  }, [initialMode, isOpen]);

  // Moving 3D balls background canvas for modal backdrop
  useEffect(() => {
    if (!isOpen) return;
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

    const count = 480;
    const particles = Array.from({ length: count }, () => {
      const colorObj = PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)];
      return {
        x: (Math.random() - 0.5) * 2400,
        y: (Math.random() - 0.5) * 2400,
        z: Math.random() * 1000 + 1,
        size: Math.random() * 2.6 + 0.8,
        colorPrefix: colorObj.prefix,
        colorHex: colorObj.hex,
      };
    });

    let lastTime = 0;
    const render = (time: number) => {
      if (document.hidden) {
        animId = requestAnimationFrame(render);
        return;
      }
      if (time - lastTime < 16) {
        animId = requestAnimationFrame(render);
        return;
      }
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      const fov = 400;
      const cx = width / 2;
      const cy = height / 2;
      const speed = 1.45;

      for (let i = 0; i < count; i++) {
        const p = particles[i];
        p.z -= speed;
        if (p.z <= 0) {
          p.z = 1000;
          p.x = (Math.random() - 0.5) * 2400;
          p.y = (Math.random() - 0.5) * 2400;
        }

        const k = fov / p.z;
        const x = p.x * k + cx;
        const y = p.y * k + cy;

        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          const alpha = Math.min(1, Math.max(0.12, (1 - p.z / 1000) * 1.35));
          const rad = Math.max(0.65, p.size * k * 0.85);

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
  }, [isOpen]);

  if (!isOpen) return null;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "register") {
        const regRes = await fetch(`${apiUrl}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name || "Trader", email, password }),
        });
        const regBody = await regRes.json();
        if (!regRes.ok || !regBody.success) {
          throw new Error(regBody.message || "Registration failed");
        }
      }

      const loginRes = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await loginRes.json();
      if (!loginRes.ok || !loginBody.success) {
        throw new Error(loginBody.message || "Invalid email or password");
      }

      const { access_token, refresh_token } = loginBody.data;
      localStorage.setItem("auth_token", access_token);
      localStorage.setItem("stock-simulator-access-token", access_token);
      localStorage.setItem("stock-simulator-refresh-token", refresh_token);
      localStorage.setItem("user_name", name || (email === "trader@example.com" ? "Demo Scalper" : "Trader"));
      localStorage.setItem("user_email", email);

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden animate-fade-in"
      style={{ backgroundColor: "rgba(3, 7, 15, 0.88)" }}
    >
      {/* 3D Global Perspective Moving Background Balls Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-0"
      />

      {/* Atmospheric Aurora Spheres behind glass card (Harmonious Cyan & Royal Blue & Mint) */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Top-Left Electric Cyan Glow */}
        <div
          className="absolute -top-32 -left-32 w-[450px] h-[450px] rounded-full blur-[140px] opacity-35 animate-pulse"
          style={{ background: "radial-gradient(circle, rgba(6, 182, 212, 0.6), transparent 70%)" }}
        />
        {/* Top-Right Royal Sapphire Glow */}
        <div
          className="absolute -top-32 -right-32 w-[450px] h-[450px] rounded-full blur-[140px] opacity-30"
          style={{ background: "radial-gradient(circle, rgba(37, 99, 235, 0.55), transparent 70%)" }}
        />
        {/* Bottom Mint Jade Accent */}
        <div
          className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full blur-[150px] opacity-25"
          style={{ background: "radial-gradient(circle, rgba(16, 185, 129, 0.45), transparent 70%)" }}
        />
      </div>

      {/* ================= HIGH-END LUXURY FROSTED GLASS AUTH CARD ================= */}
      {/* 1px Precision Chromatic Bevel Hairline */}
      <div className="relative z-10 w-full max-w-[450px] p-[1px] rounded-[28px] bg-gradient-to-b from-cyan-400/60 via-blue-500/30 to-emerald-400/30 shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(6,182,212,0.15)] transition-all">
        {/* Inner Card Body */}
        <div
          className="relative w-full rounded-[27px] overflow-hidden p-6 sm:p-7 text-slate-100"
          style={{
            background: "linear-gradient(180deg, rgba(8, 14, 26, 0.88) 0%, rgba(5, 9, 18, 0.94) 100%)",
            backdropFilter: "blur(36px) saturate(1.9)",
            WebkitBackdropFilter: "blur(36px) saturate(1.9)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Light-Refraction Specular Hairline */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 via-white/70 to-transparent" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            aria-label="Close auth modal"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header Branding */}
          <div className="flex items-center gap-3.5 mb-5">
            {/* Holographic Glowing Icon Badge */}
            <div className="relative p-[1px] rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-emerald-400 shrink-0 shadow-[0_0_20px_rgba(6,182,212,0.35)]">
              <div className="w-11 h-11 rounded-[15px] bg-[#070d1a] flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
                {mode === "login" ? (
                  <>
                    Welcome to{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-300 font-extrabold">
                      Stock Simulator
                    </span>
                  </>
                ) : (
                  <>
                    Create Your{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-300 font-extrabold">
                      Trading Desk
                    </span>
                  </>
                )}
              </h2>
              <p className="text-xs text-slate-400 pt-0.5">
                {mode === "login"
                  ? "Institutional paper trading with live NSE data"
                  : "Start trading with ₹10 Lakhs virtual capital"}
              </p>
            </div>
          </div>

          {/* Unified Sleek Telemetry HUD Bar (Clean, integrated, not blocky) */}
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm mb-5 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>24ms Tick</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span>₹10L Capital</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5 text-sky-200 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Zero Risk</span>
            </div>
          </div>

          {/* Mode Selector Tabs (Glass Segmented Control) */}
          <div className="flex p-1 bg-black/40 rounded-xl border border-white/[0.08] mb-5">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                mode === "login"
                  ? "text-white bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_2px_12px_rgba(6,182,212,0.35),inset_0_1px_1px_rgba(255,255,255,0.4)] border border-cyan-400/40 font-bold"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                mode === "register"
                  ? "text-white bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_2px_12px_rgba(6,182,212,0.35),inset_0_1px_1px_rgba(255,255,255,0.4)] border border-cyan-400/40 font-bold"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-shake">
              <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === "register" && (
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-300 mb-1.5 font-medium">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-cyan-400/80" />
                  <input
                    type="text"
                    required
                    placeholder="Dhiraj"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-cyan-400/70 focus:bg-cyan-950/15 focus:shadow-[0_0_20px_rgba(6,182,212,0.18)] focus:outline-none rounded-xl text-xs text-white placeholder-slate-500 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-300 mb-1.5 font-medium">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-cyan-400/80" />
                <input
                  type="email"
                  required
                  placeholder="trader@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-cyan-400/70 focus:bg-cyan-950/15 focus:shadow-[0_0_20px_rgba(6,182,212,0.18)] focus:outline-none rounded-xl text-xs text-white placeholder-slate-500 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-300 font-medium">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-cyan-400/80" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-cyan-400/70 focus:bg-cyan-950/15 focus:shadow-[0_0_20px_rgba(6,182,212,0.18)] focus:outline-none rounded-xl text-xs text-white placeholder-slate-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>


            {/* Main CTA Submit Button (Electric Cyan ➔ Royal Sapphire Gradient) */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full mt-2 py-3 rounded-xl text-white font-extrabold text-xs sm:text-sm tracking-wide border border-cyan-300/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_4px_22px_rgba(6,182,212,0.4),0_0_35px_rgba(37,99,235,0.25)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_6px_30px_rgba(6,182,212,0.55),0_0_45px_rgba(37,99,235,0.35)] transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #06b6d4 0%, #0284c7 48%, #2563eb 100%)",
              }}
            >
              {/* Top specular hairline */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none" />

              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-cyan-100" />
                  <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                    {mode === "login" ? "Sign In & Open Terminal" : "Create Account & Open Terminal"}
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Footer Notes with Subtle Specular Divider */}
          <div className="mt-5 pt-4 border-t border-white/[0.08] relative">
            <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Institutional paper trading desk • ₹10L zero-risk capital</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
