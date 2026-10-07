import { squareBBox } from "./geo";
import { clipAreaToSiteFrame, clipPolylineSiteFrame, DEFAULT_SITE_FRAME_SHAPE } from "./siteFrame";
import { fetchTierJson, type FrameBBox } from "./useCascade";
import {
  linesFromGeometry,
  parseFeatureCollection,
  pointFromGeometry,
  polygonsFromGeometry,
  vicmapWfsGetFeatureUrl,
  type VicmapPolygon,
} from "./vicmapWfs";
import type { CityModel, LonLat, Pt } from "../types";

export const AXO_WFS_TIMEOUT_MS = 15_000;
export const AXO_OVERLAY_FEATURE_LIMIT = 2000;

export type OverlayFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; unavailable: true };

export type PlanningOverlayKind = "flood" | "heritage" | "ddo" | "bmo";

export type PlanningOverlayPolygon = VicmapPolygon & { kind: PlanningOverlayKind };

export type TransportRailLine = Pt[][];
export type TransportRailStation = Pt;

export type PtMode = "train" | "tram" | "bus" | "other";

export type PublicTransportLine = { mode: PtMode; line: Pt[] };
export type PublicTransportStop = { mode: PtMode; point: Pt };

export type HydroOverlay = {
  areas: VicmapPolygon[];
  courses: Pt[][];
};

export type TopographyOverlay = {
  contours: { z: number; line: Pt[] }[];
  sourceLabel: string;
};

function frameBBox(model: CityModel): FrameBBox {
  return squareBBox(model.center, model.sideM);
}

function clipPolygons(polygons: VicmapPolygon[], model: CityModel): VicmapPolygon[] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const out: VicmapPolygon[] = [];
  for (const poly of polygons) {
    const clipped = clipAreaToSiteFrame(poly.outer, poly.holes, model.sideM, shape);
    if (!clipped) continue;
    out.push({ outer: clipped[0]!, holes: clipped.slice(1) });
  }
  return out;
}

function clipLines(lines: Pt[][], model: CityModel): Pt[][] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const out: Pt[][] = [];
  for (const line of lines) {
    for (const part of clipPolylineSiteFrame(line, model.sideM, shape)) {
      if (part.length >= 2) out.push(part);
    }
  }
  return out;
}

function classifyPlanningScheme(scheme: unknown): PlanningOverlayKind | null {
  if (typeof scheme !== "string") return null;
  const code = scheme.trim().toUpperCase();
  if (code === "LSIO" || code === "SBO" || code === "FO") return "flood";
  if (code === "HO") return "heritage";
  if (code === "DDO") return "ddo";
  if (code === "BMO") return "bmo";
  return null;
}

async function wfsFeatures(
  typeName: string,
  bounds: FrameBBox,
  propertyName: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const url = vicmapWfsGetFeatureUrl(typeName, bounds, {
    count: AXO_OVERLAY_FEATURE_LIMIT,
    propertyName,
  });
  const body = await fetchTierJson(url, { signal, timeoutMs: AXO_WFS_TIMEOUT_MS });
  if (!body.ok) return null;
  return body.body;
}

export async function fetchPlanningOverlays(
  model: CityModel,
  signal?: AbortSignal,
): Promise<OverlayFetchResult<PlanningOverlayPolygon[]>> {
  const bounds = frameBBox(model);
  const body = await wfsFeatures("open-data-platform:plan_overlay", bounds, "scheme_code,geom", signal);
  if (!body) return { ok: false, unavailable: true };
  const features = parseFeatureCollection(body);
  const polygons: PlanningOverlayPolygon[] = [];
  for (const feature of features) {
    const kind = classifyPlanningScheme(feature.properties.scheme_code);
    if (!kind) continue;
    for (const poly of polygonsFromGeometry(feature.geometry, model.center)) {
      polygons.push({ ...poly, kind });
    }
  }
  const clipped: PlanningOverlayPolygon[] = [];
  for (const poly of polygons) {
    const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
    const rings = clipAreaToSiteFrame(poly.outer, poly.holes, model.sideM, shape);
    if (!rings) continue;
    clipped.push({ outer: rings[0]!, holes: rings.slice(1), kind: poly.kind });
  }
  return { ok: true, data: clipped };
}

