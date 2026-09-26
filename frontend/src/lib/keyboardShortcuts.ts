/**
 * Pure functions and types for terminal keyboard shortcut resolution.
 */

export type TerminalShortcutAction =
  | "BUY"
  | "SELL"
  | "CANCEL"
  | "TIMEFRAME_1M"
  | "TIMEFRAME_5M"
  | "TIMEFRAME_15M"
  | "TIMEFRAME_1H"
  | "TIMEFRAME_1D"
  | "FOCUS_POSITIONS"
  | "FOCUS_ORDERS"
  | "TOGGLE_SHORTCUTS";

export interface KeyboardEventLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isInput?: boolean;
}

/**
 * Checks whether an event target represents a user-editable text input.
 */
export function isInputElement(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (typeof el.getAttribute === "function" && el.getAttribute("role") === "textbox") return true;
  return false;
}

/**
 * Resolves a keyboard event to a standard terminal shortcut action.
 * Returns null if the event does not correspond to a terminal shortcut or if it should be ignored.
 */
export function resolveTerminalShortcut(event: KeyboardEventLike): TerminalShortcutAction | null {
  // Never intercept OS/browser modifiers like Ctrl+R, Cmd+K, Alt+Tab, etc.
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  // Inside form inputs, only allow Escape (to cancel/blur)
  if (event.isInput) {
    if (event.key === "Escape") {
      return "CANCEL";
    }
    return null;
  }

  // Shift combinations
  if (event.shiftKey) {
    const upper = event.key.toUpperCase();
    if (upper === "P") return "FOCUS_POSITIONS";
    if (upper === "O") return "FOCUS_ORDERS";
    if (event.key === "?" || event.key === "/") return "TOGGLE_SHORTCUTS";
  }

  // Universal hotkeys
  if (event.key === "?" || (event.shiftKey && event.key === "/")) {
    return "TOGGLE_SHORTCUTS";
  }
  if (event.key === "Escape") {
    return "CANCEL";
  }

  // Single-key hotkeys (case-insensitive for letters)
  const lower = event.key.toLowerCase();
  if (lower === "b") return "BUY";
  if (lower === "s") return "SELL";
  if (lower === "c") return "CANCEL";

  // Timeframe numbers 1-5
  if (event.key === "1") return "TIMEFRAME_1M";
  if (event.key === "2") return "TIMEFRAME_5M";
  if (event.key === "3") return "TIMEFRAME_15M";
  if (event.key === "4") return "TIMEFRAME_1H";
  if (event.key === "5") return "TIMEFRAME_1D";

  return null;
}
