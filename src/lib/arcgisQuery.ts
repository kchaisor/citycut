/**
 * Envelope queries against public ArcGIS REST layers (FeatureServer / MapServer), with paging,
 * Esri JSON → GeoJSON conversion, one shared time limit per layer, and an explicit status.
 *
 * Rules (source of truth first, never silent):
 *  - "ok" means every page arrived. "partial" means some pages arrived and then the time limit,
 *    the page cap, or an error stopped it; the note says which. "failed" means no usable page.
 *  - 401 / 403 / 429 are not retried. Nothing here retries.
 *  - Only simple GETs with no custom headers, so the browser sends no CORS preflight.
 *
 * NSW Spatial Services (portal.spatial.nsw.gov.au) answers f=geojson with HTTP 503 from its CDN
 * (probed 2026-10-19), so those layers ask for f=json and convert here.
 */

export type ArcgisFormat = "esrijson" | "geojson";

export type ArcgisLayerSpec = {
  /** Stable id, also the Data sources row id. */
  id: string;
  label: string;
  /** Layer URL, ending in the layer id (…/FeatureServer/8). */
  url: string;
  outFields: string[];
  format: ArcgisFormat;
  where?: string;
  /** Records per page; must not exceed the layer's maxRecordCount. */
  pageSize: number;
  maxPages: number;
  /** Server-side generalisation in degrees (outSR 4326). 5e-6 ≈ 0.5 m. */
  maxAllowableOffsetDeg?: number;
  geometryPrecision?: number;
};

export type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] }
  | { type: "Point"; coordinates: number[] };

export type GeoJsonFeature = { geometry: GeoJsonGeometry | null; properties: Record<string, unknown> };

export type ArcgisStatus = "ok" | "partial" | "failed";

export type ArcgisResult = {
  id: string;
  status: ArcgisStatus;
  features: GeoJsonFeature[];
  pages: number;
  ms: number;
  /** Failure or partial reason, one sentence. Null when ok. */
  note: string | null;
};

export type LonLatBox = { west: number; south: number; east: number; north: number };

export type ArcgisFetch = (url: string, signal: AbortSignal) => Promise<{ status: number; json: () => Promise<unknown> }>;

export const ARCGIS_TIMEOUT_MS = 20_000;

export function arcgisEnvelopeQueryUrl(spec: ArcgisLayerSpec, bounds: LonLatBox, offset: number): string {
  const params = new URLSearchParams({
    where: spec.where ?? "1=1",
    geometry: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outSR: "4326",
    outFields: spec.outFields.join(","),
    returnGeometry: "true",
    resultOffset: String(offset),
    resultRecordCount: String(spec.pageSize),
    f: spec.format === "geojson" ? "geojson" : "json",
  });
  if (spec.maxAllowableOffsetDeg != null) params.set("maxAllowableOffset", String(spec.maxAllowableOffsetDeg));
  if (spec.geometryPrecision != null) params.set("geometryPrecision", String(spec.geometryPrecision));
  return `${spec.url}/query?${params.toString()}`;
}

/** Signed area in the source's lon/lat plane (positive = counter-clockwise). */
function ringArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  }
  return sum / 2;
}

function ringContainsPoint(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

const xy = (p: number[]): number[] => [p[0]!, p[1]!];

/**
 * Esri rings → GeoJSON. Esri outer rings run clockwise and holes counter-clockwise; each hole is
 * attached to the outer ring that contains its first vertex (else the last outer ring).
 */
export function esriRingsToGeoJson(rings: number[][][]): GeoJsonGeometry | null {
  const outers: number[][][][] = [];
  const holes: number[][][] = [];
  for (const raw of rings) {
    if (raw.length < 4) continue;
    const ring = raw.map(xy);
    if (ringArea(ring) < 0) outers.push([ring]);
    else holes.push(ring);
  }
  if (outers.length === 0) {
    // Some servers write every ring counter-clockwise: treat each as its own outer.
    for (const hole of holes) outers.push([hole]);
    holes.length = 0;
  }
  for (const hole of holes) {
    const [hx, hy] = hole[0]!;
    const owner = outers.find((polygon) => ringContainsPoint(polygon[0]!, hx!, hy!)) ?? outers[outers.length - 1]!;
    owner.push(hole);
  }
  if (outers.length === 0) return null;
  return outers.length === 1 ? { type: "Polygon", coordinates: outers[0]! } : { type: "MultiPolygon", coordinates: outers };
}

export function esriGeometryToGeoJson(geometry: unknown): GeoJsonGeometry | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { rings?: number[][][]; paths?: number[][][]; x?: number; y?: number };
  if (Array.isArray(g.rings)) return esriRingsToGeoJson(g.rings);
  if (Array.isArray(g.paths)) {
    const paths = g.paths.filter((path) => path.length >= 2).map((path) => path.map(xy));
    if (paths.length === 0) return null;
    return paths.length === 1 ? { type: "LineString", coordinates: paths[0]! } : { type: "MultiLineString", coordinates: paths };
  }
  if (typeof g.x === "number" && typeof g.y === "number") return { type: "Point", coordinates: [g.x, g.y] };
  return null;
}

