"use client";

import { useEffect, useRef } from "react";
import {
  resolveTerminalShortcut,
  isInputElement,
  type TerminalShortcutAction,
} from "@/lib/keyboardShortcuts";

export interface UseKeyboardShortcutsOptions {
  onBuy?: () => void;
  onSell?: () => void;
  onCancel?: () => void;
  onTimeframeChange?: (tf: string) => void;
  onFocusPositions?: () => void;
  onFocusOrders?: () => void;
  onToggleShortcutsModal?: () => void;
  enabled?: boolean;
}

/**
 * Global keyboard shortcuts listener for the Trading Terminal.
 * Automatically checks whether the user is typing into an input/textarea
 * to prevent accidental hotkey triggering during data entry.
 */
export function useKeyboardShortcuts({
  onBuy,
  onSell,
  onCancel,
  onTimeframeChange,
  onFocusPositions,
  onFocusOrders,
  onToggleShortcutsModal,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  // Store callbacks in refs so listener always uses current closures without re-attaching
  const callbacksRef = useRef({
    onBuy,
    onSell,
    onCancel,
    onTimeframeChange,
    onFocusPositions,
    onFocusOrders,
    onToggleShortcutsModal,
  });

  useEffect(() => {
    callbacksRef.current = {
      onBuy,
      onSell,
      onCancel,
      onTimeframeChange,
      onFocusPositions,
      onFocusOrders,
      onToggleShortcutsModal,
    };
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = isInputElement(e.target);

      const action: TerminalShortcutAction | null = resolveTerminalShortcut({
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        isInput,
      });

      if (!action) return;

      const cb = callbacksRef.current;

      switch (action) {
        case "BUY":
          e.preventDefault();
          cb.onBuy?.();
          break;
        case "SELL":
          e.preventDefault();
          cb.onSell?.();
          break;
        case "CANCEL":
          e.preventDefault();
          cb.onCancel?.();
          break;
        case "TIMEFRAME_1M":
          e.preventDefault();
          cb.onTimeframeChange?.("1m");
          break;
        case "TIMEFRAME_5M":
          e.preventDefault();
          cb.onTimeframeChange?.("5m");
          break;
        case "TIMEFRAME_15M":
          e.preventDefault();
          cb.onTimeframeChange?.("15m");
          break;
        case "TIMEFRAME_1H":
          e.preventDefault();
          cb.onTimeframeChange?.("1H");
          break;
        case "TIMEFRAME_1D":
          e.preventDefault();
          cb.onTimeframeChange?.("1D");
          break;
        case "FOCUS_POSITIONS":
          e.preventDefault();
          cb.onFocusPositions?.();
          break;
        case "FOCUS_ORDERS":
          e.preventDefault();
          cb.onFocusOrders?.();
          break;
        case "TOGGLE_SHORTCUTS":
          e.preventDefault();
          cb.onToggleShortcutsModal?.();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
