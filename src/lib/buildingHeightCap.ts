import { clampBuildingHeight } from "./height";
import { normaliseZoneCode } from "./buildingUse";
import type { BuildingFeat } from "../types";
import type { OvertureHeightMethod } from "./overtureHeight";

/** Max extrusion height (m) by normalised Vicmap zone. `null` means no cap. */
export const PROPOSED_ZONE_HEIGHT_CAP_M: Readonly<Record<string, number | null>> = {
  NRZ: 9,
  GRZ: 11,
  RGZ: null,
  MUZ: null,
  ACZ: null,
  CCZ: null,
  CDZ: null,
  C1Z: null,
  C2Z: 24,
  C3Z: 18,
  IN1Z: 15,
  IN2Z: 15,
  IN3Z: 15,
  PUZ: 9,
  PPRZ: 9,
  PCRZ: 9,
  LDRZ: 9,
  TZ: 12,
  UFZ: 12,
  RLZ: 12,
};

export type HeightCapMode = "all_overture" | "ml_footprint_only" | "non_osm_height";

export type HeightCapTarget = {
  heightMethod: OvertureHeightMethod;
  mlFootprintOnly: boolean;
  hasOsmWay: boolean;
};

export function zoneHeightCapM(code: string | null | undefined): number | null {
  if (!code) return 11;
  const normalised = normaliseZoneCode(code);
  if (Object.prototype.hasOwnProperty.call(PROPOSED_ZONE_HEIGHT_CAP_M, normalised)) {
    return PROPOSED_ZONE_HEIGHT_CAP_M[normalised] ?? null;
  }
  return 11;
}

export function heightCapWouldApply(mode: HeightCapMode, target: HeightCapTarget): boolean {
  if (target.heightMethod === "fallback") return false;
  if (mode === "all_overture") return true;
  if (mode === "ml_footprint_only") return target.mlFootprintOnly;
  // non_osm_height: cap ML footprints and any height/floors not from a tagged OSM way
  if (target.mlFootprintOnly) return true;
  if (!target.hasOsmWay) return true;
  return false;
}

export function applyZoneHeightCap(
  building: BuildingFeat,
  zoneCode: string | null,
  mode: HeightCapMode,
  target: HeightCapTarget,
): BuildingFeat {
  if (!heightCapWouldApply(mode, target)) return building;
  const cap = zoneHeightCapM(zoneCode);
  if (cap === null || building.height <= cap) return building;
  const height = clampBuildingHeight(cap);
  const next: BuildingFeat = { ...building, height };
  if (building.extrusionParts?.length) {
    next.extrusionParts = building.extrusionParts.map((part) => ({
      ...part,
      height: Math.max(1, height - (part.base ?? 0)),
    }));
  }
  return next;
}

export function applyZoneHeightCaps(
  buildings: BuildingFeat[],
  zoneCodes: (string | null)[],
  mode: HeightCapMode,
  targets: HeightCapTarget[],
): BuildingFeat[] {
  return buildings.map((building, index) =>
    applyZoneHeightCap(building, zoneCodes[index] ?? null, mode, targets[index]!),
  );
}
