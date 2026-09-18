"use client";

import { useState, useRef, useEffect } from "react";
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
  Trash2,
  User,
  Activity,
} from "lucide-react";
import type { TradeCritiqueResponse } from "@/types";

interface TradeCopilotProps {
  token: string;
  apiUrl: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "copilot";
  content: string;
  timestamp: string;
}

const PROMPT_CHIPS = [
  "Analyze my portfolio risk right now",
  "How do I hedge my open positions?",
  "What happens during 15:20 MIS square-off?",
  "How do F&O options settle on Thursday expiry?",
  "Explain Black-Scholes Greeks (Delta & Theta)",
  "How should I manage margin leverage?",
];

export default function TradeCopilot({ token, apiUrl }: TradeCopilotProps) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [critique, setCritique] = useState<TradeCritiqueResponse | null>(null);
  const [critiquing, setCritiquing] = useState(false);
  const [showCritique, setShowCritique] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      role: "copilot",
      content:
        "👋 Welcome to the **AI Trade Copilot & Institutional Risk Desk**.\n\nI monitor your position sizing, margin leverage, and execution discipline in real time. Ask me anything about risk management, portfolio hedging, MIS square-off rules, or click **Critique My Trading** above to audit your trade history.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  // Ask Mentor
  const handleAsk = async (queryText?: string) => {
    const q = (queryText || question).trim();
    if (!q || asking) return;

    const userMsgId = "u-" + Date.now();
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Append user message immediately
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: q, timestamp: timeStr },
    ]);
    setQuestion("");
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
      const reply =
        res.ok && data.success && data.data?.answer
          ? data.data.answer
          : res.status === 401
          ? "⚠️ Session expired or unauthorized. Please refresh the page or sign in again."
          : data.message || "Unable to generate mentor response.";

      setMessages((prev) => [
        ...prev,
        {
          id: "c-" + Date.now(),
          role: "copilot",
          content: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: "c-" + Date.now(),
          role: "copilot",
          content: "⚠️ Unable to reach AI Mentor service. Please ensure backend server is active.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
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
        setShowCritique(true);
      }
    } catch {
      // ignore
    } finally {
      setCritiquing(false);
    }
  };

  const handleClearThread = () => {
    setMessages([
      {
        id: "welcome-reset",
        role: "copilot",
        content: "Conversation history cleared. Ask a new question or pick a quick practice topic below.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
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
      {/* Top Banner: One-Click Critique Trigger */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              AI Trade Copilot & Institutional Risk Officer
            </h3>
            <p className="text-[11px] text-slate-400">
              Evaluates emotional bias, margin safety, portfolio concentration, and execution discipline.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {critique && (
            <button
              onClick={() => setShowCritique(!showCritique)}
              className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all"
            >
              {showCritique ? "Hide Audit" : "Show Audit"}
            </button>
          )}

          <button
            onClick={handleCritique}
            disabled={critiquing}
            className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 text-xs shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{critiquing ? "Auditing Trades…" : "Critique My Trading"}</span>
          </button>
        </div>
      </div>

      {/* Post-Mortem Dashboard Scorecard */}
      {critique && showCritique && (
        <div className="space-y-3.5 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            {/* Discipline Score */}
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
              <span
                className={`text-base font-bold my-1 ${
                  critique.metrics.concentration_risk === "HIGH" ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {critique.metrics.concentration_risk}
              </span>
              <span className="text-[10px] text-slate-500">Max single asset exposure</span>
            </div>

            {/* Leverage Risk */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Margin Leverage</span>
              <span
                className={`text-base font-bold my-1 ${
                  critique.metrics.leverage_risk === "HIGH" ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {critique.metrics.leverage_risk}
              </span>
              <span className="text-[10px] text-slate-500">Intraday cash utilization</span>
            </div>

            {/* Limit Order Usage */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Limit Order Discipline</span>
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

      {/* Conversational Multi-Turn Chat Area */}
      <div className="border border-slate-800 rounded-2xl bg-slate-900/50 flex flex-col h-[380px] overflow-hidden shadow-inner">
        {/* Chat Header Bar */}
        <div className="px-3.5 py-2 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-semibold">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Interactive Copilot Conversation</span>
            <span className="text-[10px] text-slate-500 font-mono">({messages.length} messages)</span>
          </div>

          <button
            onClick={handleClearThread}
            title="Clear Chat History"
            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-3.5 overflow-y-auto space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "copilot" && (
                <div className="w-6 h-6 rounded-lg bg-cyan-600/30 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-cyan-400" />
                </div>
              )}

              <div
                className={`max-w-[82%] p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-cyan-600 text-white rounded-tr-sm shadow-md shadow-cyan-600/20"
                    : "bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-tl-sm"
                }`}
              >
                {m.content}
                <div
                  className={`text-[9px] mt-1 font-mono ${
                    m.role === "user" ? "text-cyan-200/70 text-right" : "text-slate-500 text-left"
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>

              {m.role === "user" && (
                <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-slate-300" />
                </div>
              )}
            </div>
          ))}

          {asking && (
            <div className="flex gap-2.5 justify-start animate-pulse">
              <div className="w-6 h-6 rounded-lg bg-cyan-600/30 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/40 text-cyan-300 text-xs flex items-center gap-2">
                <Zap className="w-3 h-3 animate-spin" />
                <span>Copilot is analyzing risk and formulating response…</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Strategy Prompt Chips */}
        <div className="p-2 border-t border-slate-800/60 bg-slate-950/40 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] font-semibold text-slate-500 shrink-0 flex items-center gap-1 pl-1">
            <HelpCircle className="w-3 h-3 text-cyan-400" />
            Quick Prompts:
          </span>
          {PROMPT_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => void handleAsk(chip)}
              className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-all shrink-0"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Interactive Chat Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAsk();
          }}
          className="p-2.5 border-t border-slate-800/80 bg-slate-950 flex gap-2"
        >
          <input
            type="text"
            placeholder="Ask Copilot about portfolio risk, hedging setups, or execution mechanics…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={asking}
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 text-xs"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-40 text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{asking ? "Thinking…" : "Send"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
