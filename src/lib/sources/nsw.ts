import type { ArcgisLayerSpec } from "../arcgisQuery";

/**
 * NSW open-data endpoints for NSW mode. Probed 2026-10-19 with a 1 km bbox at Glebe Island and
 * Pyrmont: every layer below answered with CORS for https://kchaisor.github.io (Spatial Services
 * echoes the origin; City of Sydney and DPHI send *), no key, maxRecordCount 2000 (planning 10000),
 * pagination supported. Licences: Spatial Services CC BY 4.0, DPHI EPI layers CC BY 4.0,
 * City of Sydney Terrain contours CC BY 4.0.
 */

export const NSW_SCP = "https://portal.spatial.nsw.gov.au/server/rest/services";
export const NSW_PLANNING =
  "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/EPI_Primary_Planning_Layers/MapServer";
export const COS_TERRAIN_CONTOURS =
  "https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Terrain_Contours/FeatureServer/0";

/** Exact attribution strings (Kelvin, NSW mode scope). */
export const NSW_SPATIAL_ATTRIBUTION = "© State of New South Wales (Spatial Services, DCS NSW)";
export const NSW_PLANNING_ATTRIBUTION =
  "© State Government of NSW and NSW Department of Planning, Housing and Infrastructure";
export const COS_ATTRIBUTION = "City of Sydney CC BY 4.0";

export const NSW_SPATIAL_DATASET_URL = "https://portal.spatial.nsw.gov.au/";
export const NSW_PLANNING_DATASET_URL = "https://www.planningportal.nsw.gov.au/opendata/";
export const COS_CONTOURS_DATASET_URL = "https://data.cityofsydney.nsw.gov.au/datasets/cityofsydney::terrain-contours/about";

/** Timeouts, 5xx and network errors only; 401/403/429 are never retried (arcgisQuery). */
const SCP_RETRY = { attempts: 3, backoffMs: [800, 2000], attemptTimeoutMs: 8_000 };

/**
 * Spatial Services layers are read from the *_multiCRS services with outSR=7844: the data is held
 * in GDA94 and the server applies the official GDA94→GDA2020 conformal + distortion NTv2 grid
 * (EPSG:8446). The plain services (Web Mercator) return GDA94 coordinates untransformed, about
 * 1.5 m south-west of GDA2020 at Pyrmont (probed 2026-10-19). Esri JSON, because the Spatial
 * Services CDN answers f=geojson with 503.
 */
const scp = (path: string, id: string, label: string, outFields: string[], extra: Partial<ArcgisLayerSpec> = {}): ArcgisLayerSpec => ({
  id,
  label,
  url: `${NSW_SCP}/${path}`,
  outFields: ["OBJECTID", ...outFields],
  format: "esrijson",
  pageSize: 2000,
  maxPages: 10,
  geometryPrecision: 8,
  outSR: 7844,
  retry: SCP_RETRY,
  idField: "OBJECTID",
  ...extra,
});

/** Cadastre multiCRS layers page at 100 records (maxRecordCount 100). */
const CADASTRE = { pageSize: 100, maxPages: 20 };

/** DPHI planning layers are stored in GDA94 (4283) and ignore outSR transforms, so convert here. */
const planning = (layer: number, id: string, label: string, outFields: string[]): ArcgisLayerSpec => ({
  id,
  label,
  url: `${NSW_PLANNING}/${layer}`,
  outFields,
  format: "geojson",
  pageSize: 2000,
  maxPages: 10,
  geometryPrecision: 8,
  outSR: 4283,
  datum: "gda94",
  retry: SCP_RETRY,
});

