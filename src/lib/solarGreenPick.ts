import { receptorAreaM2 } from "./solarAccessB43";
import type { AreaFeat, CityModel, Ring } from "../types";

export function ringBounds(ring: Ring): { east0: number; north0: number; east1: number; north1: number } | null {
  if (ring.length < 3) return null;
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
  if (!Number.isFinite(minE)) return null;
  return { east0: minE, north0: minN, east1: maxE, north1: maxN };
}

export function largestGreenArea(model: CityModel): AreaFeat | null {
  let best: AreaFeat | null = null;
  let bestM2 = 0;
  for (const area of model.areas) {
    if (area.kind !== "green") continue;
    const m2 = receptorAreaM2(area.ring);
    if (m2 > bestM2) {
      bestM2 = m2;
      best = area;
    }
  }
  return best;
}

export function largestGreenAreaBounds(model: CityModel): ReturnType<typeof ringBounds> {
  const area = largestGreenArea(model);
  if (!area) return null;
  return ringBounds(area.ring);
}
