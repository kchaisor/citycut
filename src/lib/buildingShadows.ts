import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon } from "polygon-clipping";
import { openRing } from "./geo";
import { siteFramePolygon } from "./siteFrame";
import { sunAtMelbourneLocal, type SolarSample } from "./solar";
import { buildingHeightsFingerprint } from "./heightOverrides";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

type ClipFns = {
  union: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
  intersection: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.union === "function") return loaded;
  if (loaded.default && typeof loaded.default.union === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { union, intersection } = clippingFns();

export type PlanShadowInput = {
  lat: number;
  lon: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type ClipRing = Pair[];

function closeRing(points: Pt[]): ClipRing {
  if (points.length < 3) return [];
  const ring: ClipRing = points.map((point) => [point[0], point[1]] as Pair);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

function footprintPolygon(outer: Ring, holes: Ring[]): Polygon | null {
  const contour = closeRing(openRing(outer));
  if (contour.length < 4) return null;
  const polygon: Polygon = [contour];
  for (const hole of holes) {
    const inner = closeRing(openRing(hole));
    if (inner.length >= 4) polygon.push(inner);
  }
  return polygon;
}

function translatePoint(point: Pt, offset: Pt): Pt {
  return [point[0] + offset[0], point[1] + offset[1]];
}

function translatePolygon(polygon: Polygon, offset: Pt): Polygon {
  return polygon.map((ring) =>
    ring.map((pair) => [pair[0] + offset[0], pair[1] + offset[1]] as Pair),
  ) as Polygon;
}

function edgeShadowQuad(a: Pt, b: Pt, offset: Pt): Polygon {
  const a2 = translatePoint(a, offset);
  const b2 = translatePoint(b, offset);
  return [
    [
      [a[0], a[1]] as Pair,
      [b[0], b[1]] as Pair,
      [b2[0], b2[1]] as Pair,
      [a2[0], a2[1]] as Pair,
      [a[0], a[1]] as Pair,
    ],
  ];
}

/** Plan offset from a vertical extrusion of `height` m toward the sun. */
export function planShadowOffset(sample: SolarSample, height: number): Pt | null {
  if (!sample.aboveHorizon || sample.direction[1] <= 1e-6 || height <= 0) return null;
  const [dx, dy, dz] = sample.direction;
  const scale = -height / dy;
  return [dx * scale, -dz * scale];
}

/** Exact shadow footprint for one building (footprint ∪ translation ∪ edge sweeps). */
export function buildingShadowPolygon(building: BuildingFeat, offset: Pt): MultiPolygon | null {
  const footprint = footprintPolygon(building.ring, building.holes);
  if (!footprint) return null;
  const translated = translatePolygon(footprint, offset);
  let merged: MultiPolygon = union(footprint, translated);
  const ring = openRing(building.ring);
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index]!;
    const b = ring[(index + 1) % ring.length]!;
    merged = union(merged, edgeShadowQuad(a, b, offset));
  }
  return merged;
}

function framePolygon(sideM: number, frameShape: import("./siteFrame").SiteFrameShape = "square"): Polygon {
  return siteFramePolygon(sideM, frameShape) as Polygon;
}

function clipRingFromClipRing(ring: ClipRing): import("../types").Ring {
  const points: Pt[] = [];
  for (let index = 0; index < ring.length - 1; index++) {
    const [east, north] = ring[index]!;
    points.push([east, north]);
  }
  return points;
}

/** MultiPolygon → site-plan rings (outer plus holes per polygon). */
export function shadowRingsFromMulti(multi: MultiPolygon): Ring[][] {
  const out: Ring[][] = [];
  for (const polygon of multi) {
    if (polygon.length === 0) continue;
    const rings = polygon.map((ring) => clipRingFromClipRing(ring)).filter((ring) => ring.length >= 3);
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

const buildingShadowCache = new Map<string, MultiPolygon | null>();
let unionCacheKey = "";
let unionCache: Ring[][] = [];

function buildingCacheKey(building: BuildingFeat, sample: SolarSample): string {
  return [
    building.id,
    building.height.toFixed(3),
    building.ring.length,
    building.holes.length,
    sample.altitudeDeg.toFixed(4),
    sample.azimuthDeg.toFixed(4),
  ].join(":");
}

function cachedBuildingShadow(building: BuildingFeat, sample: SolarSample, offset: Pt): MultiPolygon | null {
  const key = buildingCacheKey(building, sample);
  if (buildingShadowCache.has(key)) return buildingShadowCache.get(key)!;
  const shadow = buildingShadowPolygon(building, offset);
  buildingShadowCache.set(key, shadow);
  return shadow;
}

function unionCacheLookup(model: CityModel, input: PlanShadowInput, castShadows: boolean): string {
  return [
    castShadows ? 1 : 0,
    model.sideM,
    buildingHeightsFingerprint(model.buildings),
    input.lat,
    input.lon,
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
  ].join("|");
}

/** Union of all building shadows on the site frame, clipped to the cut square. */
export function planShadowRings(
  model: CityModel,
  input: PlanShadowInput,
  castShadows: boolean,
): Ring[][] {
  const cacheKey = unionCacheLookup(model, input, castShadows);
  if (cacheKey === unionCacheKey) return unionCache;
  unionCacheKey = cacheKey;
  unionCache = [];
  if (!castShadows || model.buildings.length === 0) return unionCache;

  const sample = sunAtMelbourneLocal(
    input.lat,
    input.lon,
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
  );
  if (!sample.aboveHorizon) return unionCache;

  let merged: MultiPolygon = [];
  for (const building of model.buildings) {
    const offset = planShadowOffset(sample, building.height);
    if (!offset) continue;
    const shadow = cachedBuildingShadow(building, sample, offset);
    if (!shadow || shadow.length === 0) continue;
    merged = merged.length === 0 ? shadow : union(merged, shadow);
  }
  if (merged.length === 0) return unionCache;
  merged = intersection(merged, framePolygon(model.sideM, model.frameShape ?? "square"));
  unionCache = shadowRingsFromMulti(merged);
  return unionCache;
}

/** @internal test helper */
export function clearPlanShadowCache(): void {
  buildingShadowCache.clear();
  unionCacheKey = "";
  unionCache = [];
}
