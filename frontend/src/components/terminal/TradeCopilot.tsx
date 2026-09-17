"use client";

import { useState } from "react";
import {
  Bot,
  Send,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Award,
  Zap,
  HelpCircle,
} from "lucide-react";
import type { TradeCritiqueResponse } from "@/types";

interface TradeCopilotProps {
  token: string;
  apiUrl: string;
}

const PROMPT_CHIPS = [
  "What happens during 15:20 MIS square-off?",
  "How do F&O options settle on Thursday expiry?",
  "How should I manage margin leverage?",
  "Why is CNC short-selling forbidden?",
];

export default function TradeCopilot({ token, apiUrl }: TradeCopilotProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  const [critique, setCritique] = useState<TradeCritiqueResponse | null>(null);
  const [critiquing, setCritiquing] = useState(false);

  // Ask Mentor
  const handleAsk = async (queryText?: string) => {
    const q = queryText || question;
    if (!q.trim()) return;
    setAsking(true);

    try {
      const res = await fetch(`${apiUrl}/ai/analyze-trade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 401) {
          setAnswer("⚠️ Session expired or unauthorized. Please refresh the page or sign in again to activate your AI Copilot session.");
        } else {
          setAnswer(data.message || "Unable to generate mentor response.");
        }
      } else {
        setAnswer(data.data?.answer || "No response received.");
      }
    } catch {
      setAnswer("Unable to reach AI Mentor service. Please check backend connection.");
    } finally {
      setAsking(false);
    }
  };

  // Run Trade Post-Mortem Critique
  const handleCritique = async () => {
    setCritiquing(true);
    try {
      const res = await fetch(`${apiUrl}/ai/trade-critique`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCritique(data.data);
      }
    } catch {
      // ignore errors
    } finally {
      setCritiquing(false);
    }
  };

  const score = critique?.discipline_score ?? 100;
  const rating = critique?.risk_rating ?? "EXCELLENT";

  const getScoreBadge = () => {
    if (score >= 80) return "bg-emerald-950/80 border-emerald-500/40 text-emerald-300";
    if (score >= 55) return "bg-amber-950/80 border-amber-500/40 text-amber-300";
    return "bg-rose-950/80 border-rose-500/40 text-rose-300";
  };

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto text-xs">
      {/* Action Header: One-Click Critique Trigger */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              AI Trade Copilot & Risk Officer
            </h3>
            <p className="text-[11px] text-slate-400">
              Evaluates emotional bias, margin safety, and trade discipline in real time.
            </p>
          </div>
        </div>

        <button
          onClick={handleCritique}
          disabled={critiquing}
          className="px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 text-xs shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{critiquing ? "Evaluating Trades…" : "Critique My Trading"}</span>
        </button>
      </div>

      {/* Post-Mortem Dashboard (Rendered once critique is triggered) */}
      {critique && (
        <div className="space-y-3.5 animate-fade-in">
          {/* Top Scorecard */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            {/* Discipline Score Gauge */}
            <div className={`p-3 rounded-xl border flex flex-col justify-between ${getScoreBadge()}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Discipline Score
              </span>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-3xl font-black">{score}</span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
              <div className="text-[10px] font-semibold flex items-center gap-1">
                <Award className="w-3 h-3" />
                {rating}
              </div>
            </div>

            {/* Concentration Risk */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Concentration Risk</span>
              <span className={`text-base font-bold my-1 ${
                critique.metrics.concentration_risk === "HIGH" ? "text-rose-400" : "text-emerald-400"
              }`}>
                {critique.metrics.concentration_risk}
              </span>
              <span className="text-[10px] text-slate-500">Max single asset exposure</span>
            </div>

            {/* Leverage Risk */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Margin Leverage Risk</span>
              <span className={`text-base font-bold my-1 ${
                critique.metrics.leverage_risk === "HIGH" ? "text-rose-400" : "text-emerald-400"
              }`}>
                {critique.metrics.leverage_risk}
              </span>
              <span className="text-[10px] text-slate-500">Intraday cash utilization</span>
            </div>

            {/* Limit Order Usage */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Limit Order Usage</span>
              <span className="text-base font-bold my-1 text-cyan-400">
                {critique.metrics.limit_order_usage_pct.toFixed(0)}%
              </span>
              <span className="text-[10px] text-slate-500">{critique.metrics.total_trades_evaluated} orders evaluated</span>
            </div>
          </div>

          {/* Behavioral Flags */}
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Behavioral Risk Alerts
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {critique.behavioral_flags.map((flag, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                    flag.type === "CRITICAL"
                      ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                      : flag.type === "WARNING"
                      ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                      : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  }`}
                >
                  {flag.type === "CRITICAL" ? (
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  ) : flag.type === "WARNING" ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <strong className="block text-xs font-bold text-slate-100">{flag.title}</strong>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{flag.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Structured Post-Mortem Narrative */}
          <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-slate-300 whitespace-pre-wrap leading-relaxed">
            {critique.critique}
          </div>
        </div>
      )}

      {/* Suggested Strategy Prompt Chips */}
      <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-cyan-400" />
          Quick Practice Topics
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuestion(chip);
                void handleAsk(chip);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-all text-left"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Chat Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleAsk();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          placeholder="Ask AI Copilot about risk management, margin requirements, or technical setups…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
        />
        <button
          type="submit"
          disabled={asking}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{asking ? "Analyzing…" : "Ask"}</span>
        </button>
      </form>

      {/* Answer Output Bubble */}
      {answer && (
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 leading-relaxed whitespace-pre-wrap">
          <div className="flex items-center gap-1.5 font-bold text-cyan-400 mb-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            AI Trade Copilot Response:
          </div>
          {answer}
        </div>
      )}
    </div>
  );
}
