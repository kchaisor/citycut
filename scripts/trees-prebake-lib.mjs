import { decodeEsriPbf } from "./esri-pbf.mjs";

export const TREES_SCHEMA_VERSION = 1;
export const TREES_PMTILES_NAME = "trees.pmtiles";
export const TREES_MANIFEST_NAME = "trees-manifest.json";

export const GREATER_MELBOURNE_BBOX = { west: 144.333634, south: -38.502988, east: 145.878412, north: -37.175099 };

export const VICMAP_LAYER_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Vegetation_Tree_Urban/FeatureServer/0";
export const COM_DATASET_URL =
  "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/trees-with-species-and-dimensions-urban-forest";
export const COM_SELECT = "latitude,longitude,diameter_breast_height,age_description,genus,scientific_name";

export const VICMAP_OID_PAGE = 10000;
export const VICMAP_RECORD_FACTOR = 5;

export const SIZE_FAIL_BYTES = 100_000_000;
export const SIZE_WARN_BYTES = 90_000_000;

export const OSM_SIZE_KEYS = [
  "height",
  "est_height",
  "diameter_crown",
  "crown_diameter",
  "diameter:crown",
  "circumference",
  "circumference:breast",
  "trunk:circumference",
  "diameter",
  "diameter_breast_height",
];

export const TREES_ATTRIBUTION =
  "Vicmap Vegetation Tree Urban © State of Victoria (DTP), CC BY 4.0; City of Melbourne Urban Forest, CC BY; tree points © OpenStreetMap contributors, ODbL (via Overture Maps).";

export class FatalHttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "FatalHttpError";
    this.status = status;
  }
}

export class ArcgisErrorBody extends Error {
  constructor(message) {
    super(message);
    this.name = "ArcgisErrorBody";
  }
}

export function isFatalStatus(status) {
  return status === 401 || status === 403 || status === 429;
}

export function arcgisErrorMessage(body) {
  if (!body || typeof body !== "object" || !body.error) return null;
  const e = body.error;
  const details = Array.isArray(e.details) ? e.details.filter(Boolean).join(" ") : "";
  return `ArcGIS error ${e.code ?? "?"}: ${[e.message, details].filter(Boolean).join(" ") || "no detail"}`;
}

/** Throws ArcgisErrorBody for a JSON body carrying `error`. Returns the parsed body otherwise. */
export function checkArcgisJson(body) {
  const message = arcgisErrorMessage(body);
  if (message) throw new ArcgisErrorBody(message);
  return body;
}

export function decodeVicmapPbfResponse(bytes, contentType = "") {
  const first = bytes.length > 0 ? bytes[0] : 0;
  if (/json/i.test(contentType) || first === 0x7b) {
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ArcgisErrorBody("ArcGIS returned an unreadable JSON body for a pbf query.");
    }
    checkArcgisJson(body);
    throw new ArcgisErrorBody("ArcGIS returned JSON instead of pbf.");
  }
  return decodeEsriPbf(bytes);
}

export function vicmapOidPageUrl(lo, hiExclusive, format = "pbf") {
  const params = new URLSearchParams({
    where: `OBJECTID>=${lo} AND OBJECTID<${hiExclusive}`,
    outFields: "OBJECTID,height_m,canopy_radius_m,dense_canopy",
    returnGeometry: "true",
    outSR: "4326",
    orderByFields: "OBJECTID",
    resultRecordCount: String(hiExclusive - lo),
    maxRecordCountFactor: String(VICMAP_RECORD_FACTOR),
    f: format,
  });
  if (format === "geojson") params.set("geometryPrecision", "7");
  return `${VICMAP_LAYER_URL}/query?${params.toString()}`;
}

export function vicmapOidPages(maxOid, page = VICMAP_OID_PAGE) {
  const pages = [];
  for (let lo = 1; lo <= maxOid; lo += page) pages.push([lo, Math.min(lo + page, maxOid + 1)]);
  return pages;
}

export function checkVicmapPage(page, lo, hi) {
  const span = hi - lo;
  if (page.exceededTransferLimit) {
    throw new ArcgisErrorBody(`Vicmap page OBJECTID ${lo}..${hi - 1} exceeded the transfer limit.`);
  }
  if (page.points.length > span) {
    throw new ArcgisErrorBody(`Vicmap page OBJECTID ${lo}..${hi - 1} returned ${page.points.length} rows for ${span} ids.`);
  }
  return page;
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with a per-attempt timeout and a bounded retry. 401/403/429 throw FatalHttpError
 * at once. Other HTTP errors, timeouts, network failures and `parse` errors (e.g. an
 * ArcGIS error body) are retried up to `attempts` times, then rethrown.
 */
export async function fetchWithRetry(url, parse, options = {}) {
  const {
    attempts = 3,
    timeoutMs = 60_000,
    backoffMs = [2_000, 6_000],
    fetchImpl = globalThis.fetch,
    sleep = sleepMs,
    label = "request",
    headers = {},
  } = options;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers });
      if (isFatalStatus(response.status)) {
        throw new FatalHttpError(`${label} answered HTTP ${response.status}; stopping without retry.`, response.status);
      }
      if (!response.ok) throw new Error(`${label} answered HTTP ${response.status}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return await parse(bytes, response.headers.get("content-type") ?? "");
    } catch (err) {
      if (err instanceof FatalHttpError) throw err;
      lastError = controller.signal.aborted && controller.signal.reason instanceof Error ? controller.signal.reason : err;
      if (attempt < attempts) await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0);
    } finally {
      clearTimeout(timer);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed after ${attempts} attempts: ${detail}`);
}

