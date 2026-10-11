import type { CityModel, Pt, Ring } from "../types";

function compareNum(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function comparePt(a: Pt, b: Pt): number {
  const east = compareNum(a[0], b[0]);
  if (east !== 0) return east;
  return compareNum(a[1], b[1]);
}

function compareRing(a: Ring, b: Ring): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const c = comparePt(a[i], b[i]);
    if (c !== 0) return c;
  }
  return compareNum(a.length, b.length);
}

function comparePolyline(a: Pt[], b: Pt[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const c = comparePt(a[i], b[i]);
    if (c !== 0) return c;
  }
  return compareNum(a.length, b.length);
}

/** Stable feature order for byte-identical exports (same cut, same options). */
export function stableExportModel(model: CityModel): CityModel {
  return {
    ...model,
    buildings: [...model.buildings].sort(
      (a, b) => compareNum(a.id, b.id) || compareRing(a.ring, b.ring),
    ),
    roads: [...model.roads].sort((a, b) => compareNum(a.id, b.id)),
    areas: [...model.areas].sort((a, b) => compareNum(a.id, b.id)),
    trees: [...model.trees].sort(
      (a, b) => compareNum(a.id, b.id) || comparePt(a.at, b.at),
    ),
    tramLines: model.tramLines
      ? [...model.tramLines].sort(comparePolyline)
      : model.tramLines,
  };
}
