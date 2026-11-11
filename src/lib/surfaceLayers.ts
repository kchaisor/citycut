import type { RoadGrade } from "../types";
import { getColour, type ColourKey } from "./colours";

export type SurfaceLayer = {
  lift: number;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
  renderOrder: number;
};

export const SURFACE = {
  terrain: { lift: 0, polygonOffsetFactor: 1, polygonOffsetUnits: 1, renderOrder: 0 },
  ground: { lift: 0, polygonOffsetFactor: 1, polygonOffsetUnits: 1, renderOrder: 0 },
  block: { lift: 0.02, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1, renderOrder: 0.5 },
  green: { lift: 0.045, polygonOffsetFactor: -1, polygonOffsetUnits: -2, renderOrder: 1 },
  water: { lift: 0.09, polygonOffsetFactor: -2, polygonOffsetUnits: -4, renderOrder: 2 },
  path: { lift: 0.14, polygonOffsetFactor: 0, polygonOffsetUnits: 0, renderOrder: 3 },
  local: { lift: 0.17, polygonOffsetFactor: 0, polygonOffsetUnits: 0, renderOrder: 4 },
  arterial: { lift: 0.2, polygonOffsetFactor: 0, polygonOffsetUnits: 0, renderOrder: 5 },
  rail: { lift: 0.24, polygonOffsetFactor: 0, polygonOffsetUnits: 0, renderOrder: 6 },
  building: { lift: 0.03, polygonOffsetFactor: -2, polygonOffsetUnits: -4, renderOrder: 8 },
} as const satisfies Record<string, SurfaceLayer>;

export function overlapLift(index: number): number {
  return (Math.abs(index) % 4) * 0.008;
}

const ROAD_KEYS = {
  arterial: "--road-arterial",
  local: "--road-local",
  path: "--road-path",
} as const satisfies Record<RoadGrade, ColourKey>;

export const ROAD_COLOR: Record<RoadGrade, string> = {
  get arterial() {
    return getColour(ROAD_KEYS.arterial);
  },
  get local() {
    return getColour(ROAD_KEYS.local);
  },
  get path() {
    return getColour(ROAD_KEYS.path);
  },
};

export const ROAD_RGB: Record<RoadGrade, { r: number; g: number; b: number }> = {
  get arterial() {
    return hexRgb(ROAD_COLOR.arterial);
  },
  get local() {
    return hexRgb(ROAD_COLOR.local);
  },
  get path() {
    return hexRgb(ROAD_COLOR.path);
  },
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
