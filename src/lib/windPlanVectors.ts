import type { WindPlanFlow, WindPlanGeometry } from "./windPlanField";
import { windPlanFieldPercentile, windPlanPaintsCell, windPlanUnpaintedMask, WIND_PLAN_SCALE_PERCENTILE } from "./windPlanField";

export const WIND_PLAN_VECTOR_SPACING_M = 15;
export const WIND_PLAN_VECTOR_CLEAR_M = 4;
export const WIND_PLAN_VECTOR_MIN_GAP_PX = 7;
export const WIND_PLAN_VECTOR_GAP_FILL = 0.75;
export const WIND_PLAN_VECTOR_MIN_FRACTION = 0.35;
export const WIND_PLAN_VECTOR_HEAD_DEG = 28;

export type WindPlanVectorSite = { gi: number; gj: number; east: number; north: number; idx: number };

export type WindPlanVector = WindPlanVectorSite & { dirE: number; dirN: number; strength: number };

type SiteGeometry = Pick<WindPlanGeometry, "cols" | "rows" | "cellM" | "originE" | "originN" | "solid" | "water">;

function clearOfObstacles(geometry: SiteGeometry, i: number, j: number, reach: number): boolean {
  const { cols, rows } = geometry;
  for (let y = Math.max(0, j - reach); y <= Math.min(rows - 1, j + reach); y++) {
    for (let x = Math.max(0, i - reach); x <= Math.min(cols - 1, i + reach); x++) {
      if (!windPlanPaintsCell(geometry, y * cols + x)) return false;
    }
  }
  return true;
}

export function windPlanVectorSites(
  geometry: SiteGeometry,
  spacingM: number = WIND_PLAN_VECTOR_SPACING_M,
  clearM: number = WIND_PLAN_VECTOR_CLEAR_M,
): WindPlanVectorSite[] {
  const { cols, rows, cellM, originE, originN } = geometry;
  const reach = Math.max(0, Math.round(clearM / cellM));
  const sites: WindPlanVectorSite[] = [];
  const gj0 = Math.ceil(originN / spacingM);
  const gj1 = Math.floor((originN + rows * cellM) / spacingM);
  for (let gj = gj0; gj <= gj1; gj++) {
    const north = gj * spacingM;
    const j = Math.floor((north - originN) / cellM);
    if (j < 0 || j >= rows) continue;
    const shift = (gj & 1) * (spacingM / 2);
    const gi0 = Math.ceil((originE - shift) / spacingM);
    const gi1 = Math.floor((originE + cols * cellM - shift) / spacingM);
    for (let gi = gi0; gi <= gi1; gi++) {
      const east = gi * spacingM + shift;
      const i = Math.floor((east - originE) / cellM);
      if (i < 0 || i >= cols) continue;
      if (!clearOfObstacles(geometry, i, j, reach)) continue;
      sites.push({ gi, gj, east, north, idx: j * cols + i });
    }
  }
  return sites;
}

export function windPlanVectors(sites: readonly WindPlanVectorSite[], flow: WindPlanFlow, scaleMs: number): WindPlanVector[] {
  const out: WindPlanVector[] = [];
  const top = scaleMs > 0 ? scaleMs : 1;
  for (const site of sites) {
    const e = flow.east[site.idx]!;
    const n = flow.north[site.idx]!;
    const length = Math.hypot(e, n);
    if (!(length > 1e-6)) continue;
    const strength = Math.min(1, Math.max(0, flow.speedMs[site.idx]! / top));
    out.push({ ...site, dirE: e / length, dirN: n / length, strength });
  }
  return out;
}

export function windPlanVectorScaleMs(flow: WindPlanFlow, geometry: Pick<WindPlanGeometry, "solid" | "water">): number {
  const peak = windPlanFieldPercentile(flow.speedMs, windPlanUnpaintedMask(geometry), WIND_PLAN_SCALE_PERCENTILE);
  return Number.isFinite(peak) && peak > 0 ? peak : 1;
}

export function windPlanVectorStride(spacingM: number, pxPerM: number, minGapPx: number = WIND_PLAN_VECTOR_MIN_GAP_PX): number {
  let stride = 1;
  while (stride < 64 && spacingM * stride * pxPerM < minGapPx) stride *= 2;
  return stride;
}

export function windPlanVectorLengthPx(strength: number, gapPx: number, maxPx: number): number {
  const full = Math.min(maxPx, gapPx * WIND_PLAN_VECTOR_GAP_FILL);
  return full * (WIND_PLAN_VECTOR_MIN_FRACTION + (1 - WIND_PLAN_VECTOR_MIN_FRACTION) * Math.min(1, Math.max(0, strength)));
}
