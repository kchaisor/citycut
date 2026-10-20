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

/** Spatial Services CDN answers f=geojson with 503, so these use Esri JSON. */
const scp = (path: string, id: string, label: string, outFields: string[], extra: Partial<ArcgisLayerSpec> = {}): ArcgisLayerSpec => ({
  id,
  label,
  url: `${NSW_SCP}/${path}`,
  outFields,
  format: "esrijson",
  pageSize: 2000,
  maxPages: 10,
  geometryPrecision: 7,
  ...extra,
});

const planning = (layer: number, id: string, label: string, outFields: string[]): ArcgisLayerSpec => ({
  id,
  label,
  url: `${NSW_PLANNING}/${layer}`,
  outFields,
  format: "geojson",
  pageSize: 2000,
  maxPages: 10,
  geometryPrecision: 7,
});

export const NSW_LAYERS = {
  lots: scp("NSW_Land_Parcel_Property_Theme/FeatureServer/8", "nsw-lots", "NSW lots", [
    "lotidstring",
    "planlabel",
    "lotnumber",
    "stratumlevel",
  ]),
  easements: scp("NSW_Land_Parcel_Property_Theme/FeatureServer/9", "nsw-easements", "NSW easements", [
    "easementtype",
    "easementwidth",
    "stratumlevel",
  ]),
  roadCorridors: scp("NSW_Land_Parcel_Property_Theme/FeatureServer/5", "nsw-road-corridors", "NSW road corridors", [
    "roadnamelabel",
    "roadtype",
    "roadcorridortype",
  ]),
  roadCentrelines: scp("NSW_Transport_Theme/FeatureServer/5", "nsw-road-centrelines", "NSW road centrelines", [
    "roadnamebase",
    "roadnametype",
    "functionhierarchy",
    "lanecount",
  ]),
  water: scp("NSW_Water_Theme/FeatureServer/6", "nsw-water", "NSW water (HydroArea)", ["hydroname", "hydrotype", "perenniality"]),
  contours2m: scp("NSW_Elevation_and_Depth_Theme/FeatureServer/2", "nsw-contours", "NSW contours", ["elevation"]),
  zoning: planning(2, "nsw-zoning", "Land zoning", ["SYM_CODE", "LAY_CLASS", "EPI_NAME"]),
  hob: planning(5, "nsw-hob", "Height of building", ["MAX_B_H", "UNITS", "LAY_CLASS", "EPI_NAME"]),
  fsr: planning(1, "nsw-fsr", "Floor space ratio", ["FSR", "LAY_CLASS", "EPI_NAME"]),
  heritage: planning(0, "nsw-heritage", "Heritage", ["H_ID", "H_NAME", "SIG", "EPI_NAME"]),
  /** 1 m contours, 2020 survey. Tiles of ~300–500 m; 0.5 m generalisation keeps 1 km² near 200 KB gzip. */
  contoursCos: {
    id: "cos-contours",
    label: "City of Sydney 1 m contours",
    url: COS_TERRAIN_CONTOURS,
    outFields: ["Contour"],
    format: "geojson",
    pageSize: 2000,
    maxPages: 10,
    maxAllowableOffsetDeg: 0.000005,
    geometryPrecision: 6,
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
