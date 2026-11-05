import { fromLocal, squareBBox, toLocal } from "./geo";
import type { LonLat } from "../types";
import type { PlanViewport } from "./planViewport";

export const DEMOGRAPHICS_MAP_PAD_M = 1500;

export function demographicsMapSideWithPad(sideM: number): number {
  return sideM + DEMOGRAPHICS_MAP_PAD_M * 2;
}

export function demographicsMapLngLatBounds(center: LonLat, sideM: number): [[number, number], [number, number]] {
  const box = squareBBox(center, demographicsMapSideWithPad(sideM));
  return [
    [box.west, box.south],
    [box.east, box.north],
  ];
}

export function demographicsMapInitialFitBounds(
  center: LonLat,
  sideM: number,
  radiusM: number,
): [[number, number], [number, number]] {
  const pad = Math.max(720, sideM * 0.52, radiusM * 1.45);
  const box = squareBBox(center, sideM + pad * 2);
  return [
    [box.west, box.south],
    [box.east, box.north],
  ];
}

export function demographicsPlanViewportLngLatBounds(
  view: PlanViewport,
  center: LonLat,
): [[number, number], [number, number]] {
  const sw = fromLocal([view.x, view.y + view.h], center);
  const ne = fromLocal([view.x + view.w, view.y], center);
  return [
    [sw.lon, sw.lat],
    [ne.lon, ne.lat],
  ];
}

export function demographicsPlanViewportFromLngLatBounds(
  bounds: [[number, number], [number, number]],
  center: LonLat,
): PlanViewport {
  const [sw, ne] = bounds;
  const [xWest, ySouth] = toLocal(sw[1], sw[0], center);
  const [xEast, yNorth] = toLocal(ne[1], ne[0], center);
  const x = Math.min(xWest, xEast);
  const y = Math.min(yNorth, ySouth);
  return { x, y, w: Math.max(xWest, xEast) - x, h: Math.max(ySouth, yNorth) - y };
}

export function pinDistanceFromCutCenterM(east: number, north: number): number {
  return Math.hypot(east, north);
}

declare global {
  interface Window {
    __citycutDemographicsMap?: import("maplibre-gl").Map;
    __citycutDemographicsMapInstanceId?: number;
    __citycutDemographicsFitBoundsCount?: number;
    __citycutDemographicsRadiusM?: number;
    __citycutDemographicsPins?: {
      a: { lon: number; lat: number; label: string } | null;
      b: { lon: number; lat: number; label: string } | null;
    };
    __citycutDemographicsCatchmentTinted?: number;
    __citycutDemographicsCatchmentAudit?: {
      tinted: number;
      tintedOutside: number;
      insideUntinted: number;
    };
    __citycutDemographicsQaMovePin?: (
      id: import("./demographicsExplorerReducer").DemographicsPinId,
      lon: number,
      lat: number,
    ) => void;
  }
}
