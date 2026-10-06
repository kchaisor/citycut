import type { WindRoseTable } from "./windRose";

export const WIND_CACHE_VERSION = 1;
export const WIND_CACHE_KEY_PREFIX = "citycut.windRose.v";

export function windCacheKey(lat: number, lon: number): string {
  const rLat = Math.round(lat / 0.05) * 0.05;
  const rLon = Math.round(lon / 0.05) * 0.05;
  return `${WIND_CACHE_KEY_PREFIX}${WIND_CACHE_VERSION}:${rLat.toFixed(2)},${rLon.toFixed(2)}`;
}

export function readWindCache(storage: Storage, lat: number, lon: number): WindRoseTable | null {
  try {
    const raw = storage.getItem(windCacheKey(lat, lon));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WindRoseTable;
    if (parsed.version !== WIND_CACHE_VERSION) return null;
    if (!parsed.counts || parsed.counts.length !== 12) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeWindCache(storage: Storage, table: WindRoseTable): void {
  try {
    storage.setItem(windCacheKey(table.lat, table.lon), JSON.stringify(table));
  } catch {
    // Private mode or quota.
  }
}