async function fetchRailLines(
  model: CityModel,
  typeName: string,
  signal?: AbortSignal,
): Promise<Pt[][] | null> {
  const bounds = frameBBox(model);
  const body = await wfsFeatures(typeName, bounds, "geom", signal);
  if (!body) return null;
  const lines: Pt[][] = [];
  for (const feature of parseFeatureCollection(body)) {
    lines.push(...linesFromGeometry(feature.geometry, model.center));
  }
  return clipLines(lines, model);
}

export async function fetchTransportRail(
  model: CityModel,
  signal?: AbortSignal,
): Promise<OverlayFetchResult<{ lines: TransportRailLine; stations: TransportRailStation[] }>> {
  let lines = await fetchRailLines(model, "open-data-platform:vmlite_tr_rail", signal);
  if (!lines) lines = await fetchRailLines(model, "open-data-platform:tr_rail", signal);
  const bounds = frameBBox(model);
  let stationsBody = await wfsFeatures(
    "open-data-platform:vmlite_tr_rail_station",
    bounds,
    "geom",
    signal,
  );
  if (!stationsBody) {
    stationsBody = await wfsFeatures("open-data-platform:tr_rail_station", bounds, "geom", signal);
  }
  const stations: TransportRailStation[] = [];
  if (stationsBody) {
    for (const feature of parseFeatureCollection(stationsBody)) {
      const point = pointFromGeometry(feature.geometry, model.center);
      if (point) stations.push(point);
    }
  }
  if (!lines && stations.length === 0) return { ok: false, unavailable: true };
  return { ok: true, data: { lines: lines ?? [], stations } };
}

export function ptModeFromValue(value: unknown): PtMode {
  if (typeof value !== "string") return "other";
  const mode = value.trim().toLowerCase();
  if (mode.includes("train") || mode === "rail") return "train";
  if (mode.includes("tram")) return "tram";
  if (mode.includes("bus") || mode === "coach") return "bus";
  return "other";
}

export async function fetchHydroOverlays(
  model: CityModel,
  signal?: AbortSignal,
): Promise<OverlayFetchResult<HydroOverlay>> {
  const bounds = frameBBox(model);
  const [areaBody, courseBody] = await Promise.all([
    wfsFeatures("open-data-platform:hy_water_area_polygon", bounds, "geom", signal),
    wfsFeatures("open-data-platform:hy_watercourse", bounds, "geom", signal),
  ]);
  if (!areaBody && !courseBody) return { ok: false, unavailable: true };
  const areas: VicmapPolygon[] = [];
  const courses: Pt[][] = [];
  if (areaBody) {
    for (const feature of parseFeatureCollection(areaBody)) {
      areas.push(...polygonsFromGeometry(feature.geometry, model.center));
    }
  }
  if (courseBody) {
    for (const feature of parseFeatureCollection(courseBody)) {
      courses.push(...linesFromGeometry(feature.geometry, model.center));
    }
  }
  return {
    ok: true,
    data: {
      areas: clipPolygons(areas, model),
      courses: clipLines(courses, model),
    },
  };
}

function parseContourFeatures(body: unknown, origin: LonLat): { z: number; line: Pt[] }[] {
  const out: { z: number; line: Pt[] }[] = [];
  for (const feature of parseFeatureCollection(body)) {
    const altitude = feature.properties.altitude;
    const z = typeof altitude === "number" ? altitude : Number(altitude);
    if (!Number.isFinite(z)) continue;
    for (const line of linesFromGeometry(feature.geometry, origin)) {
      if (line.length >= 2) out.push({ z, line });
    }
  }
  return out;
}

export async function fetchTopographyContours(
  model: CityModel,
  signal?: AbortSignal,
): Promise<OverlayFetchResult<TopographyOverlay>> {
  const bounds = frameBBox(model);
  let body = await wfsFeatures("open-data-platform:el_contour_1to5m", bounds, "altitude,geom", signal);
  let sourceLabel = "Vicmap Elevation 1–5 m (WFS)";
  if (!body) {
    body = await wfsFeatures("open-data-platform:el_contour", bounds, "altitude,geom", signal);
    sourceLabel = "Vicmap Elevation (WFS)";
  }
  if (!body) return { ok: false, unavailable: true };
  const raw = parseContourFeatures(body, model.center);
  const contours = raw
    .map((item) => ({ z: item.z, line: clipLines([item.line], model)[0] }))
    .filter((item): item is { z: number; line: Pt[] } => Boolean(item.line && item.line.length >= 2));
  return { ok: true, data: { contours, sourceLabel } };
}
