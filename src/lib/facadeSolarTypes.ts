import type { Vec3 } from "./solar";

export const FACADE_BAY_WIDTH_M = 3;
export const FACADE_WALL_OFFSET_M = 0.1;
export const FACADE_SILL_ABOVE_FLOOR_M = 1;
export const FACADE_STOREY_HEIGHT_M = 3.1;
export const FACADE_PODIUM_GRID_M = 2;

export type FacadeUnitKind = "facade-bay" | "podium-receptor";

export type FacadeUnitSample = {
  id: string;
  kind: FacadeUnitKind;
  buildingId: number;
  floor: number;
  east: number;
  north: number;
  yM: number;
  outwardEast: number;
  outwardNorth: number;
};

export type FacadeUnitResult = {
  id: string;
  kind: FacadeUnitKind;
  buildingId: number;
  floor: number;
  hoursDirect: number;
  meetsThreshold: boolean;
  none: boolean;
};

export type FacadeSolarRuleId = "nsw-adg-4a1" | "vic-d8-b37-podium";

export type FacadeAssessSummary = {
  ruleId: FacadeSolarRuleId;
  ruleLabel: string;
  proxyNote: string;
  unitCount: number;
  thresholdHours: number;
  pctAtThreshold: number;
  pctNone: number;
  pass: boolean;
  statusNote: string;
  assessMs: number;
  units: FacadeUnitResult[];
};

export type FacadeAssessBundle = {
  facade: FacadeAssessSummary | null;
  podium: FacadeAssessSummary | null;
  assessMs: number;
};

export function planToWorld(east: number, north: number, yM: number): Vec3 {
  return [east, yM, -north];
}

export function worldOutward3(outwardEast: number, outwardNorth: number): Vec3 {
  const len = Math.hypot(outwardEast, outwardNorth) || 1;
  return [outwardEast / len, 0, -outwardNorth / len];
}
