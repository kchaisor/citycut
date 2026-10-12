import { useSyncExternalStore } from "react";
import { resolvePanelCollapsed, viewportIsNarrow } from "./panelCollapse";

/**
 * One collapse setting for the fixed left sidebar, shared by the landing page and the
 * model page. Collapsing on one page keeps it collapsed on the other.
 *
 * On narrow screens the sidebar always starts collapsed, so the cut frame fits above
 * the rail. Elsewhere a stored choice wins, and the default is open.
 */
export const SIDEBAR_COLLAPSED_KEY = "citycut.sidebar.collapsed";

type Listener = () => void;
const listeners = new Set<Listener>();
let collapsed: boolean | null = null;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  } catch {
    return null;
  }
}

export function initialSidebarCollapsed(stored: string | null, isNarrow: boolean): boolean {
  if (isNarrow) return true;
  return resolvePanelCollapsed(stored, false);
}

export function getSidebarCollapsed(): boolean {
  if (collapsed === null) collapsed = initialSidebarCollapsed(readStored(), viewportIsNarrow());
  return collapsed;
}

export function setSidebarCollapsed(next: boolean): void {
  if (getSidebarCollapsed() === next) return;
  collapsed = next;
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    // Private mode and some embedded browsers throw on localStorage.
  }
  for (const listener of listeners) listener();
}

/** Test hook: forget the in-memory value so the next read starts from storage again. */
export function resetSidebarCollapsedForTests(): void {
  collapsed = null;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, getSidebarCollapsed, getSidebarCollapsed);
  return [value, setSidebarCollapsed];
}
