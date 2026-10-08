import type { LonLat } from "../types";
import type { LandmarkRow } from "./landmarkHeights.test";

const M_PER_DEG_LAT = 111_320;

function lonScale(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Centre and square side for a snapshot cut covering all fixture rows in that cut. */
export function landmarkCutBounds(
  rows: LandmarkRow[],
  marginM = 120,
  minSideM = 450,
): { center: LonLat; sideM: number } {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const row of rows) {
    minLat = Math.min(minLat, row.lat);
    maxLat = Math.max(maxLat, row.lat);
    minLon = Math.min(minLon, row.lon);
    maxLon = Math.max(maxLon, row.lon);
  }
  const center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  const latSpanM = (maxLat - minLat) * M_PER_DEG_LAT;
  const lonSpanM = (maxLon - minLon) * lonScale(center.lat);
  const sideM = Math.max(minSideM, Math.max(latSpanM, lonSpanM) + marginM * 2);
  return { center, sideM };
}

/** Distance from a point to the nearest edge of a square cut (local metres). */
export function insetFromCutEdgeM(row: LonLat, center: LonLat, sideM: number): number {
  const half = sideM / 2;
  const x = (row.lon - center.lon) * lonScale(center.lat);
  const y = (row.lat - center.lat) * M_PER_DEG_LAT;
  return half - Math.max(Math.abs(x), Math.abs(y));
}
