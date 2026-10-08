import { fromLocal, openRing, signedArea } from "./geo";
import { clampBuildingHeight } from "./height";
import type { BuildingFeat, LonLat } from "../types";
import { effectiveBuildingHeightM, heightTierLabel, inferHeightTier } from "./buildingHeightResolve";

export const HEIGHT_OVERRIDES_STORAGE_KEY = "citycut.heightOverrides";
export const SHOW_MANUAL_HEIGHTS_STORAGE_KEY = "citycut.showManualHeights";

export const HEIGHT_OVERRIDES_VERSION = 1 as const;

export type HeightOverride = {
  overtureId?: string;
  osmWayIds?: number[];
  /** Footprint centroid in WGS84. */
  centroid: [number, number];
  areaM2: number;
  heightM: number;
  setAt: string;
};

export type HeightOverrideStore = {
  v: typeof HEIGHT_OVERRIDES_VERSION;
  overrides: HeightOverride[];
};

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type MatchOverridesResult = {
  /** Building id → override that applies to it. */
  matched: Map<number, HeightOverride>;
  /** Overrides with no building in this frame. */
  unmatchedCount: number;
};

const CENTROID_MAX_M = 2;
const AREA_TOLERANCE = 0.15;

export function footprintCentroidLonLat(building: BuildingFeat, origin: LonLat): [number, number] {
  const ring = openRing(building.ring);
  if (ring.length === 0) return [origin.lon, origin.lat];
  let east = 0;
  let north = 0;
  for (const [x, y] of ring) {
    east += x;
    north += y;
  }
  east /= ring.length;
  north /= ring.length;
  const { lon, lat } = fromLocal([east, north], origin);
  return [lon, lat];
}

export function footprintAreaM2(building: BuildingFeat): number {
  return Math.abs(signedArea(openRing(building.ring)));
}

export function overrideFromBuilding(
  building: BuildingFeat,
  origin: LonLat,
  heightM: number,
  setAt = new Date().toISOString(),
): HeightOverride {
  return {
    overtureId: building.overtureId,
    osmWayIds: building.osmWayIds?.length ? [...building.osmWayIds] : undefined,
    centroid: footprintCentroidLonLat(building, origin),
    areaM2: footprintAreaM2(building),
    heightM: clampBuildingHeight(heightM),
    setAt,
  };
}