export function parseJsonBytes(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function inBbox(lon, lat, bbox = GREATER_MELBOURNE_BBOX) {
  return lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north;
}

export function halfMetreUnits(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.round(value * 2));
}

/** Vicmap row → tile properties, or null when the app would drop it (bad position or height). */
export function vicmapProps(point) {
  const { lon, lat, attributes } = point;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const h2 = halfMetreUnits(attributes.height_m);
  if (h2 === null) return null;
  const props = { h2 };
  const radius = attributes.canopy_radius_m;
  const c2 = halfMetreUnits(typeof radius === "number" ? radius * 2 : null);
  if (c2 !== null) props.c2 = c2;
  const dense = attributes.dense_canopy;
  if (dense === true || dense === 1 || (typeof dense === "string" && ["y", "yes", "true", "1"].includes(dense.trim().toLowerCase()))) {
    props.d = 1;
  }
  return props;
}

export function comProps(row) {
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;
  const props = {};
  if (typeof row.diameter_breast_height === "number") props.dbh = row.diameter_breast_height;
  if (row.age_description?.trim()) props.age = row.age_description.trim();
  if (row.genus?.trim()) props.g = row.genus.trim();
  if (row.scientific_name?.trim()) props.sp = row.scientific_name.trim();
  return props;
}

export function osmSizeTags(sourceTags) {
  if (typeof sourceTags !== "string") return null;
  let parsed;
  try {
    parsed = JSON.parse(sourceTags);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const kept = {};
  for (const key of OSM_SIZE_KEYS) if (typeof parsed[key] === "string") kept[key] = parsed[key];
  return Object.keys(kept).length > 0 ? JSON.stringify(kept) : null;
}

export function stableNumericId(id) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sizeCheck(bytes) {
  const mb = (bytes / 1e6).toFixed(1);
  if (bytes >= SIZE_FAIL_BYTES) {
    return {
      level: "fail",
      message: `trees.pmtiles is ${mb} MB (${bytes} bytes), at or over the 100 MB limit. Not publishing. Lower the zoom or detail, or split the file.`,
    };
  }
  if (bytes >= SIZE_WARN_BYTES) {
    return { level: "warn", message: `trees.pmtiles is ${mb} MB (${bytes} bytes), within 10 MB of the 100 MB limit.` };
  }
  return { level: "ok", message: `trees.pmtiles is ${mb} MB (${bytes} bytes).` };
}

export function countCheck(label, expected, got, tolerance = 0) {
  if (!Number.isFinite(expected) || expected <= 0) throw new Error(`${label}: no source count to check against.`);
  const allowed = Math.floor(expected * tolerance);
  if (Math.abs(expected - got) > allowed) {
    throw new Error(`${label}: got ${got}, source says ${expected} (allowed difference ${allowed}).`);
  }
}

export function sourceStamps({ vicmapDataLastEdit, vicmapCount, comDataProcessed, comCount, overtureRelease, zoom }) {
  return {
    schema: TREES_SCHEMA_VERSION,
    zoom,
    vicmapDataLastEdit,
    vicmapCount,
    comDataProcessed,
    comCount,
    overtureRelease,
  };
}

export function shouldSkip(previousManifest, stamps) {
  const prev = previousManifest?.sourceStamps;
  if (!prev) return { skip: false, reason: "no previous trees manifest" };
  for (const [key, value] of Object.entries(stamps)) {
    if (value === null || value === undefined) return { skip: false, reason: `source stamp ${key} is unknown` };
    if (prev[key] !== value) return { skip: false, reason: `${key} changed (${prev[key]} → ${value})` };
  }
  return { skip: true, reason: "Vicmap, City of Melbourne and Overture sources unchanged since the last build" };
}

export function tilesForBbox(bbox, z) {
  const n = 2 ** z;
  const tx = (lon) => Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const ty = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n)));
  };
  const out = [];
  for (let x = tx(bbox.west); x <= tx(bbox.east); x++) {
    for (let y = ty(bbox.north); y <= ty(bbox.south); y++) out.push({ z, x, y });
  }
  return out;
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failed = null;
  async function worker() {
    while (failed === null && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed ??= err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed !== null) throw failed;
  return results;
}
