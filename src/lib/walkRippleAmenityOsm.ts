import { squareBBox, toLocal } from "./geo";
import { OVERPASS_URL, type OsmFetch } from "./nswTransport";
import { DEFAULT_SITE_FRAME_SHAPE, pointInSiteFrame } from "./siteFrame";
import {
  WALK_RIPPLE_AMENITY_LABEL,
  type WalkRippleAmenity,
  type WalkRippleAmenityType,
} from "./walkRippleAmenityTypes";
import { walkRippleAmenityCutKey } from "./walkRippleAmenityCutKey";
import type { CityModel } from "../types";

export const WALK_RIPPLE_AMENITY_TIMEOUT_MS = 25_000;

const defaultFetch: OsmFetch = async (url, init) => {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return { status: response.status, json: () => response.json() as Promise<unknown> };
};

type OverpassElement = {
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type CacheEntry = { amenities: WalkRippleAmenity[] } | { unavailable: true };

const cache = new Map<string, CacheEntry>();

export function clearWalkRippleAmenityCacheForTests(): void {
  cache.clear();
}

function classifyAmenityType(tags: Record<string, string>): WalkRippleAmenityType | null {
  const amenity = tags.amenity ?? "";
  const shop = tags.shop ?? "";
  const leisure = tags.leisure ?? "";
  const landuse = tags.landuse ?? "";
  const railway = tags.railway ?? "";
  const highway = tags.highway ?? "";
  const pt = tags.public_transport ?? "";
  if (/^(cafe|restaurant|fast_food|food_court)$/.test(amenity) || shop === "cafe") return "cafe";
  if (/^(school|kindergarten|college|university)$/.test(amenity)) return "school";
  if (/^(park|garden|playground)$/.test(leisure) || landuse === "recreation_ground") return "park";
  if (/^(station|halt|tram_stop)$/.test(railway) || highway === "bus_stop" || /^(stop_position|platform)$/.test(pt)) {
    return "transport";
  }
  return null;
}

function amenityName(type: WalkRippleAmenityType, tags: Record<string, string>): { name: string; inferred: boolean } {
  const raw = tags.name?.trim();
  if (raw) return { name: raw, inferred: false };
  return { name: `${WALK_RIPPLE_AMENITY_LABEL[type]} (OSM)`, inferred: true };
}

function parseElements(
  elements: OverpassElement[],
  model: Pick<CityModel, "center" | "sideM" | "frameShape">,
): WalkRippleAmenity[] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const seen = new Set<number>();
  const out: WalkRippleAmenity[] = [];
  for (const el of elements) {
    const id = el.id;
    if (id == null || seen.has(id)) continue;
    const tags = el.tags ?? {};
    const type = classifyAmenityType(tags);
    if (!type) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const [east, north] = toLocal(lat, lon, model.center);
    if (!pointInSiteFrame([east, north], model.sideM, shape)) continue;
    seen.add(id);
    const { name, inferred } = amenityName(type, tags);
    out.push({ id, type, name, east, north, osmInferredName: inferred });
  }
  return out;
}

function overpassQuery(model: Pick<CityModel, "center" | "sideM">): string {
  const b = squareBBox(model.center, model.sideM);
  const box = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:20];(nwr["amenity"~"^(cafe|restaurant|fast_food|food_court)$"](${box});nwr["shop"="cafe"](${box});nwr["amenity"~"^(school|kindergarten|college|university)$"](${box});nwr["leisure"~"^(park|garden|playground)$"](${box});nwr["landuse"="recreation_ground"](${box});node["railway"~"^(station|halt|tram_stop)$"](${box});node["highway"="bus_stop"](${box});node["public_transport"~"^(stop_position|platform)$"](${box}););out center;`;
}

export type WalkRippleAmenityFetchResult =
  | { status: "ready"; amenities: WalkRippleAmenity[]; fromCache: boolean }
  | { status: "unavailable" };

export async function fetchWalkRippleAmenities(
  model: Pick<CityModel, "center" | "sideM" | "frameShape">,
  options: { signal?: AbortSignal; fetchImpl?: OsmFetch; timeoutMs?: number; skipCache?: boolean } = {},
): Promise<WalkRippleAmenityFetchResult> {
  const key = walkRippleAmenityCutKey(model.center, model.sideM);
  if (!options.skipCache) {
    const hit = cache.get(key);
    if (hit) {
      if ("unavailable" in hit) return { status: "unavailable" };
      return { status: "ready", amenities: hit.amenities, fromCache: true };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? WALK_RIPPLE_AMENITY_TIMEOUT_MS);
  const relay = () => controller.abort();
  options.signal?.addEventListener("abort", relay);

  try {
    const response = await (options.fetchImpl ?? defaultFetch)(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(overpassQuery(model))}`,
      signal: controller.signal,
    });
    if (response.status === 429 || response.status < 200 || response.status >= 300) {
      cache.set(key, { unavailable: true });
      return { status: "unavailable" };
    }
    const body = (await response.json()) as { elements?: OverpassElement[] };
    const amenities = parseElements(body.elements ?? [], model);
    cache.set(key, { amenities });
    return { status: "ready", amenities, fromCache: false };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    cache.set(key, { unavailable: true });
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", relay);
  }
}
