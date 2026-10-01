import { clipPolyline } from "./clip";
import { FIGURE_SCALES } from "./figureGround";
import { polylineLength, toLocal } from "./geo";
import { contourInterval, leveledContourLines } from "./terrain";
import type { ContourLayer, ContourSourceId, LonLat, Pt, StoredContour, TerrainField } from "../types";

/**
 * Vicmap Elevation contours, Department of Transport and Planning.
 * Metro 1–5 m where that layer has lines, otherwise the statewide 1:25,000
 * 10 m contours. Both are public ArcGIS FeatureServers with no API key.
 *
 * Licence text on the ISO metadata record, quoted exactly:
 * "Creative Commons Attribution 4.0 (CC-BY)"
 * https://metashare.maps.vic.gov.au/geonetwork/srv/api/records/b90427f8-c04f-5fb4-973f-0a8a0cc1fe84/formatters/xml
 * DataVic catalogue names the same licence "Creative Commons Attribution 4.0 International".
 */

export const VICMAP_METRO_CONTOUR_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer/1";

export const VICMAP_STATE_CONTOUR_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_STATEWIDE_10_to_20_metre/FeatureServer/6";

export const VICMAP_METRO_DATASET_URL =
  "https://discover.data.vic.gov.au/dataset/vicmap-elevation-contour-line-1-to-5-metres-covering-metropolitan-melbourne";

export const VICMAP_STATE_DATASET_URL =
  "https://discover.data.vic.gov.au/dataset/vicmap-elevation-contour-line-10-and-20-metres";

/** Quoted from the layer metadata: Creative Commons Attribution 4.0 (CC-BY). */
export const VICMAP_CONTOUR_ATTRIBUTION =
  "Vicmap Elevation © State of Victoria (Department of Transport and Planning). Creative Commons Attribution 4.0 (CC-BY).";

export const VICMAP_CONTOUR_PAGE = 2000;
export const VICMAP_CONTOUR_TIMEOUT_MS = 8000;
const MAX_PAGES = 8;

/** Rough Victoria extent. A cut that misses this box never calls Vicmap. */
export const VICTORIA_BOUNDS = {
  west: 140.96,
  south: -39.2,
  east: 150.03,
  north: -33.98,
};

export type LonLatBounds = { south: number; west: number; north: number; east: number };

export type { ContourLayer, ContourSourceId, StoredContour };

export type ContourFetch = (url: string, signal: AbortSignal) => Promise<unknown>;

type RawLine = { z: number; coordinates: number[][] };

type Page = { lines: RawLine[]; count: number; exceeded: boolean };

const cache = new Map<string, ContourLayer>();

export function clearVicmapContourCache(): void {
  cache.clear();
}

export function boundsIntersect(a: LonLatBounds, b: LonLatBounds): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

