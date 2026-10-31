import { themeSheetColor } from "./drawingSheet";

const PAGE = themeSheetColor("--background");

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
