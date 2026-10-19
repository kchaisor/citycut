import { gda94ToGda2020 } from "./gda";
/**
 * Envelope queries against public ArcGIS REST layers (FeatureServer / MapServer), with paging,
 * Esri JSON → GeoJSON conversion, one shared time limit per layer, and an explicit status.
 *
 * Rules (source of truth first, never silent):
 *  - "ok" means every page arrived. "partial" means some pages arrived and then the time limit,
 *    the page cap, or an error stopped it; the note says which. "failed" means no usable page.
 *  - 401 / 403 / 429 (and ArcGIS token errors 498 / 499) are never retried: the layer stops and
 *    says why. Layers with a retry policy retry only timeouts, HTTP 5xx and network errors,
 *    with backoff, inside the layer's time budget.
 *  - Coordinates come back in GDA2020 (outSR 7844, server transform) or are converted from
 *    GDA94 here (datum "gda94"), see gda.ts.
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
  /** Output spatial reference. 7844 (GDA2020) on the Spatial Services *_multiCRS services. Default 4326. */
  outSR?: number;
  /** "gda94": the server returns GDA94 coordinates (no transform on request); convert to GDA2020 here. */
  datum?: "gda94";
  /** Retry transient failures (timeouts, 5xx, network) per page. Never 401/403/429. */
  retry?: RetryPolicy;
  /** Split the cut into tiles × tiles envelopes fetched in parallel, de-duplicated on idField. */
  tiles?: number;
  /** Unique id attribute for de-duplication across tiles (OBJECTID). */
  idField?: string;
};

