import { fromLocal, toLocal } from "./geo";
import { interiorPoint, pointInPolygon } from "./useCascade";
import { vicmapWfsGetFeatureUrl } from "./vicmapWfs";
import { VICMAP_PROPERTY_URL } from "./vicmapSiteParcel";
import type { BuildingFeat, LonLat, Pt } from "../types";
import type { FrameBBox } from "./useCascade";

const COM_BOUNDS = { south: -37.86, west: 144.89, north: -37.77, east: 145 };
const WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs";
const COM_EXPLORE = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets";
const CLUE_SLUG = "buildings-with-name-age-size-accessibility-and-bicycle-facilities";
const DAM_SLUG = "development-activity-monitor";

export function isCityOfMelbourne(lat: number, lon: number): boolean {
  return lat >= COM_BOUNDS.south && lat <= COM_BOUNDS.north && lon >= COM_BOUNDS.west && lon <= COM_BOUNDS.east;
}

export type BuildingPopupDetails = {
  useLine: string;
  nameLine: string;
  heightStoreysLine: string;
  zoneLine: string;
  lotLine: string;
  yearLine: string;
  developmentLine: string;
  credits: string[];
};

const EMPTY: BuildingPopupDetails = {
  useLine: "—",
  nameLine: "—",
  heightStoreysLine: "—",
  zoneLine: "—",
  lotLine: "—",
  yearLine: "—",
  developmentLine: "—",
  credits: [],
};

function useSourceLabel(source: BuildingFeat["source"]): string {
  if (source === "osm_tag") return "Overture class";
  if (source === "zone") return "Vicmap zone";
  return "—";
}

function buildingLabel(building: BuildingFeat): string {
  return building.use.replace(/_/g, " ");
}

function logPopupUrl(label: string, url: string) {
  if (typeof console !== "undefined") console.info(`[CityCut popup] ${label}: ${url}`);
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function pointFromBuilding(building: BuildingFeat): Pt {
  return interiorPoint(building.ring, building.holes);
}

function buildingLonLatBounds(building: BuildingFeat, center: LonLat): FrameBBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const pt of building.ring) {
    const { lon, lat } = fromLocal(pt, center);
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  const pad = 0.00005;
  return { west: west - pad, south: south - pad, east: east + pad, north: north + pad };
}

function comRecordsUrl(slug: string, where: string, orderBy?: string, limit = 10): string {
  const url = new URL(`${COM_EXPLORE}/${slug}/records`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("where", where);
  if (orderBy) url.searchParams.set("order_by", orderBy);
  return url.toString();
}

type ClueRow = {
  census_year?: string;
  building_name?: string | null;
  street_address?: string | null;
  construction_year?: string | number | null;
  refurbished_year?: string | number | null;
  longitude?: number;
  latitude?: number;
};

function parseYear(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && value > 1800) return value;
  if (typeof value === "string" && value.trim()) {
    const year = Number.parseInt(value.slice(0, 4), 10);
    if (year > 1800) return year;
  }
  return null;
}

function clueRowMatchesBuilding(row: ClueRow, building: BuildingFeat, center: LonLat): boolean {
  if (!Number.isFinite(row.longitude) || !Number.isFinite(row.latitude)) return false;
  const at = toLocal(row.latitude as number, row.longitude as number, center);
  return pointInPolygon(at, building.ring, building.holes);
}

function pickClueRow(rows: ClueRow[], building: BuildingFeat, center: LonLat): ClueRow | null {
  const matches = rows.filter((row) => clueRowMatchesBuilding(row, building, center));
  if (matches.length === 0) return null;
  matches.sort((a, b) => String(b.census_year ?? "").localeCompare(String(a.census_year ?? "")));
  return matches[0] ?? null;
}

