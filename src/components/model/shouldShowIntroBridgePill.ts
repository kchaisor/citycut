import { qaModeFromSearch } from "../../lib/qaCameraBridge";

export function shouldShowIntroBridgePill(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (/jsdom|HappyDOM/i.test(navigator.userAgent ?? "")) return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (qaModeFromSearch(window.location.search)) return false;
  return true;
}