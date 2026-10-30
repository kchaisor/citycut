import { AGE_BANDS, CENSUS_FIELDS, ringArea, pointInRing, share, type CensusValues, type SelectedSa1 } from "./censusPeople";
import { rasterizeSa1Owners } from "./censusSa1Layer";
import { siteFrameHalf, type SiteFrameShape } from "./siteFrame";
import type { Pt } from "../types";

export type LensPolygons = readonly (readonly (readonly Pt[])[])[];
export type LensMethod = "centroid" | "area";
export const LENS_GRID = 160;

export type LensIndex = {
  sideM: number;
  shape: SiteFrameShape;
  size: number;
  cell: number;
  owners: Int16Array;
  codes: string[];
  values: CensusValues[];
  centroids: Pt[];
  fullAreaM2: number[];
};

export type LensResult = {
  values: CensusValues;
  people: number;
  sa1Codes: string[];
  estimated: boolean;
  method: LensMethod;
};

const MEDIANS = new Set(["medAge", "medHhInc"]);

export function emptyValues(): CensusValues {
  const values = {} as CensusValues;
  for (const field of CENSUS_FIELDS) values[field] = 0;
  return values;
}

function signedArea(ring: readonly Pt[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

function ringCentroid(ring: readonly Pt[]): Pt {
  const a = signedArea(ring);
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, ring.length);
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

function isHole(ring: readonly Pt[], rings: readonly (readonly Pt[])[]): boolean {
  const probe = ring[0];
  if (!probe) return false;
  let depth = 0;
  for (const other of rings) {
    if (other === ring) continue;
    if (ringArea(other) > ringArea(ring) && pointInRing(probe, other)) depth += 1;
  }
  return depth % 2 === 1;
}

export function sa1Centroid(rings: readonly (readonly Pt[])[]): Pt {
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (const ring of rings) {
    const area = ringArea(ring);
    if (area <= 0) continue;
    const weight = isHole(ring, rings) ? -area : area;
    const [cx, cy] = ringCentroid(ring);
    sx += cx * weight;
    sy += cy * weight;
    total += weight;
  }
  if (total <= 0) return rings[0]?.[0] ?? [0, 0];
  return [sx / total, sy / total];
}

export function buildLensIndex(sa1: readonly SelectedSa1[], sideM: number, shape: SiteFrameShape, size = LENS_GRID): LensIndex {
  return {
    sideM,
    shape,
    size,
    cell: sideM / size,
    owners: rasterizeSa1Owners(sa1, sideM, shape, size),
    codes: sa1.map((s) => s.code),
    values: sa1.map((s) => s.values),
    centroids: sa1.map((s) => sa1Centroid(s.rings)),
    fullAreaM2: sa1.map((s) => (s.fraction > 0 ? (s.clippedKm2 * 1e6) / s.fraction : 0)),
  };
}

export function clampLensCentre(centre: Pt, sideM: number, shape: SiteFrameShape): Pt {
  const half = siteFrameHalf(sideM);
  if (shape === "circle") {
    const d = Math.hypot(centre[0], centre[1]);
    if (d <= half || d === 0) return centre;
    return [(centre[0] / d) * half, (centre[1] / d) * half];
  }
  return [Math.max(-half, Math.min(half, centre[0])), Math.max(-half, Math.min(half, centre[1]))];
}

export function pointInWalk(point: Pt, polygons: readonly (readonly (readonly Pt[])[])[]): boolean {
  for (const polygon of polygons) {
    const [outer, ...holes] = polygon;
    if (!outer || !pointInRing(point, outer)) continue;
    if (holes.some((hole) => pointInRing(point, hole))) continue;
    return true;
  }
  return false;
}

function walkBounds(polygons: readonly (readonly (readonly Pt[])[])[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0] ?? []) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

export function lensWeights(index: LensIndex, polygons: LensPolygons, method: LensMethod): Float64Array {
  const weights = new Float64Array(index.codes.length);
  if (method === "centroid") {
    index.centroids.forEach((c, i) => {
      if (pointInWalk(c, polygons)) weights[i] = 1;
    });
    return weights;
  }
  const { size, cell, owners, sideM } = index;
  const half = sideM / 2;
  const cells = new Float64Array(index.codes.length);
  const [minX, minY, maxX, maxY] = walkBounds(polygons);
  if (!Number.isFinite(minX)) return weights;
  const rowFrom = Math.max(0, Math.floor((minY + half) / cell));
  const rowTo = Math.min(size - 1, Math.ceil((maxY + half) / cell));
  const colFrom = Math.max(0, Math.floor((minX + half) / cell));
  const colTo = Math.min(size - 1, Math.ceil((maxX + half) / cell));
  for (let row = rowFrom; row <= rowTo; row += 1) {
    const y = -half + (row + 0.5) * cell;
    for (let col = colFrom; col <= colTo; col += 1) {
      const own = owners[row * size + col];
      if (own < 0) continue;
      if (pointInWalk([-half + (col + 0.5) * cell, y], polygons)) cells[own] += 1;
    }
  }
  const cellArea = cell * cell;
  for (let i = 0; i < weights.length; i += 1) {
    const full = index.fullAreaM2[i];
    weights[i] = full > 0 ? Math.min(1, (cells[i] * cellArea) / full) : 0;
  }
  return weights;
}

export function aggregateLens(index: LensIndex, polygons: LensPolygons, method: LensMethod): LensResult {
  const weights = lensWeights(index, polygons, method);
  const values = emptyValues();
  const sa1Codes: string[] = [];
  weights.forEach((w, i) => {
    if (w <= 0) return;
    sa1Codes.push(index.codes[i]);
    const v = index.values[i];
    for (const field of CENSUS_FIELDS) {
      if (!MEDIANS.has(field)) values[field] += v[field] * w;
    }
  });
  return { values, people: values.pop, sa1Codes, estimated: method === "area", method };
}

export type LensShares = {
  age: number[];
  renters: number;
  noCar: number;
  loneHh: number;
  wfh: number;
};

export function lensShares(v: CensusValues): LensShares {
  const age = AGE_BANDS.map((b) => v[b.key]);
  return {
    age: age.map((n) => share(n, age)),
    renters: share(v.tenRent, [v.tenOwned, v.tenMortgage, v.tenRent, v.tenOther]),
    noCar: share(v.car0, [v.car0, v.car1, v.car2, v.car3p]),
    loneHh: share(v.hhLone, [v.hhFamily, v.hhLone, v.hhGroup]),
    wfh: share(v.twHome, [v.twCar, v.twPt, v.twActive, v.twMulti, v.twHome, v.twOther]),
  };
}
