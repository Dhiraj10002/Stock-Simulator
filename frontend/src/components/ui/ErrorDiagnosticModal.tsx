"use client";

import { useState } from "react";
import { AlertCircle, Copy, Check, X, ShieldAlert } from "lucide-react";
import type { ApiDiagnostic } from "@/lib/api";

interface ErrorDiagnosticModalProps {
  diagnostic: ApiDiagnostic | null;
  onClose: () => void;
  title?: string;
}

export default function ErrorDiagnosticModal({
  diagnostic,
  onClose,
  title = "Operation Diagnostic",
}: ErrorDiagnosticModalProps) {
  const [copied, setCopied] = useState(false);

  if (!diagnostic) return null;

  const getStatusColor = (status: number) => {
    if (status === 404) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    if (status >= 500) return "bg-red-500/10 text-red-400 border-red-500/30";
    return "bg-rose-500/10 text-rose-400 border-rose-500/30";
  };

  const getDiagnosticExplanation = (status: number, code?: string) => {
    switch (code) {
      case "POSITION_NOT_FOUND":
        return "The requested position could not be found in your active account records. It may have already been closed or settled.";
      case "POSITION_ALREADY_CLOSED":
        return "This position is already completely flat (0 quantity) and cannot be squared off again.";
      case "ORDER_NOT_FOUND":
        return "The requested order ID does not exist in the active order book.";
      case "QUOTE_NOT_FOUND":
        return "Live market quote was not found for this instrument. Verify whether market data subscriptions are active.";
      case "QUOTE_STALE":
        return "Live quote timestamp is older than allowable execution tolerance. Execution was rejected to protect against slippage.";
      case "QUOTE_INELIGIBLE":
        return "The current market data source is not eligible for LIVE order execution.";
      case "MARKET_DATA_UNAVAILABLE":
        return "Market data feed or Redis quote cache is currently unavailable. Retry when connection restores.";
      case "INSUFFICIENT_HOLDINGS":
        return "Delivery holding quantity is insufficient for this exit order. Short-selling delivery shares without holdings is prohibited.";
      case "INSUFFICIENT_FUNDS":
        return "Available wallet cash or margin balance is insufficient for this order.";
      case "MARKET_CLOSED":
        return "Market is currently closed for this segment.";
      case "EXPIRED_CONTRACT":
        return "Contract has passed its expiry date and cannot accept new trading orders.";
      case "LIMIT_PRICE_NOT_MET":
        return "Current market price does not satisfy the specified limit condition.";
      default:
        if (status === 404) {
          return "Resource not found (HTTP 404). Check whether instrument or position exists.";
        }
        return "Execution rejected by backend risk/validation engine.";
    }
  };

  const handleCopy = () => {
    const diagnosticJson = JSON.stringify(diagnostic, null, 2);
    navigator.clipboard.writeText(diagnosticJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0d1117] border border-red-500/20 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-red-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              <p className="text-xs text-gray-400">Stable diagnostic details & error tracing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Status & Code Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md border ${getStatusColor(
                diagnostic.status
              )}`}
            >
              HTTP {diagnostic.status}
            </span>
            {diagnostic.code && (
              <span className="px-2.5 py-1 text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">
                [{diagnostic.code}]
              </span>
            )}
            {diagnostic.endpoint && (
              <span className="px-2.5 py-1 text-xs font-mono text-gray-400 bg-gray-900 border border-gray-800 rounded-md">
                {diagnostic.endpoint}
              </span>
            )}
          </div>

          {/* Message */}
          <div className="p-3.5 bg-gray-900/80 border border-gray-800 rounded-lg">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">{diagnostic.message}</p>
                <p className="text-xs text-gray-400">
                  {getDiagnosticExplanation(diagnostic.status, diagnostic.code)}
                </p>
              </div>
            </div>
          </div>

          {/* Diagnostic Metadata Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {diagnostic.requestId && (
              <div className="col-span-2 p-2 bg-gray-950/60 border border-gray-800 rounded flex items-center justify-between">
                <span className="text-gray-500">Request ID:</span>
                <span className="text-indigo-400 truncate max-w-[280px]">
                  {diagnostic.requestId}
                </span>
              </div>
            )}
            <div className="p-2 bg-gray-950/60 border border-gray-800 rounded">
              <span className="text-gray-500 block">Timestamp:</span>
              <span className="text-gray-300">
                {new Date(diagnostic.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="p-2 bg-gray-950/60 border border-gray-800 rounded">
              <span className="text-gray-500 block">Status Code:</span>
              <span className="text-gray-300 font-bold">{diagnostic.status}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-gray-900/40">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied Diagnostic JSON</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                <span>Copy Diagnostic Info</span>
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}