async function lookupAddress(
  building: BuildingFeat,
  center: LonLat,
  signal?: AbortSignal,
): Promise<string | null> {
  const bounds = buildingLonLatBounds(building, center);
  const url = vicmapWfsGetFeatureUrl("open-data-platform:address", bounds, {
    count: 12,
    propertyName: "ezi_address",
  });
  logPopupUrl("Vicmap address", url);
  const body = (await fetchJson(url, signal)) as {
    features?: { geometry?: { coordinates?: number[] }; properties?: { ezi_address?: string } }[];
  } | null;
  const features = body?.features ?? [];
  const anchor = pointFromBuilding(building);
  let best: { address: string; dist: number } | null = null;
  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    const address = feature.properties?.ezi_address;
    if (!coords || coords.length < 2 || typeof address !== "string" || !address.trim()) continue;
    const lon = coords[0]!;
    const lat = coords[1]!;
    const at = toLocal(lat, lon, center);
    const inside = pointInPolygon(at, building.ring, building.holes);
    const dist = Math.hypot(at[0] - anchor[0], at[1] - anchor[1]);
    if (inside) return address.trim();
    if (!best || dist < best.dist) best = { address: address.trim(), dist };
  }
  if (best && best.dist < 35) return best.address;
  return null;
}

async function lookupClueRows(lon: number, lat: number, signal?: AbortSignal): Promise<ClueRow[]> {
  const where = `within_distance(location, geom'POINT(${lon} ${lat})', 50m)`;
  const url = comRecordsUrl(CLUE_SLUG, where, "census_year desc", 15);
  logPopupUrl("CoM CLUE", url);
  const body = (await fetchJson(url, signal)) as { results?: ClueRow[] } | null;
  return body?.results ?? [];
}

async function lookupOverlays(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const pad = 0.00008;
  const url = vicmapWfsGetFeatureUrl(
    "open-data-platform:plan_overlay",
    { west: lon - pad, south: lat - pad, east: lon + pad, north: lat + pad },
    { count: 12, propertyName: "scheme_code" },
  );
  logPopupUrl("Vicmap overlays", url);
  const body = (await fetchJson(url, signal)) as { features?: { properties?: { scheme_code?: string } }[] } | null;
  const codes = (body?.features ?? [])
    .map((feature) => feature.properties?.scheme_code)
    .filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    .map((code) => code.trim());
  if (codes.length === 0) return null;
  const heritage = codes.some((code) => code.toUpperCase().startsWith("HO"));
  const list = [...new Set(codes)].slice(0, 6).join(", ");
  return heritage ? `${list} (heritage)` : list;
}