export type RetryPolicy = {
  /** Total attempts per page, including the first. */
  attempts: number;
  /** Wait before retry n (ms); the last value repeats. */
  backoffMs: number[];
  /** Time limit for one attempt; the layer budget still caps the total. */
  attemptTimeoutMs: number;
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
  /** Retries spent (transient failures only). */
  retries?: number;
  /** True when the server refused access or rate-limited (401/403/429/498/499): nothing was retried. */
  refused?: boolean;
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
    outSR: String(spec.outSR ?? 4326),
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

/** An ArcGIS error body ({"error": {"code": …}}), which often arrives with HTTP 200. */
export class ArcgisServerError extends Error {
  constructor(message: string, readonly code: number | null) {
    super(message);
    this.name = "ArcgisServerError";
  }
}

const REFUSED_CODES = new Set([401, 403, 429, 498, 499]);

function mapCoords(geometry: GeoJsonGeometry | null, f: (lon: number, lat: number) => [number, number]): GeoJsonGeometry | null {
  if (!geometry) return null;
  const pt = (p: number[]): number[] => f(p[0]!, p[1]!);
  switch (geometry.type) {
    case "Point":
      return { type: "Point", coordinates: pt(geometry.coordinates) };
    case "LineString":
      return { type: "LineString", coordinates: geometry.coordinates.map(pt) };
    case "MultiLineString":
    case "Polygon":
      return { type: geometry.type, coordinates: geometry.coordinates.map((ring) => ring.map(pt)) } as GeoJsonGeometry;
    case "MultiPolygon":
      return { type: "MultiPolygon", coordinates: geometry.coordinates.map((poly) => poly.map((ring) => ring.map(pt))) };
  }
}

/** GDA94 → GDA2020 for every coordinate of a parsed page (see gda.ts). */
export function convertGda94Features(features: GeoJsonFeature[]): GeoJsonFeature[] {
  return features.map((feature) => ({ ...feature, geometry: mapCoords(feature.geometry, gda94ToGda2020) }));
}

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
    throw new ArcgisServerError(
      `The server answered with error ${body.error.code ?? ""}: ${body.error.message || "query failed"}`.replace("  ", " "),
      typeof body.error.code === "number" ? body.error.code : null,
    );
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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

type Attempt =
  | { ok: true; page: ArcgisPage }
  | { ok: false; transient: boolean; refused: boolean; note: string; timedOut: boolean };

const retriesText = (n: number) => (n > 0 ? ` after ${n} ${n === 1 ? "retry" : "retries"}` : "");

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
  const retry = spec.retry;
  const budget = new AbortController();
  let budgetSpent = false;
  const timer = setTimeout(() => {
    budgetSpent = true;
    budget.abort();
  }, timeoutMs);
  const stop = () => budget.abort();
  parent?.addEventListener("abort", stop);
  const features: GeoJsonFeature[] = [];
  let pages = 0;
  let retries = 0;
  const finish = (status: ArcgisStatus, note: string | null, refused = false): ArcgisResult => ({
    id: spec.id,
    status,
    features: spec.datum === "gda94" ? convertGda94Features(features) : features,
    pages,
    ms: Date.now() - started,
    note,
    retries,
    ...(refused ? { refused: true } : {}),
  });

  const attempt = async (url: string): Promise<Attempt> => {
    const local = new AbortController();
    let attemptTimedOut = false;
    const relay = () => local.abort();
    budget.signal.addEventListener("abort", relay);
    const attemptTimer = retry
      ? setTimeout(() => {
          attemptTimedOut = true;
          local.abort();
        }, retry.attemptTimeoutMs)
      : null;
    try {
      const response = await fetchImpl(url, local.signal);
      if (REFUSED_CODES.has(response.status)) {
        return { ok: false, transient: false, refused: true, timedOut: false, note: statusSentence(spec.label, response.status) };
      }
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, transient: response.status >= 500, refused: false, timedOut: false, note: statusSentence(spec.label, response.status) };
      }
      return { ok: true, page: parseArcgisPage(await response.json(), spec.format) };
    } catch (error) {
      if (parent?.aborted) throw abortError();
      if (error instanceof ArcgisServerError) {
        const refused = error.code != null && REFUSED_CODES.has(error.code);
        return {
          ok: false,
          transient: !refused && error.code != null && error.code >= 500,
          refused,
          timedOut: false,
          note: `${spec.label}: ${error.message}${refused ? "; not retried." : ""}`,
        };
      }
      const timedOut = budgetSpent || attemptTimedOut;
      const seconds = Math.round((budgetSpent ? timeoutMs : retry!.attemptTimeoutMs) / 1000);
      return {
        ok: false,
        transient: true,
        refused: false,
        timedOut,
        note: timedOut
          ? `${spec.label}: no answer within ${seconds} s${pages > 0 ? ` after ${features.length} features` : ""}`
          : `${spec.label}: ${error instanceof Error && error.message ? error.message : "the request failed"}`,
      };
    } finally {
      if (attemptTimer) clearTimeout(attemptTimer);
      budget.signal.removeEventListener("abort", relay);
    }
  };

  try {
    let offset = 0;
    for (;;) {
      if (pages >= spec.maxPages) {
        return finish("partial", `${spec.label}: stopped after ${pages} pages (${features.length} features); more exist in this cut.`);
      }
      const url = arcgisEnvelopeQueryUrl(spec, bounds, offset);
      let tries = 0;
      let page: ArcgisPage | null = null;
      for (;;) {
        tries += 1;
        const result = await attempt(url);
        if (result.ok) {
          page = result.page;
          break;
        }
        const canRetry = Boolean(retry) && result.transient && !budgetSpent && tries < retry!.attempts;
        if (!canRetry) {
          const status = pages > 0 ? "partial" : "failed";
          const tail = result.refused || /not retried\.$/.test(result.note) ? "" : `${retriesText(tries - 1)}.`;
          return finish(status, `${result.note.replace(/\.$/, "")}${tail}`.replace(/\.\.$/, "."), result.refused);
        }
        retries += 1;
        const waits = retry!.backoffMs;
        await sleep(waits[Math.min(tries - 1, waits.length - 1)] ?? 0, budget.signal);
        if (parent?.aborted) throw abortError();
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

/** Split a box into n × n equal envelopes, row by row from the south-west. */
export function splitBounds(bounds: LonLatBox, n: number): LonLatBox[] {
  const out: LonLatBox[] = [];
  const dx = (bounds.east - bounds.west) / n;
  const dy = (bounds.north - bounds.south) / n;
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      out.push({ west: bounds.west + c * dx, east: bounds.west + (c + 1) * dx, south: bounds.south + r * dy, north: bounds.south + (r + 1) * dy });
    }
  }
  return out;
}

/**
 * queryArcgisLayer over spec.tiles × spec.tiles envelopes in parallel, de-duplicated on
 * spec.idField. A refusal (401/403/429) on any tile cancels the rest: refused access is not
 * something more requests can fix. Partial when some tiles are incomplete; the note says which.
 */
export async function queryArcgisTiled(
  spec: ArcgisLayerSpec,
  bounds: LonLatBox,
  options: { signal?: AbortSignal; timeoutMs?: number; fetchImpl?: ArcgisFetch } = {},
): Promise<ArcgisResult> {
  const n = Math.max(1, Math.floor(spec.tiles ?? 1));
  if (n === 1) return queryArcgisLayer(spec, bounds, options);
  const started = Date.now();
  if (options.signal?.aborted) throw abortError();
  const cancel = new AbortController();
  const relay = () => cancel.abort();
  options.signal?.addEventListener("abort", relay);
  let refused: ArcgisResult | null = null;
  try {
    const tiles = splitBounds(bounds, n);
    const results = await Promise.all(
      tiles.map(async (tile) => {
        try {
          const result = await queryArcgisLayer(spec, tile, { ...options, signal: cancel.signal });
          if (result.refused && !refused) {
            refused = result;
            cancel.abort();
          }
          return result;
        } catch (error) {
          if (options.signal?.aborted) throw error;
          return null; // cancelled after another tile was refused
        }
      }),
    );
    const seen = new Set<unknown>();
    const features: GeoJsonFeature[] = [];
    for (const result of results) {
      for (const feature of result?.features ?? []) {
        const id = spec.idField ? feature.properties[spec.idField] : undefined;
        if (id != null) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        features.push(feature);
      }
    }
    const done = results.filter((result) => result?.status === "ok").length;
    const pages = results.reduce((sum, result) => sum + (result?.pages ?? 0), 0);
    const retries = results.reduce((sum, result) => sum + (result?.retries ?? 0), 0);
    const ms = Date.now() - started;
    const r = refused as ArcgisResult | null;
    if (r) {
      return { id: spec.id, status: features.length > 0 ? "partial" : "failed", features, pages, ms, retries, refused: true, note: `${r.note} Remaining tiles were cancelled.` };
    }
    if (done === tiles.length) return { id: spec.id, status: "ok", features, pages, ms, retries, note: null };
    const problems = results
      .map((result, index) => (result && result.status !== "ok" ? `tile ${index + 1}: ${(result.note ?? "").replace(`${spec.label}: `, "")}` : null))
      .filter(Boolean);
    return {
      id: spec.id,
      status: done === 0 && features.length === 0 ? "failed" : "partial",
      features,
      pages,
      ms,
      retries,
      note: `${spec.label}: ${done} of ${tiles.length} tiles complete (${features.length} features). ${problems.join("; ")}`,
    };
  } finally {
    options.signal?.removeEventListener("abort", relay);
  }
}
