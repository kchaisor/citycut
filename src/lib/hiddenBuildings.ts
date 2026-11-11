import type { BuildingFeat, LonLat } from "../types";
import {
  matchOverridesToBuildings,
  overrideFromBuilding,
  type HeightOverride,
  type KeyValueStore,
} from "./heightOverrides";

export const HIDDEN_BUILDINGS_STORAGE_KEY = "citycut.hiddenBuildings";
export const HIDDEN_BUILDINGS_VERSION = 1 as const;

export type HiddenBuilding = Omit<HeightOverride, "heightM"> & {
  label?: string;
};

export type HiddenBuildingStore = {
  v: typeof HIDDEN_BUILDINGS_VERSION;
  hidden: HiddenBuilding[];
};

export function emptyHiddenStore(): HiddenBuildingStore {
  return { v: HIDDEN_BUILDINGS_VERSION, hidden: [] };
}

export function parseStoredHiddenBuildings(raw: string | null): HiddenBuildingStore {
  if (!raw) return emptyHiddenStore();
  try {
    const data = JSON.parse(raw) as Partial<HiddenBuildingStore>;
    if (data.v !== HIDDEN_BUILDINGS_VERSION || !Array.isArray(data.hidden)) return emptyHiddenStore();
    return {
      v: HIDDEN_BUILDINGS_VERSION,
      hidden: data.hidden.filter(
        (item): item is HiddenBuilding =>
          item != null &&
          Array.isArray(item.centroid) &&
          item.centroid.length === 2 &&
          Number.isFinite(item.centroid[0]) &&
          Number.isFinite(item.centroid[1]) &&
          Number.isFinite(item.areaM2),
      ),
    };
  } catch {
    return emptyHiddenStore();
  }
}

export function readStoredHiddenBuildings(storage: KeyValueStore): HiddenBuildingStore {
  try {
    return parseStoredHiddenBuildings(storage.getItem(HIDDEN_BUILDINGS_STORAGE_KEY));
  } catch {
    return emptyHiddenStore();
  }
}

export function writeStoredHiddenBuildings(storage: KeyValueStore, store: HiddenBuildingStore): void {
  try {
    storage.setItem(HIDDEN_BUILDINGS_STORAGE_KEY, JSON.stringify(store));
  } catch {
  }
}

function asOverride(item: HiddenBuilding, index: number): HeightOverride {
  return { ...item, heightM: 0, _i: index } as HeightOverride;
}

export function matchHiddenBuildings(
  buildings: BuildingFeat[],
  store: HiddenBuildingStore,
  origin: LonLat,
): Map<number, HiddenBuilding> {
  const out = new Map<number, HiddenBuilding>();
  if (store.hidden.length === 0) return out;
  const { matched } = matchOverridesToBuildings(buildings, store.hidden.map(asOverride), origin);
  for (const [id, override] of matched) {
    out.set(id, store.hidden[(override as HeightOverride & { _i: number })._i]!);
  }
  return out;
}

/**
 * One rule for the 3D view, 2D drawings, plan/figure/view .ai, .3dm and PNG: hidden buildings drop out.
 * Returns the same array when nothing is hidden, so exports stay byte-identical.
 */
export function filterHiddenBuildings(buildings: BuildingFeat[], hiddenIds: ReadonlySet<number>): BuildingFeat[] {
  if (hiddenIds.size === 0) return buildings;
  const kept = buildings.filter((building) => !hiddenIds.has(building.id));
  return kept.length === buildings.length ? buildings : kept;
}

function sameBuilding(a: HiddenBuilding, b: HiddenBuilding): boolean {
  if (a.overtureId && b.overtureId) return a.overtureId === b.overtureId;
  return (
    Math.abs(a.centroid[0] - b.centroid[0]) < 1e-7 &&
    Math.abs(a.centroid[1] - b.centroid[1]) < 1e-7 &&
    Math.abs(a.areaM2 - b.areaM2) < 0.01
  );
}

export function hideBuildings(
  store: HiddenBuildingStore,
  buildings: BuildingFeat[],
  origin: LonLat,
  setAt = new Date().toISOString(),
): HiddenBuildingStore {
  const hidden = [...store.hidden];
  for (const building of buildings) {
    const { heightM: _drop, ...entry } = overrideFromBuilding(building, origin, Math.max(1, building.height), setAt);
    const label = building.overtureName || `${building.use} · ${building.height.toFixed(1)} m`;
    if (!hidden.some((item) => sameBuilding(item, entry))) hidden.push({ ...entry, label });
  }
  return { v: HIDDEN_BUILDINGS_VERSION, hidden };
}

export function showHiddenEntry(store: HiddenBuildingStore, entry: HiddenBuilding): HiddenBuildingStore {
  return { v: HIDDEN_BUILDINGS_VERSION, hidden: store.hidden.filter((item) => item !== entry) };
}

export function showAllInCut(store: HiddenBuildingStore, matched: Iterable<HiddenBuilding>): HiddenBuildingStore {
  const drop = new Set(matched);
  return { v: HIDDEN_BUILDINGS_VERSION, hidden: store.hidden.filter((item) => !drop.has(item)) };
}