async function lookupHeritage(lon: number, lat: number, signal?: AbortSignal): Promise<boolean> {
  const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=open-data-platform:heritage_register&outputFormat=application/json&srsName=EPSG:4326&count=1&bbox=${lon},${lat},${lon},${lat},EPSG:4326`;
  logPopupUrl("Heritage register", url);
  const body = (await fetchJson(url, signal)) as { features?: unknown[] } | null;
  return (body?.features?.length ?? 0) > 0;
}

async function lookupParcel(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const url = `${VICMAP_PROPERTY_URL}/query?f=json&geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=parcel_spi,parcel_plan_number,parcel_lot_number,Shape__Area&returnGeometry=false`;
  logPopupUrl("Vicmap parcel", url);
  const body = (await fetchJson(url, signal)) as {
    features?: { attributes?: Record<string, unknown> }[];
  } | null;
  const attrs = body?.features?.[0]?.attributes;
  if (!attrs) return null;
  const spi = attrs.parcel_spi ?? attrs.PARCEL_SPI;
  const plan = attrs.parcel_plan_number ?? attrs.PARCEL_PLAN_NUMBER;
  const lot = attrs.parcel_lot_number ?? attrs.PARCEL_LOT_NUMBER;
  const area = attrs.Shape__Area ?? attrs.shape__area;
  const parts: string[] = [];
  if (typeof spi === "string" && spi.trim()) parts.push(spi.trim());
  else {
    if (plan != null && String(plan).trim()) parts.push(`Plan ${String(plan).trim()}`);
    if (lot != null && String(lot).trim()) parts.push(`Lot ${String(lot).trim()}`);
  }
  if (typeof area === "number" && Number.isFinite(area)) parts.push(`${Math.round(area)} m² site`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatClueYears(row: ClueRow | null): string | null {
  if (!row) return null;
  const built = parseYear(row.construction_year);
  const refurbed = parseYear(row.refurbished_year);
  const parts: string[] = [];
  if (built != null) parts.push(`Built ${built}`);
  if (refurbed != null) parts.push(`Refurbished ${refurbed}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatClueName(row: ClueRow | null): string | null {
  if (!row) return null;
  const name = row.building_name?.trim();
  if (name) return name;
  const address = row.street_address?.trim();
  return address || null;
}

async function lookupDevelopment(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const where = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 70m)`;
  const url = comRecordsUrl(DAM_SLUG, where, undefined, 5);
  logPopupUrl("CoM development", url);
  const body = (await fetchJson(url, signal)) as {
    results?: { status?: string; floors_above?: number; resi_dwellings?: number }[];
  } | null;
  const row = body?.results?.[0];
  if (!row) return null;
  const parts: string[] = [];
  if (typeof row.status === "string" && row.status.trim()) parts.push(row.status.trim());
  if (typeof row.floors_above === "number") parts.push(`${row.floors_above} floors`);
  if (typeof row.resi_dwellings === "number") parts.push(`${row.resi_dwellings} dwellings`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export async function loadBuildingPopupDetails(
  building: BuildingFeat,
  center: LonLat,
  signal?: AbortSignal,
): Promise<BuildingPopupDetails> {
  const at = pointFromBuilding(building);
  const { lon, lat } = fromLocal(at, center);
  const inCom = isCityOfMelbourne(lat, lon);

  const useLine = `${buildingLabel(building)} · ${useSourceLabel(building.source)}`;

  const heightSource = building.heightManual
    ? "Manual edit"
    : building.heightFromFallback
      ? "Zone default"
      : building.numFloors != null
        ? "Overture num_floors"
        : "Overture height";
  const storeys =
    building.numFloors != null
      ? `${building.numFloors} storeys`
      : building.height > 0
        ? `~${Math.max(1, Math.round(building.height / 3))} storeys (est.)`
        : null;
  const heightStoreysLine = `${building.height.toFixed(1)} m${storeys ? ` · ${storeys}` : ""} · ${heightSource}`;

  const clueRowsPromise = inCom ? lookupClueRows(lon, lat, signal) : Promise.resolve([]);

  const namePromise = (async () => {
    if (building.overtureName) return building.overtureName;
    const address = await lookupAddress(building, center, signal);
    if (address) return address;
    if (inCom) {
      const rows = await clueRowsPromise;
      return formatClueName(pickClueRow(rows, building, center));
    }
    return null;
  })();

  const zonePromise = (async () => {
    const zone = building.zoneCode
      ? `${building.zoneCode}${building.zoneDescription ? ` · ${building.zoneDescription}` : ""}`
      : null;
    const [overlays, heritage] = await Promise.all([
      lookupOverlays(lon, lat, signal),
      lookupHeritage(lon, lat, signal),
    ]);
    const parts: string[] = [];
    if (zone) parts.push(zone);
    if (overlays) parts.push(`Overlays: ${overlays}`);
    else if (heritage) parts.push("Heritage register");
    return parts.length > 0 ? parts.join(" · ") : null;
  })();

  const yearPromise = (async () => {
    if (!inCom) return null;
    const rows = await clueRowsPromise;
    return formatClueYears(pickClueRow(rows, building, center));
  })();

  const [nameLine, zoneLine, lotLine, yearLine, developmentLine] = await Promise.all([
    namePromise,
    zonePromise,
    lookupParcel(lon, lat, signal),
    yearPromise,
    inCom ? lookupDevelopment(lon, lat, signal) : Promise.resolve(null),
  ]);

  const credits = [
    "Building use and height: Overture Maps.",
    "Zones and overlays: Vicmap Planning.",
    "Addresses: Vicmap Address.",
    "Parcels: Vicmap Property © State of Victoria, CC BY 4.0.",
  ];
  if (inCom) credits.push("CLUE and development data: City of Melbourne.");

  return {
    useLine,
    nameLine: nameLine ?? "—",
    heightStoreysLine,
    zoneLine: zoneLine ?? "—",
    lotLine: lotLine ?? "—",
    yearLine: inCom ? yearLine ?? "—" : "",
    developmentLine: inCom ? developmentLine ?? "—" : "",
    credits,
  };
}

export function emptyBuildingPopupDetails(building: BuildingFeat): BuildingPopupDetails {
  return {
    ...EMPTY,
    useLine: `${buildingLabel(building)} · ${useSourceLabel(building.source)}`,
    heightStoreysLine: `${building.height.toFixed(1)} m · ${building.heightManual ? "Manual edit" : "—"}`,
    yearLine: "",
    developmentLine: "",
  };
}
