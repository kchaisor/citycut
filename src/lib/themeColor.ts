import { themeSheetColor } from "./drawingSheet";

const PAGE = themeSheetColor("--background");

/**
 * The colour currently assigned to a theme variable, resolved through any
 * `var(...)` references. Three.js and SVG fills need a real colour, not the
 * variable name. The theme file stays the only place the colour is written.
 */
export function themeColor(name: string, fallback = PAGE): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = fallback;
  probe.style.color = `var(${name}, ${fallback})`;
  document.documentElement.appendChild(probe);
  const resolved = getComputedStyle(probe).color.trim();
  probe.remove();
  return resolved || fallback;
}
