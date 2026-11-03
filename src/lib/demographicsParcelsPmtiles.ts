import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { EnrichmentPmtilesSource } from "./enrichmentPmtilesSource";
import { DEMOGRAPHICS_AGE_BANDS, DEMOGRAPHICS_HOUSEHOLD_TYPES, DEMOGRAPHICS_RENT_BINS } from "./demographicsTypes";
import type { DemographicsParcelRecord } from "./demographicsParcels";

const PARCELS_ZOOM = 12;

export const DEMOGRAPHICS_PARCELS_PMTILES_URL = `${import.meta.env.BASE_URL}demographics-parcels.pmtiles`;

function tileRange(bounds: { south: number; west: number; north: number; east: number }, z: number) {
  const n = 2 ** z;
  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);
  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const yFor = (lat: number) =>
    Math.floor(((1 - Math.log(Math.tan(latRad(lat)) + 1 / Math.cos(latRad(lat))) / Math.PI) / 2) * n);
  const yMin = Math.min(yFor(bounds.north), yFor(bounds.south));
  const yMax = Math.max(yFor(bounds.north), yFor(bounds.south));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

function emptyAgeRecord(): Record<string, number> {
  return Object.fromEntries(DEMOGRAPHICS_AGE_BANDS.map((band) => [band, 0]));
}

function emptyHouseholds(): Record<string, number> {
  return Object.fromEntries(DEMOGRAPHICS_HOUSEHOLD_TYPES.map((kind) => [kind, 0]));
}

function emptyRent(): Record<string, number> {
  return Object.fromEntries(DEMOGRAPHICS_RENT_BINS.map((bin) => [bin, 0]));
}

function numProp(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function recordFromGeoJson(
  feature: GeoJSON.Feature,
  id: string,
): DemographicsParcelRecord | null {
  const props = feature.properties ?? {};
  const geom = feature.geometry;
  if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) return null;
  const ringRaw =
    geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0]?.[0];
  if (!ringRaw?.length) return null;
  const ring = ringRaw.map(([lon, lat]) => [lon, lat] as [number, number]);
  let sx = 0;
  let sy = 0;
  for (const [lon, lat] of ring) {
    sx += lon;
    sy += lat;
  }
  const areaM2 = numProp(props.a) ?? 0;
  const residents = numProp(props.r) ?? 0;
  if (areaM2 <= 0 && ring.length < 3) return null;
  return {
    id,
    sa1Code: String(props.sa1 ?? ""),
    centroidLon: sx / ring.length,
    centroidLat: sy / ring.length,
    ring,
    areaM2: areaM2 > 0 ? areaM2 : 1,
    residents: residents > 0 ? residents : 0,
    medianAge: numProp(props.ma),
    apartmentShare: numProp(props.apt),
    rentingShare: numProp(props.rp),
    rentMedianWeekly: numProp(props.rent),
    ageMale: emptyAgeRecord() as DemographicsParcelRecord["ageMale"],
    ageFemale: emptyAgeRecord() as DemographicsParcelRecord["ageFemale"],
    households: emptyHouseholds() as DemographicsParcelRecord["households"],
    rentBins: emptyRent() as DemographicsParcelRecord["rentBins"],
  };
}

let sharedPmtiles: PMTiles | null = null;

function pmtilesClient(): PMTiles {
  if (!sharedPmtiles) {
    sharedPmtiles = new PMTiles(new EnrichmentPmtilesSource(DEMOGRAPHICS_PARCELS_PMTILES_URL));
  }
  return sharedPmtiles;
}

export async function fetchParcelsFromPmtiles(
  bounds: { south: number; west: number; north: number; east: number },
  signal?: AbortSignal,
): Promise<DemographicsParcelRecord[]> {
  const pmtiles = pmtilesClient();
  const tiles = tileRange(bounds, PARCELS_ZOOM);
  const byId = new Map<string, DemographicsParcelRecord>();
  for (const { z, x, y } of tiles) {
    if (signal?.aborted) break;
    const response = await pmtiles.getZxy(z, x, y, signal);
    if (!response?.data) continue;
    const vt = new VectorTile(new PbfReader(response.data));
    const layer = vt.layers.parcels;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geo = feature.toGeoJSON(x, y, z) as GeoJSON.Feature;
      const props = geo.properties ?? {};
      const id = String(props.id ?? props.parcel_pfi ?? `${i}-${x}-${y}`);
      if (byId.has(id)) continue;
      const record = recordFromGeoJson(geo, id);
      if (record) byId.set(id, record);
    }
  }
  return [...byId.values()];
}

export function mergeParcelBounds(
  viewBounds: { south: number; west: number; north: number; east: number },
  extra: { south: number; west: number; north: number; east: number },
): { south: number; west: number; north: number; east: number } {
  return {
    south: Math.min(viewBounds.south, extra.south),
    west: Math.min(viewBounds.west, extra.west),
    north: Math.max(viewBounds.north, extra.north),
    east: Math.max(viewBounds.east, extra.east),
  };
}
