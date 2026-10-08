"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Download,
  Copy,
  Check,
  Share2,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import {
  drawPnlCard,
  downloadPnlCard,
  copyPnlCardToClipboard,
  getTwitterShareUrl,
  getWhatsAppShareUrl,
  getLinkedInShareUrl,
  type PnlCardData,
  type PnlCardTheme,
} from "@/lib/pnlCardGenerator";
import { useToast } from "@/components/ui/ToastProvider";

export interface SharePnlCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PnlCardData;
}

export default function SharePnlCardModal({
  isOpen,
  onClose,
  data,
}: SharePnlCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { addToast } = useToast();

  const [theme, setTheme] = useState<PnlCardTheme>("institutional");
  const [hideRupeeAmount, setHideRupeeAmount] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Redraw canvas whenever options change
  const renderCard = useCallback(() => {
    if (!canvasRef.current) return;
    drawPnlCard(canvasRef.current, data, {
      theme,
      hideRupeeAmount,
    });
  }, [data, theme, hideRupeeAmount]);

  useEffect(() => {
    if (isOpen) {
      // Delay slightly for canvas DOM mount
      const t = setTimeout(renderCard, 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, renderCard]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    setIsExporting(true);
    const ok = await copyPnlCardToClipboard(canvasRef.current);
    setIsExporting(false);
    if (ok) {
      setCopied(true);
      addToast("Image Copied!", "P&L card image copied to clipboard. Ready to paste in chat or tweet.", "success");
      setTimeout(() => setCopied(false), 3000);
    } else {
      addToast("Copy Failed", "Clipboard image permissions blocked. Try downloading PNG instead.", "error");
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const dateFormatted = new Date().toISOString().slice(0, 10);
    downloadPnlCard(canvasRef.current, `stocksim_pnl_${dateFormatted}.png`);
    addToast("Image Downloaded", "High-resolution P&L social card saved to downloads.", "success");
  };

  const handleNativeShare = async () => {
    if (!canvasRef.current || typeof navigator.share !== "function") return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "stocksim_pnl.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "Stock Simulator Verified P&L",
            text: `Locked in ${data.roiPct >= 0 ? "+" : ""}${data.roiPct.toFixed(2)}% ROI on Stock Simulator!`,
            files: [file],
          });
        }
      });
    } catch {
      // User cancelled share
    }
  };

  const isProfit = data.totalPnlPaise >= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
      style={{ backgroundColor: "rgba(2, 6, 17, 0.88)", backdropFilter: "blur(12px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl rounded-3xl bg-[#090d1a] border border-white/[0.12] shadow-2xl overflow-hidden text-slate-100 flex flex-col my-auto max-h-[96vh]">
        {/* Top Gradient Header Flare */}
        <div
          className={`h-1.5 w-full bg-gradient-to-r ${
            isProfit
              ? "from-emerald-500 via-teal-400 to-cyan-500"
              : "from-rose-500 via-pink-500 to-purple-500"
          }`}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl border ${
                isProfit
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
            >
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Verified P&L Social Card
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  1200×675 HD
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                1-click shareable proof of your simulated trading performance.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* Real-time Canvas Card Preview */}
          <div className="relative rounded-2xl overflow-hidden border border-white/[0.12] bg-[#03060c] shadow-xl group">
            <canvas
              ref={canvasRef}
              className="w-full h-auto block select-none pointer-events-none"
              style={{ maxHeight: "380px", objectFit: "contain" }}
            />
          </div>

          {/* Customization Options Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            {/* Theme Picker */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                Visual Aesthetic
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("institutional")}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    theme === "institutional"
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                      : "bg-white/[0.04] text-slate-400 border-transparent hover:text-slate-200"
                  }`}
                >
                  Obsidian
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("cyber")}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    theme === "cyber"
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                      : "bg-white/[0.04] text-slate-400 border-transparent hover:text-slate-200"
                  }`}
                >
                  Cyber Grid
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("aurora")}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    theme === "aurora"
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                      : "bg-white/[0.04] text-slate-400 border-transparent hover:text-slate-200"
                  }`}
                >
                  Aurora
                </button>
              </div>
            </div>

            {/* Privacy Mask Toggle */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-200 block">
                  Mask Rupee Amount
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Display % ROI only (hides absolute ₹ figures)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHideRupeeAmount(!hideRupeeAmount)}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  hideRupeeAmount
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                    : "bg-white/[0.05] border-white/10 text-slate-400 hover:text-white"
                }`}
                title={hideRupeeAmount ? "Show Rupee Amount" : "Hide Rupee Amount"}
              >
                {hideRupeeAmount ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Social Share Intent Buttons */}
          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
              Direct Social Share
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Twitter / X */}
              <a
                href={getTwitterShareUrl(data)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span>Post on X</span>
                <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100" />
              </a>

              {/* WhatsApp */}
              <a
                href={getWhatsAppShareUrl(data)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold text-emerald-400 transition-all cursor-pointer group"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span>WhatsApp</span>
                <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100" />
              </a>

              {/* LinkedIn */}
              <a
                href={getLinkedInShareUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-xs font-bold text-blue-400 transition-all cursor-pointer group"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                </svg>
                <span>LinkedIn</span>
                <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100" />
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6 border-t border-white/[0.08] bg-slate-950/60">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>High-DPI PNG rendering</span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-bold text-white transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              disabled={isExporting}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-xs ${
                copied
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                  : "bg-white/[0.06] hover:bg-white/[0.1] border-white/10 text-white"
              }`}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Image Copied!" : "Copy Image"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-extrabold shadow-md shadow-cyan-600/25 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download Card</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
