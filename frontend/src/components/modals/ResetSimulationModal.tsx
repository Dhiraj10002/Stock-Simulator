"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  RotateCcw,
  AlertTriangle,
  X,
  CheckCircle2,
  Wallet,
  Layers,
  ClipboardList,
  ShieldAlert,
} from "lucide-react";
import { apiFetch, getAuthToken } from "@/lib/api";

interface ResetSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ResetSimulationModal({
  isOpen,
  onClose,
  onSuccess,
}: ResetSimulationModalProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  if (!isOpen || !mounted) return null;

  const handleReset = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (token) {
        await apiFetch<null>("/simulation/reset", {
          method: "POST",
        });
      }

      // Invalidate all related caches across the application
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["trades"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["risk-overview"] }),
      ]);

      setSuccess(true);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset simulation account.");
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/70 dark:bg-amber-950/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Reset Virtual Account
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Restore initial seed capital and clear positions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {success ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
              <span className="font-bold text-sm">Account Reset Completed!</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Wallet restored to ₹10,00,000.00 baseline capital.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                  {error}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Permanent Simulation Reset Warning</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  This action will atomically start a clean simulation run. Your previous session metrics will be archived in the audit log.
                </p>
              </div>

              {/* Consequence Checklist */}
              <div className="space-y-2 pt-1 text-slate-700 dark:text-slate-300 font-medium">
                <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block">
                  The following actions will execute:
                </span>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Wallet className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                    <span>Margin cash balance reset to <strong>₹10,00,000.00</strong> (unblocks all margin)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>All <strong>Pending & Open Orders</strong> immediately cancelled</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Layers className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <span>All <strong>Demat (CNC) and Intraday (MIS) positions</strong> cleared</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <span>Audit snapshot saved into <code>simulation_resets</code> database table</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold transition-all cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  <span>{loading ? "Resetting…" : "Confirm Reset"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
