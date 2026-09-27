import type { RoadGrade } from "../types";

/**
 * Draw order for surfaces that share the ground plane.
 * `lift` is metres above the terrain sample (or above the flat slab top).
 * Negative polygon offset pulls a surface toward the camera so it wins
 * a depth test against the layer below. `renderOrder` draws later layers after.
 * Bottom to top: terrain, green, water, paths, local streets, arterials, rail.
 * Building floors sit just above the terrain so their underside is not coplanar with it.
 */
export type SurfaceLayer = {
  lift: number;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
  renderOrder: number;
};

export const SURFACE = {
  terrain: { lift: 0, polygonOffsetFactor: 1, polygonOffsetUnits: 1, renderOrder: 0 },
  ground: { lift: 0, polygonOffsetFactor: 1, polygonOffsetUnits: 1, renderOrder: 0 },
  green: { lift: 0.045, polygonOffsetFactor: -1, polygonOffsetUnits: -2, renderOrder: 1 },
  water: { lift: 0.09, polygonOffsetFactor: -2, polygonOffsetUnits: -4, renderOrder: 2 },
  path: { lift: 0.14, polygonOffsetFactor: -3, polygonOffsetUnits: -6, renderOrder: 3 },
  local: { lift: 0.17, polygonOffsetFactor: -4, polygonOffsetUnits: -8, renderOrder: 4 },
  arterial: { lift: 0.2, polygonOffsetFactor: -5, polygonOffsetUnits: -10, renderOrder: 5 },
  rail: { lift: 0.24, polygonOffsetFactor: -6, polygonOffsetUnits: -12, renderOrder: 6 },
  building: { lift: 0.03, polygonOffsetFactor: -2, polygonOffsetUnits: -4, renderOrder: 8 },
} as const satisfies Record<string, SurfaceLayer>;

/** Extra lift so overlapping polygons in one layer are not the same plane. Stays under the next layer. */
export function overlapLift(index: number): number {
  return (Math.abs(index) % 4) * 0.008;
}

/** Asphalt. Minor streets and footways are a step lighter than the carriageway. */
export const ROAD_COLOR: Record<RoadGrade, string> = {
  arterial: "#3a3a3a",
  local: "#4a4a4a",
  path: "#5c5c5c",
};

export const ROAD_RGB: Record<RoadGrade, { r: number; g: number; b: number }> = {
  arterial: { r: 0x3a, g: 0x3a, b: 0x3a },
  local: { r: 0x4a, g: 0x4a, b: 0x4a },
  path: { r: 0x5c, g: 0x5c, b: 0x5c },
};

export function roadGradeLayer(grade: RoadGrade | undefined): SurfaceLayer {
  if (grade === "arterial") return SURFACE.arterial;
  if (grade === "path") return SURFACE.path;
  return SURFACE.local;
}

export function roadStroke(grade: RoadGrade | undefined): string {
  if (grade === "arterial") return ROAD_COLOR.arterial;
  if (grade === "path") return ROAD_COLOR.path;
  return ROAD_COLOR.local;
}

export function hexRgb(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}
