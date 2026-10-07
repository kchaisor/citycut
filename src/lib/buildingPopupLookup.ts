import { fromLocal } from "./geo";
import { interiorPoint } from "./useCascade";
import { vicmapWfsGetFeatureUrl } from "./vicmapWfs";
import { VICMAP_PROPERTY_URL } from "./vicmapSiteParcel";
import type { BuildingFeat, LonLat, Pt } from "../types";

const COM_BOUNDS = { south: -37.86, west: 144.89, north: -37.77, east: 145 };
const WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs";

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

function wfsPointQuery(typeName: string, lon: number, lat: number, propertyName: string, count = 5): string {
  const pad = 0.00008;
  return vicmapWfsGetFeatureUrl(typeName, { west: lon - pad, south: lat - pad, east: lon + pad, north: lat + pad }, {
    count,
    propertyName,
  });
}

async function lookupAddress(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const url = wfsPointQuery("open-data-platform:address", lon, lat, "ezi_address", 3);
  const body = (await fetchJson(url, signal)) as { features?: { properties?: { ezi_address?: string } }[] } | null;
  const address = body?.features?.[0]?.properties?.ezi_address;
  return typeof address === "string" && address.trim() ? address.trim() : null;
}

async function lookupClueName(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const url =
    "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/buildings-with-name-age-size-accessibility-and-bicycle-facilities/records?" +
    new URLSearchParams({
      limit: "1",
      where: `within_distance(geo_point_2d, geom'POINT(${lon} ${lat})', 40m)`,
    }).toString();
  const body = (await fetchJson(url, signal)) as { results?: { building_name?: string }[] } | null;
  const name = body?.results?.[0]?.building_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

async function lookupOverlays(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const url = wfsPointQuery("open-data-platform:plan_overlay", lon, lat, "scheme_code", 12);
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
  const body = (await fetchJson(url, signal)) as { features?: unknown[] } | null;
  return (body?.features?.length ?? 0) > 0;
}

async function lookupParcel(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const url = `${VICMAP_PROPERTY_URL}/query?f=json&geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=parcel_spi,parcel_plan_number,parcel_lot_number,Shape__Area&returnGeometry=false`;
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

async function lookupClueYears(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const url =
    "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/buildings-with-name-age-size-accessibility-and-bicycle-facilities/records?" +
    new URLSearchParams({
      limit: "5",
      order_by: "census_year desc",
      where: `within_distance(geo_point_2d, geom'POINT(${lon} ${lat})', 40m)`,
    }).toString();
  const body = (await fetchJson(url, signal)) as {
    results?: { construction_year?: number; refurbished_year?: number; census_year?: number }[];
  } | null;
  const row = body?.results?.[0];
  if (!row) return null;
  const built = row.construction_year;
  const refurbed = row.refurbished_year;
  const parts: string[] = [];
  if (typeof built === "number" && built > 1800) parts.push(`Built ${built}`);
  if (typeof refurbed === "number" && refurbed > 1800) parts.push(`Refurbished ${refurbed}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

async function lookupDevelopment(lon: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  const url =
    "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/development-activity-monitor/records?" +
    new URLSearchParams({
      limit: "1",
      where: `within_distance(geo_point_2d, geom'POINT(${lon} ${lat})', 60m)`,
    }).toString();
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

  const namePromise = (async () => {
    if (building.overtureName) return building.overtureName;
    const address = await lookupAddress(lon, lat, signal);
    if (address) return address;
    if (inCom) return await lookupClueName(lon, lat, signal);
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

  const [nameLine, zoneLine, lotLine, yearLine, developmentLine] = await Promise.all([
    namePromise,
    zonePromise,
    lookupParcel(lon, lat, signal),
    inCom ? lookupClueYears(lon, lat, signal) : Promise.resolve(null),
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
