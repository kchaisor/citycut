import { fromLocal, openRing } from "./geo";
import { interiorPoint } from "./useCascade";
import { intersectsComCity } from "./comBuildingHeights";
import type { BBox } from "./comBuildingHeightsTypes";
import type { BuildingFeat, LonLat } from "../types";
import { applyDevelopmentFloorsHeight } from "./buildingHeightResolve";

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

/** Pick the nearest DAM row within {@link MATCH_RADIUS_M} of the building interior point. */
export function matchDevelopmentFloorsToBuilding(
  building: BuildingFeat,
  center: LonLat,
  records: DamFloorRecord[],
): number | null {
  const at = interiorPoint(building.ring, building.holes);
  const { lon, lat } = fromLocal(at, center);
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
  return buildings.map((building) => {
    const floors = matchDevelopmentFloorsToBuilding(building, center, records);
    if (floors == null) return building;
    return applyDevelopmentFloorsHeight(building, floors);
  });
}

/** @internal tests */
export function buildingCentroidLonLat(building: BuildingFeat, center: LonLat): [number, number] {
  const at = interiorPoint(building.ring, building.holes);
  const { lon, lat } = fromLocal(at, center);
  return [lon, lat];
}

export function footprintAreaM2FromRing(building: BuildingFeat): number {
  const ring = openRing(building.ring);
  let twice = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(twice / 2);
}
