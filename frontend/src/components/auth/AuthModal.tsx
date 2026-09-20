"use client";

import React, { useState } from "react";
import { X, Lock, Mail, User, Sparkles, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  mode: "login" | "register";
  onClose: () => void;
  onSuccess: () => void;
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync mode if initialMode changes
  React.useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

  const handleDemoLogin = async () => {
    setLoading(true);
    setError(null);
    setEmail("trader@example.com");
    setPassword("password123");

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "trader@example.com", password: "password123" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to log in as demo trader");
      }

      const { access_token, refresh_token } = data.data;
      localStorage.setItem("auth_token", access_token);
      localStorage.setItem("stock-simulator-access-token", access_token);
      localStorage.setItem("stock-simulator-refresh-token", refresh_token);
      localStorage.setItem("user_name", "Demo Scalper");
      localStorage.setItem("user_email", "trader@example.com");

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error logging in");
    } finally {
      setLoading(false);
    }
  };

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
      localStorage.setItem("user_name", name || "Trader");
      localStorage.setItem("user_email", email);

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-md bg-[#0e1424] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00d09c] via-cyan-400 to-[#7c3aed]" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Branding */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00d09c] to-[#00b386] flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-white font-extrabold text-xl">G</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {mode === "login" ? "Welcome Back to Groww Sim" : "Create Groww Sim Account"}
            </h2>
            <p className="text-xs text-slate-400">
              {mode === "login"
                ? "Sign in to access your live explore dashboard"
                : "Join thousands of traders with ₹10L virtual capital"}
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex p-1 bg-slate-900/90 rounded-xl border border-white/10 mb-5">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === "login"
                ? "bg-[#00d09c] text-slate-950 shadow-md font-bold"
                : "text-slate-400 hover:text-white"
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
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === "register"
                ? "bg-[#00d09c] text-slate-950 shadow-md font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Demo Fast Login Pill Button */}
        <div className="mb-5">
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-cyan-950/60 text-cyan-300 text-xs font-semibold transition-all group"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>1-Click Demo Login (Pre-funded ₹10 Lakhs)</span>
            </span>
            <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
          <div className="flex-1 h-px bg-white/10" />
          <span>or use your credentials</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === "register" && (
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Dhiraj"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-white/10 focus:border-[#00d09c] focus:outline-none rounded-xl text-xs text-white placeholder-slate-500 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-white/10 focus:border-[#00d09c] focus:outline-none rounded-xl text-xs text-white placeholder-slate-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-white/10 focus:border-[#00d09c] focus:outline-none rounded-xl text-xs text-white placeholder-slate-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-[#00d09c] hover:bg-[#00b386] text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>{mode === "login" ? "Sign In & Open Explore" : "Create Account & Open Explore"}</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Notes */}
        <div className="mt-5 pt-4 border-t border-white/10 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Paper trading environment with zero capital risk</span>
        </div>
      </div>
    </div>
  );
}