export const NSW_LAYERS = {
  lots: scp("NSW_Land_Parcel_Property_Theme_multiCRS/FeatureServer/8", "nsw-lots", "NSW lots", [
    "lotidstring",
    "planlabel",
    "lotnumber",
    "sectionnumber",
    "stratumlevel",
    "hasstratum",
    "classsubtype",
    "itstitlestatus",
  ], { ...CADASTRE, tiles: 3 }),
  easements: scp("NSW_Land_Parcel_Property_Theme_multiCRS/FeatureServer/9", "nsw-easements", "NSW easements", [
    "easementtype",
    "easementwidth",
    "stratumlevel",
    "classsubtype",
  ], CADASTRE),
  roadCorridors: scp("NSW_Land_Parcel_Property_Theme_multiCRS/FeatureServer/5", "nsw-road-corridors", "NSW road corridors", [
    "roadnamelabel",
    "roadtype",
    "roadcorridortype",
    "classsubtype",
  ], { ...CADASTRE, tiles: 2 }),
  roadCentrelines: scp("NSW_Transport_Theme_multiCRS/FeatureServer/5", "nsw-road-centrelines", "NSW road centrelines", [
    "roadnamebase",
    "roadnametype",
    "functionhierarchy",
    "lanecount",
    "roadontype",
  ]),
  railways: scp("NSW_Transport_Theme_multiCRS/FeatureServer/7", "nsw-railways", "NSW railways", [
    "classsubtype",
    "railontype",
    "operationalstatus",
    "railwayname",
  ]),
  stations: scp("NSW_FOI_Transport_Facilities_multiCRS/FeatureServer/1", "nsw-stations", "NSW stations and light rail stops", [
    "classsubtype",
    "operationalstatus",
    "generalname",
  ]),
  buildingComplexes: scp("NSW_Features_of_Interest_Category_multiCRS/FeatureServer/3", "nsw-building-complexes", "NSW building complexes (points of interest)", [
    "classsubtype",
    "buildingcomplextype",
    "generalname",
    "operationalstatus",
  ]),
  water: scp("NSW_Water_Theme_multiCRS/FeatureServer/6", "nsw-water", "NSW water (HydroArea)", ["hydroname", "hydrotype", "perenniality"]),
  contours2m: scp("NSW_Elevation_and_Depth_Theme_multiCRS/FeatureServer/2", "nsw-contours", "NSW contours", ["elevation"]),
  zoning: planning(2, "nsw-zoning", "Land zoning", ["SYM_CODE", "LAY_CLASS", "EPI_NAME"]),
  hob: planning(5, "nsw-hob", "Height of building", ["MAX_B_H", "UNITS", "LAY_CLASS", "EPI_NAME"]),
  fsr: planning(1, "nsw-fsr", "Floor space ratio", ["FSR", "LAY_CLASS", "EPI_NAME"]),
  heritage: planning(0, "nsw-heritage", "Heritage", ["H_ID", "H_NAME", "SIG", "EPI_NAME"]),
  /**
   * 1 m contours, 2020 survey, stored in GDA94 / MGA 56 (EPSG:28356). Read as GDA94 lon/lat and
   * converted here. Tiles of ~300–500 m; 0.5 m generalisation keeps 1 km² near 200 KB gzip.
   */
  contoursCos: {
    id: "cos-contours",
    label: "City of Sydney 1 m contours",
    url: COS_TERRAIN_CONTOURS,
    outFields: ["Contour"],
    format: "geojson",
    pageSize: 2000,
    maxPages: 10,
    maxAllowableOffsetDeg: 0.000005,
    geometryPrecision: 7,
    outSR: 4283,
    datum: "gda94",
  },
} satisfies Record<string, ArcgisLayerSpec>;

export type NswLayerKey = keyof typeof NSW_LAYERS;

/** NSW functionhierarchy code → CityCut road grade (1 Motorway … 11 AccessWay). */
export function nswRoadGrade(code: unknown): "arterial" | "local" | "path" {
  const n = typeof code === "number" ? code : Number(code);
  if (n >= 1 && n <= 4) return "arterial";
  if (n === 8 || n === 9 || n === 11) return "path";
  return "local";
}
