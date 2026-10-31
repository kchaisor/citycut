import type { ModelShortcutAction } from "./modelKeyboard";

export type CommandToolDef = {
  id: string;
  label: string;
  shortcut: string;
  keywords: readonly string[];
  action: ModelShortcutAction;
};

export const COMMAND_TOOL_DEFS: readonly CommandToolDef[] = [
  {
    id: "display",
    label: "Display",
    shortcut: "D",
    keywords: ["drawing", "3d", "plan"],
    action: { section: "drawing" },
  },
  {
    id: "sun",
    label: "Sun",
    shortcut: "S",
    keywords: ["solar", "shadow", "heliodon"],
    action: { section: "analysis", analysisKind: "solar" },
  },
  {
    id: "wind",
    label: "Wind",
    shortcut: "W",
    keywords: ["rose", "climate"],
    action: { section: "analysis", analysisKind: "wind" },
  },
  {
    id: "viewshed",
    label: "Viewshed",
    shortcut: "V",
    keywords: ["view", "walk"],
    action: { section: "analysis", analysisKind: "view" },
  },
  {
    id: "export",
    label: "Export",
    shortcut: "E",
    keywords: ["download", "rhino", "png"],
    action: { section: "exports" },
  },
];