export function contourQueryUrl(layerUrl: string, bounds: LonLatBounds, offset: number): string {
  const geometry = JSON.stringify({
    xmin: bounds.west,
    ymin: bounds.south,
    xmax: bounds.east,
    ymax: bounds.north,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    where: "1=1",
    geometry,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "altitude,feature_type_code",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    orderByFields: "OBJECTID",
    resultRecordCount: String(VICMAP_CONTOUR_PAGE),
    resultOffset: String(offset),
    f: "geojson",
  });
  return `${layerUrl}/query?${params.toString()}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function pushCoordinates(target: number[][], value: unknown) {
  if (!Array.isArray(value) || value.length < 2) return;
  const lon = value[0];
  const lat = value[1];
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return;
  target.push([lon, lat]);
}

/** One GeoJSON page. A feature with no elevation or no line is counted and dropped. */
export function parseContourPage(json: unknown): Page {
  const collection = asRecord(json) ?? {};
  const features = Array.isArray(collection.features) ? collection.features : [];
  const lines: RawLine[] = [];
  for (const feature of features) {
    const record = asRecord(feature);
    if (!record) continue;
    const properties = asRecord(record.properties);
    const altitude = properties?.altitude;
    const z = typeof altitude === "number" && Number.isFinite(altitude) ? altitude : null;
    const geometry = asRecord(record.geometry);
    const type = geometry?.type;
    const coordinates = geometry?.coordinates;
    if (z === null || !Array.isArray(coordinates)) continue;
    if (type === "LineString") {
      const part: number[][] = [];
      for (const point of coordinates) pushCoordinates(part, point);
      if (part.length >= 2) lines.push({ z, coordinates: part });
    } else if (type === "MultiLineString") {
      for (const piece of coordinates) {
        if (!Array.isArray(piece)) continue;
        const part: number[][] = [];
        for (const point of piece) pushCoordinates(part, point);
        if (part.length >= 2) lines.push({ z, coordinates: part });
      }
    }
  }
  const nested = asRecord(collection.properties);
  const exceeded = Boolean(collection.exceededTransferLimit || nested?.exceededTransferLimit);
  return { lines, count: features.length, exceeded };
}

/** Next resultOffset, or null when this page is the last. A full page is fetched again. */
export function nextContourOffset(offset: number, page: Pick<Page, "count" | "exceeded">): number | null {
  if (page.count <= 0) return null;
  if (page.count < VICMAP_CONTOUR_PAGE && !page.exceeded) return null;
  return offset + VICMAP_CONTOUR_PAGE;
}

/**
 * Interval from the elevations actually returned. The smallest positive step
 * is snapped to 0.5, 1, 2, 5, 10, or 20 m. A single elevation keeps the fallback.
 */
export function inferContourInterval(altitudes: number[], fallback: number): number {
  const unique = [...new Set(altitudes.map((altitude) => Math.round(altitude * 10) / 10))].sort((a, b) => a - b);
  if (unique.length < 2) return fallback;
  let min = Infinity;
  for (let i = 1; i < unique.length; i++) {
    const step = Math.round((unique[i] - unique[i - 1]) * 10) / 10;
    if (step > 0.05) min = Math.min(min, step);
  }
  if (!Number.isFinite(min)) return fallback;
  const standards = [0.5, 1, 2, 5, 10, 20];
  let best = fallback;
  let error = Infinity;
  for (const standard of standards) {
    const delta = Math.abs(standard - min);
    if (delta < error) {
      error = delta;
      best = standard;
    }
  }
  return best;
}

/** True when `z` lands on every Nth interval. N = 5 marks 5 m on 1 m data and 50 m on 10 m data. */
export function contourIsIndex(z: number, interval: number, every: number): boolean {
  if (!(interval > 0) || !(every >= 2)) return false;
  const step = interval * every;
  const nearest = Math.round(z / step) * step;
  return Math.abs(z - nearest) <= Math.max(0.05, interval * 0.05);
}

/** True when `z` is a multiple of `interval`, within a small tolerance. */
export function altitudeOnInterval(z: number, interval: number): boolean {
  if (!(interval > 0)) return false;
  const nearest = Math.round(z / interval) * interval;
  return Math.abs(z - nearest) <= Math.max(0.05, interval * 0.05);
}

export const DEFAULT_COARSE_INTERVAL_M = 5;
export const DEFAULT_COARSE_FROM_SCALE = 2500;

/**
 * Interval actually drawn at a plan scale.
 * Metro data finer than the coarse step thins to that step at 1:2500 and
 * smaller. Statewide 10/20 m and DEM contours are already coarser, so they stay.
 */
export function drawnContourInterval(
  source: ContourSourceId,
  nativeInterval: number,
  planScale: number,
  coarseIntervalM = DEFAULT_COARSE_INTERVAL_M,
  coarseFromScale = DEFAULT_COARSE_FROM_SCALE,
): number {
  if (source !== "vicmap-metro") return nativeInterval;
  if (!(coarseIntervalM > nativeInterval) || !(planScale >= coarseFromScale)) return nativeInterval;
  return coarseIntervalM;
}

/** Largest built-in plan scale that still draws the native interval. 2500 → 1000. */
export function finestContourScale(coarseFromScale: number, scales: readonly number[] = FIGURE_SCALES): number {
  let best = 0;
  for (const scale of scales) {
    if (scale < coarseFromScale && scale > best) best = scale;
  }
  return best > 0 ? best : coarseFromScale;
}

function intervalText(interval: number): string {
  return Number.isInteger(interval) ? String(interval) : interval.toFixed(1);
}

/**
 * Drawer line for the interval in use. Coarsened metro data names both steps,
 * for example "Vicmap Elevation 5 m (1 m at 1:1000)".
 */
export function contourDrawerLabel(
  layer: Pick<ContourLayer, "source" | "label" | "interval">,
  planScale: number,
  coarseIntervalM = DEFAULT_COARSE_INTERVAL_M,
  coarseFromScale = DEFAULT_COARSE_FROM_SCALE,
): string {
  const drawn = drawnContourInterval(layer.source, layer.interval, planScale, coarseIntervalM, coarseFromScale);
  if (layer.source !== "vicmap-metro" || drawn === layer.interval) return layer.label;
  const fine = finestContourScale(coarseFromScale);
  return `Vicmap Elevation ${intervalText(drawn)} m (${intervalText(layer.interval)} m at 1:${fine})`;
}

export function formatContourElevation(z: number): string {
  const rounded = Math.round(z * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function dedupe(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of line) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.05) out.push(point);
  }
  return out;
}

/** Project service vertices into the cut and keep only the part inside the square. */
export function clipContoursToFrame(lines: RawLine[], origin: LonLat, half: number): StoredContour[] {
  const clipped: StoredContour[] = [];
  for (const line of lines) {
    const local = line.coordinates.map(([lon, lat]) => toLocal(lat, lon, origin));
    for (const part of clipPolyline(dedupe(local), -half, half)) {
      const points = dedupe(part);
      if (points.length >= 2 && polylineLength(points) >= 0.5) clipped.push({ points, z: line.z });
    }
  }
  return clipped;
}

function productLabel(source: ContourSourceId, interval: number): string {
  if (source === "dem") return "derived from terrain DEM";
  const metres = Number.isInteger(interval) ? String(interval) : interval.toFixed(1);
  return `Vicmap Elevation ${metres} m`;
}

export function demContourLayer(field: TerrainField, sideM: number): ContourLayer {
  const interval = contourInterval(field.max - field.min);
  const half = sideM / 2;
  const lines: StoredContour[] = [];
  for (const item of leveledContourLines(field, sideM, interval)) {
    for (const part of clipPolyline(dedupe(item.line), -half, half)) {
      const points = dedupe(part);
      if (points.length >= 2) lines.push({ points, z: item.z });
    }
  }
  return {
    source: "dem",
    label: productLabel("dem", interval),
    interval,
    lines,
    attribution: null,
    datasetUrl: null,
    featureCount: lines.length,
    fetchMs: 0,
  };
}

function cacheKey(source: ContourSourceId, center: LonLat, sideM: number): string {
  return `${source}|${center.lon.toFixed(5)}|${center.lat.toFixed(5)}|${Math.round(sideM)}`;
}

async function collectPages(
  layerUrl: string,
  bounds: LonLatBounds,
  signal: AbortSignal,
  fetchImpl: ContourFetch,
): Promise<{ lines: RawLine[]; featureCount: number }> {
  const lines: RawLine[] = [];
  let featureCount = 0;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await fetchImpl(contourQueryUrl(layerUrl, bounds, offset), signal);
    const parsed = parseContourPage(json);
    lines.push(...parsed.lines);
    featureCount += parsed.count;
    const next = nextContourOffset(offset, parsed);
    if (next === null) break;
    offset = next;
  }
  return { lines, featureCount };
}

async function loadVicmapLayer(
  source: "vicmap-metro" | "vicmap-state",
  layerUrl: string,
  datasetUrl: string,
  fallbackInterval: number,
  center: LonLat,
  sideM: number,
  bounds: LonLatBounds,
  signal: AbortSignal,
  fetchImpl: ContourFetch,
): Promise<ContourLayer | null> {
  const key = cacheKey(source, center, sideM);
  const cached = cache.get(key);
  if (cached) return { ...cached, lines: cached.lines.map((line) => ({ ...line, points: line.points.map((point) => [...point] as Pt) })), fetchMs: 0 };
  const started = Date.now();
  const collected = await collectPages(layerUrl, bounds, signal, fetchImpl);
  const lines = clipContoursToFrame(collected.lines, center, sideM / 2);
  if (lines.length === 0) return null;
  const interval = inferContourInterval(lines.map((line) => line.z), fallbackInterval);
  const layer: ContourLayer = {
    source,
    label: productLabel(source, interval),
    interval,
    lines,
    attribution: VICMAP_CONTOUR_ATTRIBUTION,
    datasetUrl,
    featureCount: collected.featureCount,
    fetchMs: Date.now() - started,
  };
  cache.set(key, layer);
  return layer;
}

function abortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Vicmap contours for a cut inside Victoria, otherwise null.
 * The whole attempt shares one timeout. An empty metro answer tries the
 * statewide 10 m layer. A timeout or HTTP error returns null so the caller
 * can fall back to the DEM.
 */
export async function fetchVicmapContours(options: {
  center: LonLat;
  sideM: number;
  bounds: LonLatBounds;
  signal?: AbortSignal;
  fetchImpl?: ContourFetch;
  timeoutMs?: number;
}): Promise<ContourLayer | null> {
  if (!boundsIntersect(options.bounds, VICTORIA_BOUNDS)) return null;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const timeoutMs = options.timeoutMs ?? VICMAP_CONTOUR_TIMEOUT_MS;
  const parent = options.signal;
  if (parent?.aborted) {
    const error = new Error("The contour request was cancelled.");
    error.name = "AbortError";
    throw error;
  }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const stop = () => timeout.abort();
  parent?.addEventListener("abort", stop);
  const started = Date.now();
  try {
    const metro = await loadVicmapLayer(
      "vicmap-metro",
      VICMAP_METRO_CONTOUR_URL,
      VICMAP_METRO_DATASET_URL,
      1,
      options.center,
      options.sideM,
      options.bounds,
      timeout.signal,
      fetchImpl,
    );
    if (metro) return metro;
    if (timeoutMs - (Date.now() - started) < 400) return null;
    return await loadVicmapLayer(
      "vicmap-state",
      VICMAP_STATE_CONTOUR_URL,
      VICMAP_STATE_DATASET_URL,
      10,
      options.center,
      options.sideM,
      options.bounds,
      timeout.signal,
      fetchImpl,
    );
  } catch (error) {
    if (parent?.aborted) throw error;
    if (abortError(error) || error instanceof Error) return null;
    return null;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", stop);
  }
}

async function defaultFetch(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Vicmap contours answered ${response.status}.`);
  const json = (await response.json()) as { error?: { message?: string } };
  if (json.error) throw new Error(json.error.message || "Vicmap contours could not be queried.");
  return json;
}

