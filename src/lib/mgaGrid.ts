import { mgaZone, projectLonLat, unprojectMga } from "./crs";

export const MGA_GRID_STEPS_M = [10, 50, 100, 500, 1000, 5000, 10000, 50000] as const;
export const MGA_GRID_MIN_GAP_PX = 72;

export function mgaGridStep(metresPerPixel: number, minGapPx = MGA_GRID_MIN_GAP_PX): number {
  for (const step of MGA_GRID_STEPS_M) if (step / metresPerPixel >= minGapPx) return step;
  return MGA_GRID_STEPS_M[MGA_GRID_STEPS_M.length - 1]!;
}

export type GridCross = { lon: number; lat: number; easting: number; northing: number };

/** Grid intersections (MGA easting × northing on whole steps) inside a lon/lat box. */
export function mgaGridCrosses(
  bounds: { west: number; south: number; east: number; north: number },
  step: number,
  zone = mgaZone((bounds.west + bounds.east) / 2),
  maxCount = 4000,
): GridCross[] {
  const corners = [
    projectLonLat(bounds.west, bounds.south, zone),
    projectLonLat(bounds.west, bounds.north, zone),
    projectLonLat(bounds.east, bounds.south, zone),
    projectLonLat(bounds.east, bounds.north, zone),
  ];
  const e0 = Math.floor(Math.min(...corners.map((c) => c[0])) / step) * step;
  const e1 = Math.ceil(Math.max(...corners.map((c) => c[0])) / step) * step;
  const n0 = Math.floor(Math.min(...corners.map((c) => c[1])) / step) * step;
  const n1 = Math.ceil(Math.max(...corners.map((c) => c[1])) / step) * step;
  if (((e1 - e0) / step + 1) * ((n1 - n0) / step + 1) > maxCount) return [];
  const out: GridCross[] = [];
  for (let e = e0; e <= e1; e += step)
    for (let n = n0; n <= n1; n += step) {
      const { lon, lat } = unprojectMga(e, n, zone);
      out.push({ lon, lat, easting: e, northing: n });
    }
  return out;
}
