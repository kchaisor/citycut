import { fromLocal, toLocal } from "./geo";
import type { LonLat } from "../types";
import { planViewportEqual, type PlanViewport } from "./planViewport";

/** WGS84 bounds [[west, south], [east, north]] for the plan/SVG viewBox. */
export function planViewportLngLatBounds(
  view: PlanViewport,
  center: LonLat,
): [[number, number], [number, number]] {
  const west = fromLocal([view.x, view.y + view.h], center);
  const east = fromLocal([view.x + view.w, view.y], center);
  return [
    [west.lon, west.lat],
    [east.lon, east.lat],
  ];
}

/** Inverse of {@link planViewportLngLatBounds} for a north-up map bounds box. */
export function planViewportFromLngLatBounds(
  bounds: [[number, number], [number, number]],
  center: LonLat,
): PlanViewport {
  const [sw, ne] = bounds;
  const nw = toLocal(ne[1], sw[0], center);
  const se = toLocal(sw[1], ne[0], center);
  const x = nw[0];
  const y = nw[1];
  const w = se[0] - x;
  const h = se[1] - y;
  return { x, y, w, h };
}

export function planSatelliteViewportEqual(a: PlanViewport, b: PlanViewport): boolean {
  return planViewportEqual(a, b);
}