/**
 * Contours for one cut. Inside Victoria this tries Vicmap, then the DEM.
 * Outside Victoria, or when Vicmap times out or errors, it uses the DEM
 * when a terrain field is available.
 */
export async function loadContoursForCut(options: {
  center: LonLat;
  sideM: number;
  bounds: LonLatBounds;
  signal?: AbortSignal;
  fetchImpl?: ContourFetch;
  timeoutMs?: number;
  terrain: () => Promise<TerrainField | null> | TerrainField | null;
}): Promise<ContourLayer | null> {
  const vicmap = await fetchVicmapContours(options);
  if (vicmap && vicmap.lines.length > 0) return vicmap;
  const field = await options.terrain();
  if (!field) return null;
  return demContourLayer(field, options.sideM);
}

function lineMidpoint(line: Pt[]): Pt {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const length = Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
    lengths.push(length);
    total += length;
  }
  let remaining = total / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] === 0 ? 0 : remaining / lengths[i];
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
    }
    remaining -= lengths[i];
  }
  return line[Math.floor(line.length / 2)] ?? line[0];
}

export type DrawnContour = { points: Pt[]; z: number; index: boolean };

export type ContourLabel = { east: number; north: number; text: string };

/**
 * Mark every Nth interval and place one small elevation on the longer index
 * lines. Labels closer than 70 m to one already placed are skipped, and the
 * set stops at 16 so a 1 m hill does not fill the sheet with numbers.
 */
export function drawContours(lines: StoredContour[], interval: number, every: number): {
  lines: DrawnContour[];
  labels: ContourLabel[];
} {
  const drawn: DrawnContour[] = lines.map((line) => ({
    points: line.points,
    z: line.z,
    index: contourIsIndex(line.z, interval, every),
  }));
  const ranked = drawn
    .filter((line) => line.index)
    .map((line) => ({ line, length: polylineLength(line.points) }))
    .filter((item) => item.length >= 40)
    .sort((a, b) => b.length - a.length);
  const labels: ContourLabel[] = [];
  for (const item of ranked) {
    if (labels.length >= 16) break;
    const at = lineMidpoint(item.line.points);
    const crowded = labels.some((label) => Math.hypot(label.east - at[0], label.north - at[1]) < 70);
    if (crowded) continue;
    labels.push({ east: at[0], north: at[1], text: formatContourElevation(item.line.z) });
  }
  return { lines: drawn, labels };
}
