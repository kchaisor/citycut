import { resolveView, VIEW_STORAGE_KEY, type ViewMemory } from "../../lib/viewMemory";

export function loadView(): ViewMemory {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const resolved = resolveView(stored, window.location.search);
  if (typeof window !== "undefined" && window.__citycutAwaitIntroStart) {
    return { ...resolved, projection: "perspective", freeRotate: false };
  }
  return resolved;
}