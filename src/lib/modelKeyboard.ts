import { isEditableTarget } from "./keyboardTarget";

export type ModelShortcutId = "sun" | "wind" | "viewshed" | "section" | "export" | "display";

export type ModelShortcutAction = {
  section: "drawing" | "analysis" | "exports";
  analysisKind?: "solar" | "wind" | "view" | "section";
};

export const MODEL_SHORTCUT_MAP: Record<
  Exclude<ModelShortcutId, "section">,
  ModelShortcutAction
> = {
  sun: { section: "analysis", analysisKind: "solar" },
  wind: { section: "analysis", analysisKind: "wind" },
  viewshed: { section: "analysis", analysisKind: "view" },
  export: { section: "exports" },
  display: { section: "drawing" },
};

export function sectionCutShortcutAvailable(): boolean {
  return false;
}

export type ModelKeyDownInput = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  commandBarOpen: boolean;
  cheatsheetOpen: boolean;
};

export type ModelKeyDownResult =
  | { type: "none" }
  | { type: "open-cheatsheet" }
  | { type: "close-cheatsheet" }
  | { type: "shortcut"; action: ModelShortcutAction };

function normalizedKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function handleModelKeyDown(input: ModelKeyDownInput): ModelKeyDownResult {
  if (input.commandBarOpen) {
    if (input.key === "Escape" && input.cheatsheetOpen) return { type: "close-cheatsheet" };
    return { type: "none" };
  }
  if (isEditableTarget(input.target)) return { type: "none" };
  if (input.metaKey || input.ctrlKey || input.altKey) return { type: "none" };

  if (input.key === "Escape") {
    if (input.cheatsheetOpen) return { type: "close-cheatsheet" };
    return { type: "none" };
  }

  const key = normalizedKey(input.key);
  if (input.key === "?") {
    return input.cheatsheetOpen ? { type: "close-cheatsheet" } : { type: "open-cheatsheet" };
  }

  if (key === "s") return { type: "shortcut", action: MODEL_SHORTCUT_MAP.sun };
  if (key === "w") return { type: "shortcut", action: MODEL_SHORTCUT_MAP.wind };
  if (key === "v") return { type: "shortcut", action: MODEL_SHORTCUT_MAP.viewshed };
  if (key === "e") return { type: "shortcut", action: MODEL_SHORTCUT_MAP.export };
  if (key === "d") return { type: "shortcut", action: MODEL_SHORTCUT_MAP.display };
  if (key === "x" && sectionCutShortcutAvailable()) {
    return { type: "shortcut", action: { section: "analysis", analysisKind: "section" } };
  }
  return { type: "none" };
}

export const KEYBOARD_CHEATSHEET_ROWS: { key: string; label: string }[] = [
  { key: "S", label: "Sun" },
  { key: "W", label: "Wind" },
  { key: "V", label: "Viewshed" },
  ...(sectionCutShortcutAvailable() ? [{ key: "X", label: "Section cut" }] : []),
  { key: "E", label: "Export" },
  { key: "D", label: "Display" },
  { key: "?", label: "This cheatsheet" },
  { key: "⌘K / Ctrl+K", label: "Command bar" },
];
