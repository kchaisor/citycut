import { fromLocal, openRing, signedArea } from "./geo";
import { interiorPoint } from "./useCascade";
import { intersectsComCity } from "./comBuildingHeights";
import type { BBox } from "./comBuildingHeightsTypes";
import type { BuildingFeat, LonLat } from "../types";
import { applyDevelopmentFloorsHeight, buildingEligibleForDamFloors } from "./buildingHeightResolve";

const COM_EXPLORE = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets";
const DAM_SLUG = "development-activity-monitor";
const DAM_PAGE_SIZE = 100;
const MATCH_RADIUS_M = 70;

type DamRow = {
  floors_above?: number | null;
  geopoint?: { lon?: number; lat?: number } | null;
};

function damWhereIntersects(bounds: BBox): string {
  const ring = [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
    [bounds.west, bounds.south],
  ] as const;
  const coords = ring.map(([lon, lat]) => `${lon} ${lat}`).join(",");
  return `intersects(geopoint, geom'POLYGON((${coords}))')`;
}

function damRecordsUrl(bounds: BBox, offset: number): string {
  const url = new URL(`${COM_EXPLORE}/${DAM_SLUG}/records`);
  url.searchParams.set("limit", String(DAM_PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("where", damWhereIntersects(bounds));
  url.searchParams.set("select", "floors_above,geopoint");
  return url.toString();
}

export type DamFloorRecord = {
  lon: number;
  lat: number;
  floorsAbove: number;
};

export async function fetchDevelopmentFloorRecords(
  bounds: BBox,
  signal?: AbortSignal,
): Promise<DamFloorRecord[]> {
  if (!intersectsComCity(bounds)) return [];
  const out: DamFloorRecord[] = [];

  async function fetchPage(offset: number): Promise<{ total: number; rows: DamRow[] }> {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const response = await fetch(damRecordsUrl(bounds, offset), {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`CoM development records answered ${response.status}.`);
    const json = (await response.json()) as { total_count?: number; results?: DamRow[] };
    return { total: json.total_count ?? 0, rows: json.results ?? [] };
  }

  const first = await fetchPage(0);
  for (const row of first.rows) {
    pushRow(row, out);
  }
  const offsets: number[] = [];
  for (let offset = first.rows.length; offset < first.total; offset += DAM_PAGE_SIZE) {
    offsets.push(offset);
  }
  const pages = await Promise.all(offsets.map((offset) => fetchPage(offset)));
  for (const page of pages) {
    for (const row of page.rows) {
      pushRow(row, out);
    }
  }
  return out;
}

function pushRow(row: DamRow, out: DamFloorRecord[]): void {
  const floors = row.floors_above;
  if (typeof floors !== "number" || !(floors > 0)) return;
  const point = row.geopoint;
  const lon = point?.lon;
  const lat = point?.lat;
  if (typeof lon !== "number" || typeof lat !== "number") return;
  out.push({ lon, lat, floorsAbove: floors });
}

function distanceM(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const dLon = (aLon - bLon) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  const dLat = (aLat - bLat) * 111_132;
  return Math.hypot(dLon, dLat);
}

export function footprintAreaM2(building: BuildingFeat): number {
  return Math.abs(signedArea(openRing(building.ring)));
}

function buildingLonLat(building: BuildingFeat, center: LonLat): { lon: number; lat: number } {
  const at = interiorPoint(building.ring, building.holes);
  return fromLocal(at, center);
}

/** Buildings within {@link MATCH_RADIUS_M} of a DAM point that still qualify for DAM height. */
export function buildingsEligibleNearDamRecord(
  buildings: BuildingFeat[],
  center: LonLat,
  record: DamFloorRecord,
): BuildingFeat[] {
  const eligible: BuildingFeat[] = [];
  for (const building of buildings) {
    if (!buildingEligibleForDamFloors(building)) continue;
    const { lon, lat } = buildingLonLat(building, center);
    if (distanceM(lon, lat, record.lon, record.lat) <= MATCH_RADIUS_M) {
      eligible.push(building);
    }
  }
  return eligible;
}

/** Pick one building per DAM record: largest footprint among eligible neighbours. */
/** DAM records for which this building is the largest eligible neighbour (height-tier winner). */
export function damRecordsWonByBuilding(
  building: BuildingFeat,
  center: LonLat,
  records: DamFloorRecord[],
  allBuildings: BuildingFeat[],
): DamFloorRecord[] {
  return records.filter((record) => pickDamFloorRecipient(allBuildings, center, record)?.id === building.id);
}

export function pickDamFloorRecipient(
  buildings: BuildingFeat[],
  center: LonLat,
  record: DamFloorRecord,
): BuildingFeat | null {
  const eligible = buildingsEligibleNearDamRecord(buildings, center, record);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, b) =>
    footprintAreaM2(b) > footprintAreaM2(best) ? b : best,
  );
}

/** @deprecated use pickDamFloorRecipient — nearest match (old behaviour). */
export function matchDevelopmentFloorsToBuilding(
  building: BuildingFeat,
  center: LonLat,
  records: DamFloorRecord[],
): number | null {
  const { lon, lat } = buildingLonLat(building, center);
  let best: number | null = null;
  let bestDist = MATCH_RADIUS_M + 1;
  for (const row of records) {
    const dist = distanceM(lon, lat, row.lon, row.lat);
    if (dist <= MATCH_RADIUS_M && dist < bestDist) {
      bestDist = dist;
      best = row.floorsAbove;
    }
  }
  return best;
}

export function applyDevelopmentFloorsToBuildings(
  buildings: BuildingFeat[],
  center: LonLat,
  records: DamFloorRecord[],
): BuildingFeat[] {
  if (records.length === 0) return buildings;
  const byId = new Map(buildings.map((b) => [b.id, b]));
  for (const record of records) {
    const recipient = pickDamFloorRecipient(buildings, center, record);
    if (!recipient) continue;
    const current = byId.get(recipient.id);
    if (!current) continue;
    byId.set(recipient.id, applyDevelopmentFloorsHeight(current, record.floorsAbove));
  }
  return buildings.map((b) => byId.get(b.id) ?? b);
}

/** Legacy: every eligible building within radius gets the nearest DAM floors (over-assigns). */
export function applyDevelopmentFloorsToBuildingsLegacy(
  buildings: BuildingFeat[],
  center: LonLat,
  records: DamFloorRecord[],
): BuildingFeat[] {
  if (records.length === 0) return buildings;
  return buildings.map((building) => {
    const floors = matchDevelopmentFloorsToBuilding(building, center, records);
    if (floors == null) return building;
    return applyDevelopmentFloorsHeight(building, floors);
  });
}

export type DamMultiAssignStats = {
  /** DAM records where more than one building received the same floor height (legacy). */
  recordsWithMultipleBuildings: number;
};

function damRecordKey(record: DamFloorRecord): string {
  return `${record.lon.toFixed(5)},${record.lat.toFixed(5)},${record.floorsAbove}`;
}

/** Count DAM records that would lift more than one building (legacy vs current). */
export function countDamMultiBuildingAssignments(
  buildings: BuildingFeat[],
  center: LonLat,
  records: DamFloorRecord[],
  mode: "legacy" | "winner",
): DamMultiAssignStats {
  const assignments = new Map<string, Set<number>>();
  for (const record of records) {
    const key = damRecordKey(record);
    if (!assignments.has(key)) assignments.set(key, new Set());
    if (mode === "legacy") {
      for (const building of buildings) {
        if (!buildingEligibleForDamFloors(building)) continue;
        const { lon, lat } = buildingLonLat(building, center);
        if (distanceM(lon, lat, record.lon, record.lat) <= MATCH_RADIUS_M) {
          assignments.get(key)!.add(building.id);
        }
      }
    } else {
      const recipient = pickDamFloorRecipient(buildings, center, record);
      if (recipient) assignments.get(key)!.add(recipient.id);
    }
  }
  let recordsWithMultipleBuildings = 0;
  for (const ids of assignments.values()) {
    if (ids.size > 1) recordsWithMultipleBuildings += 1;
  }
  return { recordsWithMultipleBuildings };
}
