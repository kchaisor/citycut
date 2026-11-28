import { COMFORT_CLASSES, comfortClassAt, type ComfortClass } from "./windComfort";
import type { WorldRing } from "./windPlanContours";
import { windPlanPaintsCell, type WindPlanComfort } from "./windPlanField";
import { pointInClip } from "./windPlanSiteClip";

export type ComfortShares = Record<ComfortClass, number>;

export function comfortShares(comfort: WindPlanComfort, rings: readonly WorldRing[]): ComfortShares | null {
  const { cols, rows, cellM, originE, originN } = comfort.geometry;
  const counts = Object.fromEntries(COMFORT_CLASSES.map((cls) => [cls, 0])) as ComfortShares;
  let total = 0;
  for (let j = 0; j < rows; j++) {
    const n = originN + (j + 0.5) * cellM;
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      if (!windPlanPaintsCell(comfort.geometry, idx)) continue;
      if (!pointInClip(originE + (i + 0.5) * cellM, n, rings)) continue;
      counts[comfortClassAt(comfort.fields, idx)] += 1;
      total += 1;
    }
  }
  if (total === 0) return null;
  for (const cls of COMFORT_CLASSES) counts[cls] /= total;
  return counts;
}

export function comfortShareLabel(share: number): string {
  if (!(share > 0)) return "0%";
  if (share < 0.005) return "<1%";
  return `${Math.round(share * 100)}%`;
}
