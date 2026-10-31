import type { ModelShortcutAction } from "./modelKeyboard";

export type ModelKeyboardBridge = {
  applyShortcut: (action: ModelShortcutAction) => void;
};

let bridge: ModelKeyboardBridge | null = null;

export function registerModelKeyboardBridge(next: ModelKeyboardBridge | null): void {
  bridge = next;
}

export function getModelKeyboardBridge(): ModelKeyboardBridge | null {
  return bridge;
}
