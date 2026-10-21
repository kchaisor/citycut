import type { PlaceHit } from "../types";

/** Recent place searches on the landing page, newest first. */
export const SEARCH_HISTORY_KEY = "citycut.searchHistory";
export const SEARCH_HISTORY_MAX = 10;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isHit(value: unknown): value is PlaceHit {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.detail === "string" &&
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lon) &&
    (v.bounds === null || (Array.isArray(v.bounds) && v.bounds.length === 4 && v.bounds.every(Number.isFinite)))
  );
}

/** Stored history; anything unreadable or malformed is skipped rather than thrown. */
export function readSearchHistory(storage: StorageLike | null | undefined): PlaceHit[] {
  try {
    const raw = storage?.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHit).slice(0, SEARCH_HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

const samePlace = (a: PlaceHit, b: PlaceHit) =>
  a.id === b.id || (Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6 && a.label === b.label);

/** Put `hit` first, drop its older copy, keep the last 10. Returns the new list. */
export function addSearchHistory(storage: StorageLike | null | undefined, hit: PlaceHit): PlaceHit[] {
  const entry: PlaceHit = { id: hit.id, label: hit.label, detail: hit.detail, lat: hit.lat, lon: hit.lon, bounds: hit.bounds };
  const next = [entry, ...readSearchHistory(storage).filter((old) => !samePlace(old, entry))].slice(0, SEARCH_HISTORY_MAX);
  try {
    storage?.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the list still shows for this session.
  }
  return next;
}

export function clearSearchHistory(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(SEARCH_HISTORY_KEY);
  } catch {
    // Blocked storage: nothing stored to clear.
  }
}
