import type { LonLat, Ring } from "../types";
import { massingCutKey } from "./massingStore";
import type { SolarReceptorArea } from "./solarReceptorAssess";

const PREFIX = "citycut.solarReceptors.";

export function solarReceptorsStorageKey(center: LonLat): string {
  return `${PREFIX}${massingCutKey(center)}`;
}

export function loadSolarReceptors(center: LonLat): SolarReceptorArea[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(solarReceptorsStorageKey(center));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SolarReceptorArea[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && Array.isArray(item.ring));
  } catch {
    return [];
  }
}

export function saveSolarReceptors(center: LonLat, receptors: readonly SolarReceptorArea[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(solarReceptorsStorageKey(center), JSON.stringify(receptors));
  } catch {
    return;
  }
}

export function nextReceptorId(receptors: readonly SolarReceptorArea[]): string {
  let max = 0;
  for (const receptor of receptors) {
    const match = /^r(\d+)$/.exec(receptor.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `r${max + 1}`;
}

export function normalizeReceptorRing(ring: Ring, minSizeM = 2): Ring | null {
  if (ring.length < 4) return null;
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [east, north] of ring) {
    minE = Math.min(minE, east);
    maxE = Math.max(maxE, east);
    minN = Math.min(minN, north);
    maxN = Math.max(maxN, north);
  }
  if (maxE - minE < minSizeM || maxN - minN < minSizeM) return null;
  return [
    [minE, minN],
    [maxE, minN],
    [maxE, maxN],
    [minE, maxN],
    [minE, minN],
  ];
}
