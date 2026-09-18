"use client";

import { useState } from "react";
import { Target, ShieldAlert, CheckCircle2, XCircle, Trash2, Crosshair, ArrowRight } from "lucide-react";
import { formatPaise, formatPercent } from "@/lib/format";
import type { GTTTrigger, Quote } from "@/types";

interface GTTTriggersTableProps {
  triggers: GTTTrigger[];
  quotes: Record<string, Quote>;
  onCancelTrigger: (triggerId: string) => void;
}

export default function GTTTriggersTable({
  triggers,
  quotes,
  onCancelTrigger,
}: GTTTriggersTableProps) {
  const [filter, setFilter] = useState<"ACTIVE" | "TRIGGERED" | "ALL">("ACTIVE");

  const activeCount = triggers.filter((t) => t.status === "ACTIVE").length;
  const triggeredCount = triggers.filter(
    (t) => t.status === "TRIGGERED_TARGET" || t.status === "TRIGGERED_SL"
  ).length;

  const filteredTriggers = triggers.filter((t) => {
    if (filter === "ACTIVE") return t.status === "ACTIVE";
    if (filter === "TRIGGERED")
      return t.status === "TRIGGERED_TARGET" || t.status === "TRIGGERED_SL";
    return true;
  });

  if (!triggers || triggers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 min-h-[220px]">
        <Crosshair className="w-10 h-10 text-slate-700 mb-2 stroke-[1.5]" />
        <p className="text-sm font-medium text-slate-400">No Bracket / GTT Triggers</p>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          When you place a trade with <strong>Target</strong> or <strong>Stop-Loss</strong> enabled in the order ticket, automated OCO execution triggers will appear and monitor the market live here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Segment Filter Strip */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-900/30 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter("ACTIVE")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
              filter === "ACTIVE"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active Triggers</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
              {activeCount}
            </span>
          </button>

          <button
            onClick={() => setFilter("TRIGGERED")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
              filter === "TRIGGERED"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <span>Executed / Closed</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
              {triggeredCount}
            </span>
          </button>

          <button
            onClick={() => setFilter("ALL")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
              filter === "ALL"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <span>All History</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
              {triggers.length}
            </span>
          </button>
        </div>

        <div className="text-[10px] text-slate-500 font-mono hidden sm:block">
          One-Cancels-Other (OCO) Automated Square-Off
        </div>
      </div>

      {/* Triggers Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/40">
              <th className="py-2.5 px-4">Instrument</th>
              <th className="py-2.5 px-3">Side & Qty</th>
              <th className="py-2.5 px-3 text-right">Entry Price</th>
              <th className="py-2.5 px-3 text-right">LTP</th>
              <th className="py-2.5 px-3 text-right">Target (Take Profit)</th>
              <th className="py-2.5 px-3 text-right">Stop-Loss</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {filteredTriggers.map((t) => {
              const quote = quotes[t.symbol];
              const ltpPaise = quote?.price_paise ?? t.entry_price_paise;
              const isLong = t.side === "BUY";

              // Target distance
              const targetPaise = t.target_price_paise;
              const targetDiffPaise = targetPaise ? (isLong ? targetPaise - ltpPaise : ltpPaise - targetPaise) : null;
              const targetDiffPct = targetPaise && ltpPaise > 0 ? ((targetPaise - ltpPaise) / ltpPaise) * 100 : null;

              // Stop loss distance
              const slPaise = t.stop_loss_price_paise;
              const slDiffPaise = slPaise ? (isLong ? ltpPaise - slPaise : slPaise - ltpPaise) : null;
              const slDiffPct = slPaise && ltpPaise > 0 ? ((slPaise - ltpPaise) / ltpPaise) * 100 : null;

              return (
                <tr key={t.id} className="hover:bg-slate-900/40 transition-colors group">
                  {/* Instrument */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-100">{t.symbol}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                          t.product === "FNO"
                            ? "bg-purple-950/70 border border-purple-800/40 text-purple-300"
                            : t.product === "INTRADAY"
                            ? "bg-amber-950/70 border border-amber-800/40 text-amber-300"
                            : "bg-cyan-950/70 border border-cyan-800/40 text-cyan-300"
                        }`}
                      >
                        {t.product === "INTRADAY" ? "MIS" : t.product === "DELIVERY" ? "CNC" : "F&O"}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {new Date(t.created_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>

                  {/* Side & Qty */}
                  <td className="py-3 px-3">
                    <div
                      className={`font-bold font-mono text-[11px] ${
                        isLong ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {t.side} {t.quantity}
                    </div>
                  </td>

                  {/* Entry Price */}
                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    {formatPaise(t.entry_price_paise)}
                  </td>

                  {/* Current LTP */}
                  <td className="py-3 px-3 text-right font-mono font-bold text-slate-100">
                    {formatPaise(ltpPaise)}
                  </td>

                  {/* Target Price */}
                  <td className="py-3 px-3 text-right">
                    {targetPaise ? (
                      <div>
                        <div className="font-bold font-mono text-emerald-400">
                          {formatPaise(targetPaise)}
                        </div>
                        {t.status === "ACTIVE" && targetDiffPaise !== null && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            {targetDiffPaise <= 0 ? (
                              <span className="text-emerald-400 font-bold">🎯 At Target</span>
                            ) : (
                              <span>+{formatPaise(targetDiffPaise)} away</span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>

                  {/* Stop-Loss Price */}
                  <td className="py-3 px-3 text-right">
                    {slPaise ? (
                      <div>
                        <div className="font-bold font-mono text-rose-400">
                          {formatPaise(slPaise)}
                        </div>
                        {t.status === "ACTIVE" && slDiffPaise !== null && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            {slDiffPaise <= 0 ? (
                              <span className="text-rose-400 font-bold">🛑 Breached</span>
                            ) : (
                              <span>{formatPaise(slDiffPaise)} buffer</span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3 text-center">
                    {t.status === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ACTIVE
                      </span>
                    ) : t.status === "TRIGGERED_TARGET" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        TARGET HIT
                      </span>
                    ) : t.status === "TRIGGERED_SL" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 border border-rose-500/30 text-rose-300">
                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                        SL HIT
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400">
                        <XCircle className="w-3 h-3" />
                        CANCELLED
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-3 px-4 text-center">
                    {t.status === "ACTIVE" ? (
                      <button
                        onClick={() => onCancelTrigger(t.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/40 transition-colors"
                        title="Cancel Bracket Trigger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
