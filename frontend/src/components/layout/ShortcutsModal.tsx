"use client";

import React, { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";
import {
  Keyboard,
  X,
  TrendingUp,
  TrendingDown,
  Layers,
  FileText,
  BarChart2,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  CheckCircle2,
} from "lucide-react";

interface ShortcutItem {
  keys: string[];
  description: string;
  icon?: typeof TrendingUp;
  badgeColor?: string;
}

interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    category: "Terminal Order Execution",
    items: [
      {
        keys: ["B"],
        description: "Open / Focus BUY ticket for active counter",
        icon: TrendingUp,
        badgeColor: "bg-emerald-950/60 text-emerald-400 border-emerald-500/30",
      },
      {
        keys: ["S"],
        description: "Open / Focus SELL ticket for active counter",
        icon: TrendingDown,
        badgeColor: "bg-rose-950/60 text-rose-400 border-rose-500/30",
      },
      {
        keys: ["C", "Esc"],
        description: "Cancel order / close modal / reset ticket",
        icon: X,
        badgeColor: "bg-slate-800 text-slate-300 border-slate-700",
      },
      {
        keys: ["Enter"],
        description: "Confirm and dispatch order execution",
        icon: CheckCircle2,
        badgeColor: "bg-cyan-950/60 text-cyan-300 border-cyan-500/30",
      },
    ],
  },
  {
    category: "Chart Timeframes & Analysis",
    items: [
      {
        keys: ["1", "–", "5"],
        description: "Switch timeframe (1m, 5m, 15m, 1H, 1D)",
        icon: BarChart2,
        badgeColor: "bg-blue-950/60 text-blue-300 border-blue-500/30",
      },
      {
        keys: ["O"],
        description: "Toggle F&O Option Chain & Greeks",
        icon: Layers,
        badgeColor: "bg-cyan-950/60 text-cyan-300 border-cyan-500/30",
      },
      {
        keys: ["P"],
        description: "Toggle Performance Analytics & Calendar",
        icon: BarChart2,
        badgeColor: "bg-purple-950/60 text-purple-300 border-purple-500/30",
      },
      {
        keys: ["Ctrl", "K"],
        description: "Global stock search & command palette",
        icon: Search,
        badgeColor: "bg-amber-950/60 text-amber-300 border-amber-500/30",
      },
    ],
  },
  {
    category: "Terminal Desk & Navigation",
    items: [
      {
        keys: ["Shift", "P"],
        description: "Focus Open Positions table in bottom drawer",
        icon: SlidersHorizontal,
        badgeColor: "bg-indigo-950/60 text-indigo-300 border-indigo-500/30",
      },
      {
        keys: ["Shift", "O"],
        description: "Focus Pending Orders table in bottom drawer",
        icon: CheckCircle2,
        badgeColor: "bg-indigo-950/60 text-indigo-300 border-indigo-500/30",
      },
      {
        keys: ["↑", "↓"],
        description: "Cycle next / previous counter in watchlist",
        icon: ArrowUpDown,
        badgeColor: "bg-slate-800 text-slate-300 border-slate-700",
      },
      {
        keys: ["?"],
        description: "Toggle this Keyboard Shortcuts Guide",
        icon: Keyboard,
        badgeColor: "bg-cyan-950/60 text-cyan-300 border-cyan-500/30",
      },
    ],
  },
];

export default function ShortcutsModal() {
  const isOpen = useUIStore((s) => s.isShortcutsGuideOpen);
  const setIsOpen = useUIStore((s) => s.setShortcutsGuideOpen);

  // Global keydown listener for '?' or 'Shift + /' and 'Escape'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setIsOpen(!isOpen);
        return;
      }

      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-scale-up transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 id="shortcuts-guide-title" className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Institutional Keyboard Shortcuts
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Speed up trading execution and analysis with professional hotkeys
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close keyboard shortcuts"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {SHORTCUT_CATEGORIES.map((cat) => (
            <div key={cat.category} className="space-y-2.5">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {cat.category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cat.items.map((item) => {
                  const Icon = item.icon || SlidersHorizontal;
                  return (
                    <div
                      key={item.description}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/70"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">
                          {item.description}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k) => (
                          <kbd
                            key={k}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border shadow-xs ${
                              item.badgeColor ||
                              "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700"
                            }`}
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            Press <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-mono">?</kbd> anywhere to toggle this guide
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
