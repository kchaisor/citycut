import { M_PER_DEG_LAT, mPerDegLon } from "./geo";
import type { LonLat } from "../types";

export type ViewportBounds = { south: number; west: number; north: number; east: number };

export type LandingViewportFootprint = {
  bounds: ViewportBounds;
  origin: LonLat;
  /** Square side for Overture clip centred on `origin` (covers the padded viewport). */
  sideM: number;
  cacheKey: string;
};

/** Padded map viewport used for landing colour tiles (not the cut square). */
export function landingViewportFootprint(
  bounds: ViewportBounds,
  zoom: number,
  padding = 1.25,
): LandingViewportFootprint {
  const midLat = (bounds.north + bounds.south) / 2;
  const midLon = (bounds.east + bounds.west) / 2;
  const origin: LonLat = { lat: midLat, lon: midLon };
  const latSpan = (bounds.north - bounds.south) * padding;
  const lonSpan = (bounds.east - bounds.west) * padding;
  const expanded: ViewportBounds = {
    south: midLat - latSpan / 2,
    north: midLat + latSpan / 2,
    west: midLon - lonSpan / 2,
    east: midLon + lonSpan / 2,
  };
  const halfW = ((expanded.east - expanded.west) / 2) * mPerDegLon(origin.lat);
  const halfH = ((expanded.north - expanded.south) / 2) * M_PER_DEG_LAT;
  const sideM = 2 * Math.max(halfW, halfH);
  const cacheKey = [zoom.toFixed(2), expanded.south.toFixed(4), expanded.west.toFixed(4), expanded.north.toFixed(4), expanded.east.toFixed(4)].join(
    "|",
  );
  return { bounds: expanded, origin, sideM, cacheKey };
}