export type ArcgisPage = { features: GeoJsonFeature[]; exceeded: boolean };

/** Parse one page in either format. Throws with the server's message on an error body. */
export function parseArcgisPage(json: unknown, format: ArcgisFormat): ArcgisPage {
  if (!json || typeof json !== "object") throw new Error("The server answered with something that is not JSON.");
  const body = json as {
    error?: { code?: number; message?: string };
    features?: unknown[];
    exceededTransferLimit?: boolean;
    properties?: { exceededTransferLimit?: boolean };
  };
  if (body.error) {
    throw new Error(`The server answered with error ${body.error.code ?? ""}: ${body.error.message || "query failed"}`.replace("  ", " "));
  }
  const raw = Array.isArray(body.features) ? body.features : [];
  const exceeded = Boolean(body.exceededTransferLimit || body.properties?.exceededTransferLimit);
  const features: GeoJsonFeature[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if (format === "esrijson") {
      const f = item as { geometry?: unknown; attributes?: Record<string, unknown> };
      features.push({ geometry: esriGeometryToGeoJson(f.geometry), properties: f.attributes ?? {} });
    } else {
      const f = item as { geometry?: GeoJsonGeometry | null; properties?: Record<string, unknown> };
      features.push({ geometry: f.geometry ?? null, properties: f.properties ?? {} });
    }
  }
  return { features, exceeded };
}

const defaultFetch: ArcgisFetch = async (url, signal) => {
  const response = await fetch(url, { signal });
  return { status: response.status, json: () => response.json() as Promise<unknown> };
};

function abortError(): Error {
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  return error;
}

function statusSentence(label: string, status: number): string {
  if (status === 401 || status === 403) return `${label}: the server refused access (HTTP ${status}); not retried.`;
  if (status === 429) return `${label}: the server is rate limiting (HTTP 429); not retried.`;
  return `${label}: the server answered HTTP ${status}.`;
}

/**
 * Every feature intersecting the box, page by page. Never throws except when the caller's own
 * signal aborts; every other problem comes back as status + note.
 */
export async function queryArcgisLayer(
  spec: ArcgisLayerSpec,
  bounds: LonLatBox,
  options: { signal?: AbortSignal; timeoutMs?: number; fetchImpl?: ArcgisFetch } = {},
): Promise<ArcgisResult> {
  const started = Date.now();
  const parent = options.signal;
  if (parent?.aborted) throw abortError();
  const timeoutMs = options.timeoutMs ?? ARCGIS_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const stop = () => controller.abort();
  parent?.addEventListener("abort", stop);
  const features: GeoJsonFeature[] = [];
  let pages = 0;
  const finish = (status: ArcgisStatus, note: string | null): ArcgisResult => ({
    id: spec.id,
    status,
    features,
    pages,
    ms: Date.now() - started,
    note,
  });
  try {
    let offset = 0;
    for (;;) {
      if (pages >= spec.maxPages) {
        return finish("partial", `${spec.label}: stopped after ${pages} pages (${features.length} features); more exist in this cut.`);
      }
      let page: ArcgisPage;
      try {
        const response = await fetchImpl(arcgisEnvelopeQueryUrl(spec, bounds, offset), controller.signal);
        if (response.status < 200 || response.status >= 300) {
          const note = statusSentence(spec.label, response.status);
          return finish(pages > 0 ? "partial" : "failed", note);
        }
        page = parseArcgisPage(await response.json(), spec.format);
      } catch (error) {
        if (parent?.aborted) throw abortError();
        const note = timedOut
          ? `${spec.label}: no answer within ${Math.round(timeoutMs / 1000)} s${pages > 0 ? ` after ${features.length} features` : ""}.`
          : `${spec.label}: ${error instanceof Error && error.message ? error.message : "the request failed"}`;
        return finish(pages > 0 ? "partial" : "failed", note);
      }
      pages += 1;
      features.push(...page.features);
      if (!page.exceeded || page.features.length === 0) return finish("ok", null);
      offset += page.features.length;
    }
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", stop);
  }
}
