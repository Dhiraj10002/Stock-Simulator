import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveTerminalShortcut,
  isInputElement,
} from "./keyboardShortcuts";

test("resolveTerminalShortcut: resolves basic hotkeys B, S, C", () => {
  assert.equal(resolveTerminalShortcut({ key: "b" }), "BUY");
  assert.equal(resolveTerminalShortcut({ key: "B" }), "BUY");
  assert.equal(resolveTerminalShortcut({ key: "s" }), "SELL");
  assert.equal(resolveTerminalShortcut({ key: "S" }), "SELL");
  assert.equal(resolveTerminalShortcut({ key: "c" }), "CANCEL");
  assert.equal(resolveTerminalShortcut({ key: "C" }), "CANCEL");
  assert.equal(resolveTerminalShortcut({ key: "Escape" }), "CANCEL");
});

test("resolveTerminalShortcut: resolves timeframe switches 1 to 5", () => {
  assert.equal(resolveTerminalShortcut({ key: "1" }), "TIMEFRAME_1M");
  assert.equal(resolveTerminalShortcut({ key: "2" }), "TIMEFRAME_5M");
  assert.equal(resolveTerminalShortcut({ key: "3" }), "TIMEFRAME_15M");
  assert.equal(resolveTerminalShortcut({ key: "4" }), "TIMEFRAME_1H");
  assert.equal(resolveTerminalShortcut({ key: "5" }), "TIMEFRAME_1D");
});

test("resolveTerminalShortcut: resolves Shift+P and Shift+O", () => {
  assert.equal(resolveTerminalShortcut({ key: "P", shiftKey: true }), "FOCUS_POSITIONS");
  assert.equal(resolveTerminalShortcut({ key: "p", shiftKey: true }), "FOCUS_POSITIONS");
  assert.equal(resolveTerminalShortcut({ key: "O", shiftKey: true }), "FOCUS_ORDERS");
  assert.equal(resolveTerminalShortcut({ key: "o", shiftKey: true }), "FOCUS_ORDERS");
});

test("resolveTerminalShortcut: resolves ? and Shift+/ to shortcuts toggle", () => {
  assert.equal(resolveTerminalShortcut({ key: "?" }), "TOGGLE_SHORTCUTS");
  assert.equal(resolveTerminalShortcut({ key: "/", shiftKey: true }), "TOGGLE_SHORTCUTS");
});

test("resolveTerminalShortcut: ignores hotkeys when typing in input, except Escape", () => {
  assert.equal(resolveTerminalShortcut({ key: "b", isInput: true }), null);
  assert.equal(resolveTerminalShortcut({ key: "s", isInput: true }), null);
  assert.equal(resolveTerminalShortcut({ key: "1", isInput: true }), null);
  assert.equal(resolveTerminalShortcut({ key: "P", shiftKey: true, isInput: true }), null);
  assert.equal(resolveTerminalShortcut({ key: "Escape", isInput: true }), "CANCEL");
});

test("resolveTerminalShortcut: ignores browser modifier keys (Ctrl, Cmd, Alt)", () => {
  assert.equal(resolveTerminalShortcut({ key: "c", ctrlKey: true }), null);
  assert.equal(resolveTerminalShortcut({ key: "r", metaKey: true }), null);
  assert.equal(resolveTerminalShortcut({ key: "s", altKey: true }), null);
});

test("isInputElement: correctly identifies input, textarea, select, and editable targets", () => {
  assert.equal(isInputElement({ tagName: "INPUT" }), true);
  assert.equal(isInputElement({ tagName: "input" }), true);
  assert.equal(isInputElement({ tagName: "TEXTAREA" }), true);
  assert.equal(isInputElement({ tagName: "SELECT" }), true);
  assert.equal(isInputElement({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isInputElement({ tagName: "DIV", getAttribute: (k: string) => k === "role" ? "textbox" : null }), true);
  assert.equal(isInputElement({ tagName: "BUTTON" }), false);
  assert.equal(isInputElement({ tagName: "DIV" }), false);
  assert.equal(isInputElement(null), false);
  assert.equal(isInputElement(undefined), false);
});
