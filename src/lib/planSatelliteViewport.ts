import { fromLocal, toLocal } from "./geo";
import type { LonLat } from "../types";
import { planViewportEqual, type PlanViewport } from "./planViewport";

export function planViewportLngLatBounds(
  view: PlanViewport,
  center: LonLat,
): [[number, number], [number, number]] {
  const southWest = fromLocal([view.x, -(view.y + view.h)], center);
  const northEast = fromLocal([view.x + view.w, -view.y], center);
  return [
    [southWest.lon, southWest.lat],
    [northEast.lon, northEast.lat],
  ];
}

export function planViewportFromLngLatBounds(
  bounds: [[number, number], [number, number]],
  center: LonLat,
): PlanViewport {
  const [sw, ne] = bounds;
  const [west, south] = toLocal(sw[1], sw[0], center);
  const [east, north] = toLocal(ne[1], ne[0], center);
  return { x: west, y: -north, w: east - west, h: north - south };
}

export function planSatelliteViewportEqual(a: PlanViewport, b: PlanViewport): boolean {
  return planViewportEqual(a, b);
}
