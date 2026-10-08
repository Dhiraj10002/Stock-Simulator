"use client";

import { useEffect, useState } from "react";
import { Download, X, Smartphone, ArrowUpRight } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos] = useState(() => {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
  });
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // Check if user already dismissed recently
    const dismissedUntil = localStorage.getItem("pwa_prompt_dismissed_until");
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      return;
    }

    // Check if already in standalone mode (already installed PWA)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as unknown as { standalone: boolean }).standalone));

    if (isStandalone) return;

    // Handler for Chromium beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Wait 3 seconds after page load before showing to avoid UI clutter
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // If iOS and not dismissed, show guide after 6 seconds
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos) {
      iosTimer = setTimeout(() => {
        setShowPrompt(true);
      }, 6000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, [isIos]);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } catch {
      // Ignored
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIosGuide(false);
    // Dismiss for 7 days
    localStorage.setItem("pwa_prompt_dismissed_until", String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  };

  if (!showPrompt) return null;

  return (
    <div
      aria-label="PWA install banner"
      className="fixed z-50 bottom-16 md:bottom-5 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-md animate-fade-in"
    >
      <div className="relative rounded-2xl bg-slate-900/95 dark:bg-[#0b101e]/95 border border-cyan-500/30 p-3.5 sm:p-4 text-white shadow-2xl backdrop-blur-xl ring-1 ring-cyan-500/20">
        <button
          onClick={handleDismiss}
          className="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Dismiss app install banner"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 font-black text-xs shrink-0 shadow-md shadow-cyan-500/20">
            SS
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                Install Stock Simulator
              </h4>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
                PWA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              Add to Home Screen for instant full-screen execution and native app feel.
            </p>
          </div>
        </div>

        {showIosGuide ? (
          <div className="mt-3 pt-2.5 border-t border-white/10 text-xs text-slate-300 space-y-1.5 animate-in fade-in">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-[11px]">
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span>How to install on iOS Safari:</span>
            </div>
            <p className="text-[11px] text-slate-300 pl-5">
              1. Tap the <strong className="text-white">Share</strong> button in Safari bar <span className="text-cyan-400">⎋</span>
              <br />
              2. Scroll down and tap <strong className="text-white">Add to Home Screen ➕</strong>
            </p>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 pt-1">
            <button
              onClick={handleInstallClick}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all cursor-pointer"
            >
              {isIos ? (
                <>
                  <span>Install on iPhone/iPad</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Install App</span>
                </>
              )}
            </button>
            <button
              onClick={handleDismiss}
              className="py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Maybe later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
