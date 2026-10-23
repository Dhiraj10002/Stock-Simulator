"use client";
import CopilotMarkdown from "./CopilotMarkdown";
import { COPILOT_TIMEOUT_MS, copilotSourceLabel, isAuditRequest } from "@/lib/copilot";
import { sessionFetch } from "@/lib/api";

import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Award,
  Zap,
  HelpCircle,
  Trash2,
  User,
  Activity,
  TrendingUp,
  CheckCircle2,
  X,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import type { TradeCritiqueResponse } from "@/types";

interface TradeCopilotProps {
  token: string;
  apiUrl: string;
  initialQuery?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "copilot";
  content: string;
  timestamp: string;
  source?: string;
  fallbackReason?: string;
}

const PROMPT_CHIPS = [
  "Audit my trading discipline & errors",
  "Analyze my portfolio risk right now",
  "How do I hedge my open positions?",
  "What happens during 15:20 MIS square-off?",
  "How do F&O contracts settle on their expiry date?",
  "Explain Black-Scholes Greeks (Delta & Theta)",
  "How should I manage margin leverage?",
];

export default function TradeCopilot({ token, apiUrl, initialQuery }: TradeCopilotProps) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [critique, setCritique] = useState<TradeCritiqueResponse | null>(null);
  const [critiqueError, setCritiqueError] = useState<string | null>(null);
  const [critiquing, setCritiquing] = useState(false);
  const [showCritique, setShowCritique] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome-1",
      role: "copilot",
      content:
        "Welcome to the **AI Trade Copilot**.\n\nAsk about paper-trading mechanics or request a snapshot of your account risk. Account figures use stored marks and may be stale. **Audit My Trades** reviews available records using simulator heuristics; it does not continuously monitor your account.",
      timestamp: "Now",
      source: "system",
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(1);
  const initialQueryHandled = useRef(false);
  const auditInFlight = useRef(false);

  // Run Trade Post-Mortem Critique
  const handleCritique = async () => {
    if (auditInFlight.current) return false;
    if (!token) {
      setCritique(null);
      setCritiqueError("Please log in to generate an AI trade critique for your account.");
      setShowCritique(true);
      return false;
    }

    auditInFlight.current = true;
    setCritiquing(true);
    setCritiqueError(null);
    try {
      const res = await sessionFetch(`${apiUrl}/ai/trade-critique`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(COPILOT_TIMEOUT_MS),
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setCritique(data.data);
        setShowCritique(true);
        return true;
      } else {
        setCritique(null);
        setCritiqueError(data.message || "Failed to generate trade critique. Ensure you have closed trades in your account.");
        setShowCritique(true);
      }
    } catch (err: unknown) {
      setCritique(null);
      setCritiqueError(err instanceof Error ? err.message : "Network error contacting critique desk.");
      setShowCritique(true);
    } finally {
      auditInFlight.current = false;
      setCritiquing(false);
    }
    return false;
  };

  // Ask Mentor
  const handleAsk = async (queryText?: string) => {
    const q = (queryText || question).trim();
    if (!q || asking || critiquing) return;

    const currentId = ++msgIdRef.current;
    const userMsgId = `u-${currentId}`;
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Append user message immediately
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: q, timestamp: timeStr },
    ]);
    setQuestion("");
    setAsking(true);

    try {
      if (isAuditRequest(q)) {
        const completed = await handleCritique();
        setMessages((prev) => [...prev, {
          id: `c-${++msgIdRef.current}`, role: "copilot", source: "system",
          content: completed ? "Your audit scorecard is shown above. It summarizes available records using simulator heuristics." : "The audit could not be completed. See the audit notice above and retry.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }]);
        return;
      }
      if (!token) throw new Error("Please sign in to ask the Copilot about your account.");
      const res = await sessionFetch(`${apiUrl}/ai/analyze-trade`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: q }), signal: AbortSignal.timeout(COPILOT_TIMEOUT_MS),
      });
      const data = await res.json();
      if (!res.ok || !data.success || typeof data.data?.answer !== "string") {
        throw new Error("The Copilot could not answer this request. Please retry.");
      }
      setMessages((prev) => [...prev, {
        id: `c-${++msgIdRef.current}`, role: "copilot", content: data.data.answer,
        source: data.data.source, fallbackReason: data.data.fallback_reason,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `c-${++msgIdRef.current}`, role: "copilot", source: "system",
        content: token ? "Copilot is temporarily unreachable. Your account was not analyzed. Please retry; you can inspect holdings and quote timestamps in Portfolio." : "Please sign in to use account-aware chat and trade audits.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }]);
    } finally {
      setAsking(false);
    }
  };

  const handleAskRef = useRef(handleAsk);
  useEffect(() => {
    handleAskRef.current = handleAsk;
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  useEffect(() => {
    if (initialQuery && !initialQueryHandled.current) {
      initialQueryHandled.current = true;
      void handleAskRef.current(initialQuery);
    }
  }, [initialQuery]);

  const handleClearThread = () => {
    setMessages([
      {
        id: "welcome-reset",
        role: "copilot",
        source: "system",
        content: "Conversation thread refreshed. Select a quick practice topic below or ask about specific risk scenarios.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const handleToggleAudit = () => {
    if (showCritique) {
      setShowCritique(false);
    } else {
      setShowCritique(true);
      if (!critique) {
        void handleCritique();
      }
    }
  };

  const score = critique?.discipline_score ?? 0;
  const rating = critique?.metrics.total_trades_evaluated === 0 ? "INSUFFICIENT HISTORY" : critique?.risk_rating ?? "NEUTRAL";
  const grade = critique?.metrics.total_trades_evaluated === 0 ? "N/A" : critique?.grade ?? "N/A";

  const getScoreBadge = () => {
    if (critique?.metrics.total_trades_evaluated === 0) return "bg-slate-50 dark:bg-slate-900 border-slate-300 text-slate-600";
    if (score >= 80)
      return "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-300";
    if (score >= 55)
      return "bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-300";
    return "bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700/60 text-rose-800 dark:text-rose-300";
  };

  return (
    <div className="space-y-6 text-xs max-w-5xl mx-auto">
      {/* Top Banner: One-Click Critique Trigger */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-50 via-white to-cyan-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm transition-all">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-md shadow-cyan-500/25 shrink-0 text-white">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-slate-100 tracking-tight">
                AI Trade Copilot & Simulator Risk Officer
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Active Monitor
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Reviews stored account figures and sampled order activity using educational heuristics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleToggleAudit}
            disabled={critiquing}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm border bg-gradient-to-r from-cyan-50 via-sky-50 to-blue-50 dark:from-cyan-950/60 dark:via-slate-900 dark:to-blue-950/60 hover:from-cyan-100 hover:to-blue-100 dark:hover:from-cyan-900/60 dark:hover:to-blue-900/60 border-cyan-300 dark:border-cyan-700 text-cyan-950 dark:text-cyan-200 shadow-cyan-500/10 hover:shadow hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>
              {critiquing
                ? "Auditing Trades…"
                : showCritique
                ? "Hide Audit"
                : "Audit My Trades"}
            </span>
          </button>
        </div>
      </div>

      {/* Post-Mortem Dashboard Scorecard (Compact & Sleek) */}
      {critique && showCritique && (
        <div className="space-y-3 p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm animate-fade-in">
          {/* Header with quick close X button */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              Simulator Audit & Behavioral Scorecard
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Sampled {critique.metrics.total_trades_evaluated} orders · stored account snapshot
              </span>
              <button
                onClick={() => setShowCritique(false)}
                title="Collapse Scorecard"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 5 Compact Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {/* Discipline Score & Grade */}
            <div className={`p-2.5 rounded-xl border flex flex-col justify-between col-span-2 sm:col-span-1 shadow-sm ${getScoreBadge()}`}>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                <span>Discipline</span>
                <span className="px-1.5 py-0.2 rounded font-black bg-current/10 border border-current/20">
                  {grade}
                </span>
              </div>
              <div className="flex items-baseline gap-1 my-0.5">
                <span className="text-2xl font-black">{critique.metrics.total_trades_evaluated === 0 ? "N/A" : score}</span>
                <span className="text-[10px] opacity-75 font-semibold">/ 100</span>
              </div>
              <div className="text-[10px] font-bold flex items-center gap-1">
                <Award className="w-3 h-3" />
                <span>{rating}</span>
              </div>
            </div>

            {/* Win Rate */}
            <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                Positive realized positions
              </span>
              <span
                className={`text-lg font-bold my-0.5 ${
                  critique.metrics.win_rate >= 50
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {critique.metrics.realized_positions_evaluated ? `${critique.metrics.win_rate.toFixed(1)}%` : "N/A"}
              </span>
              <span className="text-[9px] text-slate-400 font-mono truncate">
                Cumulative position P&L: {formatPaise(critique.metrics.realized_pnl_paise ?? 0)}
              </span>
            </div>

            {/* Concentration Risk */}
            <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Concentration</span>
              <span
                className={`text-lg font-bold my-0.5 ${
                  critique.metrics.concentration_risk === "HIGH"
                    ? "text-rose-600 dark:text-rose-400"
                    : critique.metrics.concentration_risk === "MODERATE"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {critique.metrics.concentration_risk}
              </span>
              <span className="text-[9px] text-slate-400 truncate">Single asset exposure</span>
            </div>

            {/* Leverage Risk */}
            <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Margin Leverage</span>
              <span
                className={`text-lg font-bold my-0.5 ${
                  critique.metrics.leverage_risk === "HIGH"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {critique.metrics.leverage_risk}
              </span>
              <span className="text-[9px] text-slate-400 truncate">5x MIS intraday</span>
            </div>

            {/* Limit Order Usage */}
            <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between col-span-2 sm:col-span-1 shadow-sm">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Limit Order Disc.</span>
              <span className="text-lg font-bold my-0.5 text-cyan-600 dark:text-cyan-400">
                {critique.metrics.limit_order_usage_pct.toFixed(0)}%
              </span>
              <span className="text-[9px] text-slate-400 truncate">
                {critique.metrics.total_trades_evaluated} audited
              </span>
            </div>
          </div>

          {/* Compact Behavioral Flags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {critique.behavioral_flags.map((flag, idx) => (
              <div
                key={idx}
                className={`px-3 py-2 rounded-xl border flex items-center gap-2.5 text-[11px] shadow-sm ${
                  flag.type === "CRITICAL"
                    ? "bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/60 text-rose-900 dark:text-rose-200"
                    : flag.type === "WARNING"
                    ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200"
                    : "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                }`}
              >
                {flag.type === "CRITICAL" ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                ) : flag.type === "WARNING" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="font-bold mr-1.5">{flag.title}:</span>
                  <span className="opacity-80 text-[10px]">{flag.description}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Compact Executive Audit Takeaway */}
          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-700 dark:text-slate-300 shadow-sm flex flex-col items-start gap-2 leading-relaxed">
            <div className="flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div><div className="mb-2">{copilotSourceLabel(critique.source, critique.fallback_reason)} · Simulator heuristic score</div><CopilotMarkdown text={critique.critique || "Trade audit completed."} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Error / Information notice when critique fails */}
      {critiqueError && showCritique && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-2xl flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{critiqueError}</span>
          </div>
          <button
            onClick={() => setShowCritique(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Conversational Multi-Turn Chat Area */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/60 dark:bg-slate-950/70 flex flex-col h-[460px] overflow-hidden shadow-md">
        {/* Chat Header Bar */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-200 font-bold">
            <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <span>Interactive Risk & Strategy Chat Desk</span>
            <span className="text-[10px] text-slate-500 font-mono">({messages.length} messages)</span>
          </div>

          <button
            onClick={handleClearThread}
            title="Clear Chat History"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "copilot" && (
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 text-white shadow-sm shadow-cyan-500/20">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tr-sm shadow-md shadow-cyan-500/10 font-medium"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm shadow-sm"
                }`}
              >
                {m.role === "copilot" ? <>
                  {m.source !== "system" && <div className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">{copilotSourceLabel(m.source, m.fallbackReason)}</div>}
                  <CopilotMarkdown text={m.content} />
                </> : m.content}
                <div
                  className={`text-[9px] mt-1.5 font-mono ${
                    m.role === "user" ? "text-cyan-200/80 text-right" : "text-slate-400 text-left"
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>

              {m.role === "user" && (
                <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5 text-slate-200 shadow-sm">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {asking && (
            <div className="flex gap-3 justify-start animate-pulse">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shrink-0 text-white">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-cyan-600 dark:text-cyan-400 text-xs flex items-center gap-2 shadow-sm">
                <Zap className="w-3.5 h-3.5 animate-spin" />
                <span>Copilot is auditing risk models and formulating mentor response…</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Strategy Prompt Chips */}
        <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/70 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0 flex items-center gap-1 pl-1">
            <HelpCircle className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            Quick Prompts:
          </span>
          {PROMPT_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => void handleAsk(chip)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-300 hover:border-cyan-400 dark:hover:border-cyan-600 transition-all shadow-sm shrink-0 hover:scale-[1.02]"
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
          className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex gap-2.5"
        >
          <input
            type="text"
            placeholder="Ask Copilot about portfolio risk, hedging setups, or execution mechanics…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={asking || critiquing}
            className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 text-xs shadow-inner"
          />
          <button
            type="submit"
            disabled={asking || critiquing || !question.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-40 text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{asking ? "Thinking…" : "Send"}</span>
          </button>
        </form>

        {/* Simulator Educational Compliance Disclaimer */}
        <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span>
              <strong>Educational Simulator Mentor:</strong> Analysis and trade audits are strictly for educational practice. Does not provide SEBI-registered financial advice, stock recommendations, or return guarantees.
            </span>
          </div>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
            Paper Trading Only
          </span>
        </div>
      </div>
    </div>
  );
}
