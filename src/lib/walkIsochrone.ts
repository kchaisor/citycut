import { toLocal } from "./geo";
import type { LonLat, Pt } from "../types";

export const WALK_MINUTES = [5, 10, 15] as const;
export type WalkMinutes = (typeof WALK_MINUTES)[number];
export const WALK_M_PER_MIN = 80;
export const WALK_TIMEOUT_MS = 8000;
export const WALK_ENDPOINT = "https://valhalla1.openstreetmap.de/isochrone";
export const WALK_SOURCE_LABEL = "Walking area · Valhalla (OpenStreetMap)";
export const WALK_ATTRIBUTION = "© OpenStreetMap contributors · Valhalla";
export const WALK_FALLBACK_LABEL = "Estimate · straight-line circle (walking service unavailable)";
export const WALK_PENDING_LABEL = "Estimate · straight-line circle (loading walking area)";

export type WalkPolygons = Pt[][][];

export type WalkFailure = "network" | "timeout" | "http" | "malformed" | "blocked";

export type WalkStatus = "live" | "pending" | "fallback";

export type WalkArea = {
  minutes: WalkMinutes;
  centre: Pt;
  polygons: WalkPolygons;
  status: WalkStatus;
  reason: WalkFailure | null;
};

export type WalkFetchResult =
  | { status: "ok"; contours: Record<WalkMinutes, WalkPolygons> }
  | { status: "fallback"; reason: WalkFailure; httpStatus: number | null };

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const BLOCKING_STATUS = new Set([401, 403, 429]);

export function walkRadiusM(minutes: number): number {
  return minutes * WALK_M_PER_MIN;
}

export function walkCircle(centre: Pt, radius: number, segments = 72): WalkPolygons {
  const ring: Pt[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([centre[0] + Math.cos(a) * radius, centre[1] + Math.sin(a) * radius]);
  }
  return [[ring]];
}

export function estimateArea(centre: Pt, minutes: WalkMinutes, status: Exclude<WalkStatus, "live">, reason: WalkFailure | null): WalkArea {
  return { minutes, centre, polygons: walkCircle(centre, walkRadiusM(minutes)), status, reason };
}

export function isochroneUrl(at: LonLat, minutes: readonly number[] = WALK_MINUTES, endpoint = WALK_ENDPOINT): string {
  const body = {
    locations: [{ lat: Number(at.lat.toFixed(6)), lon: Number(at.lon.toFixed(6)) }],
    costing: "pedestrian",
    contours: minutes.map((time) => ({ time })),
    polygons: true,
  };
  return `${endpoint}?json=${encodeURIComponent(JSON.stringify(body))}`;
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function parseRing(raw: unknown, origin: LonLat): Pt[] | null {
  if (!Array.isArray(raw) || !raw.every(isPosition)) return null;
  const ring = raw.map(([lon, lat]) => toLocal(lat, lon, origin));
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring.length >= 3 ? ring : null;
}

function parsePolygon(raw: unknown, origin: LonLat): Pt[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rings = raw.map((ring) => parseRing(ring, origin));
  if (!rings[0]) return null;
  return rings.filter((ring): ring is Pt[] => ring !== null);
}

export function parseIsochrone(json: unknown, origin: LonLat, minutes: readonly WalkMinutes[] = WALK_MINUTES): Record<WalkMinutes, WalkPolygons> | null {
  if (!json || typeof json !== "object") return null;
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return null;
  const out = {} as Record<WalkMinutes, WalkPolygons>;
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const contour = Number((feature as { properties?: { contour?: unknown } }).properties?.contour);
    const geometry = (feature as { geometry?: { type?: unknown; coordinates?: unknown } }).geometry;
    if (!geometry || !minutes.includes(contour as WalkMinutes)) continue;
    let polygons: WalkPolygons | null = null;
    if (geometry.type === "Polygon") {
      const polygon = parsePolygon(geometry.coordinates, origin);
      polygons = polygon ? [polygon] : null;
    } else if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      const parts = geometry.coordinates.map((p) => parsePolygon(p, origin));
      polygons = parts.every((p) => p !== null) && parts.length > 0 ? (parts as Pt[][][]) : null;
    }
    if (!polygons) return null;
    out[contour as WalkMinutes] = polygons;
  }
  return minutes.every((m) => out[m]) ? out : null;
}

export async function fetchWalkContours(
  at: LonLat,
  origin: LonLat,
  options: { fetch: FetchLike; signal?: AbortSignal; timeoutMs?: number; endpoint?: string },
): Promise<WalkFetchResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? WALK_TIMEOUT_MS);
  try {
    const response = await options.fetch(isochroneUrl(at, WALK_MINUTES, options.endpoint), { signal: controller.signal });
    if (!response.ok) return { status: "fallback", reason: BLOCKING_STATUS.has(response.status) ? "blocked" : "http", httpStatus: response.status };
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { status: "fallback", reason: timedOut ? "timeout" : "malformed", httpStatus: response.status };
    }
    const contours = parseIsochrone(json, origin);
    return contours ? { status: "ok", contours } : { status: "fallback", reason: "malformed", httpStatus: response.status };
  } catch {
    return { status: "fallback", reason: timedOut ? "timeout" : "network", httpStatus: null };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function walkCacheKey(at: LonLat): string {
  return `${at.lat.toFixed(4)},${at.lon.toFixed(4)}`;
}

export class WalkIsochroneService {
  private readonly cache = new Map<string, Record<WalkMinutes, WalkPolygons>>();
  private blocked = false;

  constructor(
    private readonly fetcher: FetchLike | null,
    private readonly timeoutMs = WALK_TIMEOUT_MS,
  ) {}

  get unavailable(): boolean {
    return this.blocked || !this.fetcher;
  }

  cached(at: LonLat): Record<WalkMinutes, WalkPolygons> | null {
    return this.cache.get(walkCacheKey(at)) ?? null;
  }

  async request(at: LonLat, origin: LonLat, signal?: AbortSignal): Promise<WalkFetchResult> {
    const hit = this.cached(at);
    if (hit) return { status: "ok", contours: hit };
    if (!this.fetcher || this.blocked) return { status: "fallback", reason: "blocked", httpStatus: null };
    const result = await fetchWalkContours(at, origin, { fetch: this.fetcher, signal, timeoutMs: this.timeoutMs });
    if (result.status === "ok") this.cache.set(walkCacheKey(at), result.contours);
    else if (result.reason === "blocked") this.blocked = true;
    return result;
  }
}

export function browserFetch(): FetchLike | null {
  if (typeof fetch !== "function") return null;
  return (input, init) => fetch(input, { signal: init?.signal, mode: "cors", credentials: "omit" });
}

let shared: WalkIsochroneService | null = null;

export function sessionWalkService(): WalkIsochroneService {
  if (!shared) shared = new WalkIsochroneService(browserFetch());
  return shared;
}