export function parseStoredHeightOverrides(raw: string | null): HeightOverrideStore {
  if (!raw) return { v: HEIGHT_OVERRIDES_VERSION, overrides: [] };
  try {
    const data = JSON.parse(raw) as Partial<HeightOverrideStore>;
    if (data.v !== HEIGHT_OVERRIDES_VERSION || !Array.isArray(data.overrides)) {
      return { v: HEIGHT_OVERRIDES_VERSION, overrides: [] };
    }
    const overrides: HeightOverride[] = [];
    for (const item of data.overrides) {
      if (!item || typeof item !== "object") continue;
      const heightM = Number((item as HeightOverride).heightM);
      const areaM2 = Number((item as HeightOverride).areaM2);
      const centroid = (item as HeightOverride).centroid;
      if (!Array.isArray(centroid) || centroid.length !== 2) continue;
      if (!Number.isFinite(heightM) || !Number.isFinite(areaM2)) continue;
      const lon = Number(centroid[0]);
      const lat = Number(centroid[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      overrides.push({
        overtureId: typeof (item as HeightOverride).overtureId === "string" ? (item as HeightOverride).overtureId : undefined,
        osmWayIds: Array.isArray((item as HeightOverride).osmWayIds)
          ? (item as HeightOverride).osmWayIds!.filter((id) => Number.isFinite(id))
          : undefined,
        centroid: [lon, lat],
        areaM2,
        heightM: clampBuildingHeight(heightM),
        setAt: typeof (item as HeightOverride).setAt === "string" ? (item as HeightOverride).setAt : new Date(0).toISOString(),
      });
    }
    return { v: HEIGHT_OVERRIDES_VERSION, overrides };
  } catch {
    return { v: HEIGHT_OVERRIDES_VERSION, overrides: [] };
  }
}

export function readStoredHeightOverrides(storage: KeyValueStore): HeightOverrideStore {
  try {
    return parseStoredHeightOverrides(storage.getItem(HEIGHT_OVERRIDES_STORAGE_KEY));
  } catch {
    return { v: HEIGHT_OVERRIDES_VERSION, overrides: [] };
  }
}

export function writeStoredHeightOverrides(storage: KeyValueStore, store: HeightOverrideStore): void {
  try {
    storage.setItem(HEIGHT_OVERRIDES_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private mode can reject localStorage.
  }
}

export function readStoredShowManualHeights(storage: KeyValueStore): boolean {
  try {
    const raw = storage.getItem(SHOW_MANUAL_HEIGHTS_STORAGE_KEY);
    if (raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function writeStoredShowManualHeights(storage: KeyValueStore, show: boolean): void {
  try {
    storage.setItem(SHOW_MANUAL_HEIGHTS_STORAGE_KEY, show ? "true" : "false");
  } catch {
    // Private mode can reject localStorage.
  }
}

function overridesEqual(a: HeightOverride, b: HeightOverride): boolean {
  if (a.overtureId && b.overtureId && a.overtureId === b.overtureId) return true;
  if (a.osmWayIds?.length && b.osmWayIds?.length) {
    const setB = new Set(b.osmWayIds);
    if (a.osmWayIds.some((id) => setB.has(id))) return true;
  }
  const dLon = (a.centroid[0] - b.centroid[0]) * 111_320 * Math.cos((a.centroid[1] * Math.PI) / 180);
  const dLat = (a.centroid[1] - b.centroid[1]) * 111_132;
  if (Math.hypot(dLon, dLat) > CENTROID_MAX_M) return false;
  const ref = Math.max(a.areaM2, b.areaM2, 1);
  return Math.abs(a.areaM2 - b.areaM2) / ref <= AREA_TOLERANCE;
}

/** Merge imported overrides into an existing store, replacing duplicates. */
export function mergeHeightOverrideStores(
  base: HeightOverrideStore,
  incoming: HeightOverrideStore,
): HeightOverrideStore {
  const overrides = [...base.overrides];
  for (const item of incoming.overrides) {
    const index = overrides.findIndex((existing) => overridesEqual(existing, item));
    if (index >= 0) overrides[index] = item;
    else overrides.push(item);
  }
  return { v: HEIGHT_OVERRIDES_VERSION, overrides };
}

export function exportHeightOverridesJson(store: HeightOverrideStore): string {
  return JSON.stringify(store, null, 2);
}

export function importHeightOverridesJson(raw: string): HeightOverrideStore {
  return parseStoredHeightOverrides(raw);
}

function osmIdsOverlap(a?: number[], b?: number[]): boolean {
  if (!a?.length || !b?.length) return false;
  const set = new Set(b);
  return a.some((id) => set.has(id));
}

function centroidDistanceM(centroid: [number, number], building: BuildingFeat, origin: LonLat): number {
  const [lon, lat] = footprintCentroidLonLat(building, origin);
  const dLon = (centroid[0] - lon) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const dLat = (centroid[1] - lat) * 111_132;
  return Math.hypot(dLon, dLat);
}

function areaWithinTolerance(areaM2: number, building: BuildingFeat): boolean {
  const area = footprintAreaM2(building);
  const ref = Math.max(areaM2, area, 1);
  return Math.abs(areaM2 - area) / ref <= AREA_TOLERANCE;
}

/** Match each override to at most one building and each building to at most one override. */
export function matchOverridesToBuildings(
  buildings: BuildingFeat[],
  overrides: HeightOverride[],
  origin: LonLat,
): MatchOverridesResult {
  const matched = new Map<number, HeightOverride>();
  const usedBuildings = new Set<number>();
  let unmatchedCount = 0;

  for (const override of overrides) {
    let pick: BuildingFeat | null = null;

    if (override.overtureId) {
      pick = buildings.find((b) => !usedBuildings.has(b.id) && b.overtureId === override.overtureId) ?? null;
    }

    if (!pick && override.osmWayIds?.length) {
      pick =
        buildings.find(
          (b) => !usedBuildings.has(b.id) && osmIdsOverlap(b.osmWayIds, override.osmWayIds),
        ) ?? null;
    }

    if (!pick) {
      let bestDist = CENTROID_MAX_M + 1;
      for (const building of buildings) {
        if (usedBuildings.has(building.id)) continue;
        if (!areaWithinTolerance(override.areaM2, building)) continue;
        const dist = centroidDistanceM(override.centroid, building, origin);
        if (dist <= CENTROID_MAX_M && dist < bestDist) {
          bestDist = dist;
          pick = building;
        }
      }
    }

    if (pick) {
      matched.set(pick.id, override);
      usedBuildings.add(pick.id);
    } else {
      unmatchedCount += 1;
    }
  }

  return { matched, unmatchedCount };
}

export function applyOverrideToBuilding(building: BuildingFeat, heightM: number): BuildingFeat {
  const height = clampBuildingHeight(heightM);
  return {
    ...building,
    height,
    heightManual: true,
    heightFromFallback: undefined,
    heightTier: "manual",
    zoneDefaultNote: undefined,
    extrusionParts: undefined,
  };
}

export function applyHeightOverrides(
  buildings: BuildingFeat[],
  store: HeightOverrideStore,
  origin: LonLat,
): { buildings: BuildingFeat[]; unmatchedCount: number; manualCount: number } {
  const { matched, unmatchedCount } = matchOverridesToBuildings(buildings, store.overrides, origin);
  if (matched.size === 0) {
    return { buildings, unmatchedCount, manualCount: 0 };
  }
  const next = buildings.map((building) => {
    const override = matched.get(building.id);
    if (!override) return building;
    return applyOverrideToBuilding(building, override.heightM);
  });
  return { buildings: next, unmatchedCount, manualCount: matched.size };
}

export function upsertOverrideForBuilding(
  store: HeightOverrideStore,
  building: BuildingFeat,
  origin: LonLat,
  heightM: number,
): HeightOverrideStore {
  const next = overrideFromBuilding(building, origin, heightM);
  const overrides = store.overrides.filter((item) => !overridesEqual(item, next));
  overrides.push(next);
  return { v: HEIGHT_OVERRIDES_VERSION, overrides };
}

export function removeOverrideForBuilding(
  store: HeightOverrideStore,
  building: BuildingFeat,
  origin: LonLat,
): HeightOverrideStore {
  const probe = overrideFromBuilding(building, origin, building.height);
  return {
    v: HEIGHT_OVERRIDES_VERSION,
    overrides: store.overrides.filter((item) => !overridesEqual(item, probe)),
  };
}

export function clearAllHeightOverrides(): HeightOverrideStore {
  return { v: HEIGHT_OVERRIDES_VERSION, overrides: [] };
}

export type BuildingHeightSource = "manual" | "melbourne" | "zone_default" | "overture" | "development" | "lidar";

export function buildingHeightSource(building: BuildingFeat): BuildingHeightSource {
  const tier = inferHeightTier(building);
  if (tier === "manual") return "manual";
  if (tier === "com") return "melbourne";
  if (tier === "lidar") return "lidar";
  if (tier === "development_floors") return "development";
  if (tier === "zone_default") return "zone_default";
  return "overture";
}

export function buildingHeightSourceLabel(source: BuildingHeightSource): string {
  switch (source) {
    case "manual":
      return "Manual edit";
    case "zone_default":
      return "Zone default";
    case "melbourne":
      return "City of Melbourne";
    case "development":
      return "CoM development floors";
    case "lidar":
      return "LiDAR (ELVIS)";
    default:
      return "Overture (height or floors)";
  }
}

export function buildingHeightSourceLabelForBuilding(building: BuildingFeat): string {
  const tier = inferHeightTier(building);
  return heightTierLabel(tier, {
    tier,
    zoneDefaultNote: building.zoneDefaultNote,
    recordedFloors: building.developmentFloors ?? building.numFloors,
  });
}

export function buildingDisplayHeightM(building: BuildingFeat): number {
  return effectiveBuildingHeightM(building);
}

export function manualHeightCreditFragment(count: number): string | null {
  if (count <= 0) return null;
  return `includes ${count} manual height edit${count === 1 ? "" : "s"}`;
}

export function appendManualHeightCredit(note: string, count: number): string {
  const fragment = manualHeightCreditFragment(count);
  if (!fragment) return note;
  return `${note} ${fragment.charAt(0).toUpperCase()}${fragment.slice(1)}.`;
}

/** Stable fingerprint for cache keys and blast-radius checks. */
export function buildingHeightsFingerprint(buildings: BuildingFeat[]): string {
  const parts: string[] = [];
  for (const building of buildings) {
    parts.push(
      `${building.id}:${building.height.toFixed(4)}:${building.heightManual ? 1 : 0}:${building.extrusionParts?.length ?? 0}`,
    );
  }
  return parts.join("|");
}
