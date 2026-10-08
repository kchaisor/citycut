import type { BuildingFeat } from "../types";

export type LandingColourPayload = {
  buildings: BuildingFeat[];
  dataOrigin: { lat: number; lon: number };
};

const cache = new Map<string, LandingColourPayload>();

export function readLandingColourCache(key: string): LandingColourPayload | undefined {
  return cache.get(key);
}

export function writeLandingColourCache(key: string, payload: LandingColourPayload): void {
  cache.set(key, payload);
  if (cache.size > 6) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

/** @internal */
export function clearLandingColourCacheForTests(): void {
  cache.clear();
}
