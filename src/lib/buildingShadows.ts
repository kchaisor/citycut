import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon } from "polygon-clipping";
import { openRing } from "./geo";
import { siteFramePolygon } from "./siteFrame";
import { sunAtMelbourneLocal, type SolarSample } from "./solar";
import { buildingHeightsFingerprint } from "./heightOverrides";
import { footprintBase, sampleTerrain } from "./terrain";
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

type Ground = (east: number, north: number) => number;

/**
 * Plan offset of a roof point at absolute height `topZ` to where its shadow meets the terrain:
 * marches along the sun's plan direction until the ray drops below the ground. On a slope the
 * shadow is shorter uphill and longer downhill, exactly as in the 3D view.
 */
export function terrainShadowOffset(sample: SolarSample, point: Pt, topZ: number, ground: Ground): Pt | null {
  const unit = planShadowOffset(sample, 1);
  if (!unit) return null;
  const perMetre = Math.hypot(unit[0], unit[1]); // plan metres per metre of drop
  const u: Pt = [unit[0] / perMetre, unit[1] / perMetre];
  const above = (t: number) => topZ - t / perMetre - ground(point[0] + u[0] * t, point[1] + u[1] * t);
  if (above(0) <= 0) return [0, 0];
  let lo = 0;
  let hi = Math.max(1, (topZ - ground(point[0], point[1])) * perMetre);
  for (let i = 0; i < 40 && above(hi) > 0; i++) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (above(mid) > 0) lo = mid;
    else hi = mid;
  }
  return [u[0] * hi, u[1] * hi];
}

/** Shadow footprint when each vertex has its own offset (roof shadow draped on terrain). */
export function buildingShadowPolygonOnTerrain(
  building: BuildingFeat,
  offsetAt: (point: Pt) => Pt,
): MultiPolygon | null {
  const footprint = footprintPolygon(building.ring, building.holes);
  if (!footprint) return null;
  let merged: MultiPolygon = [footprint];
  for (const ringPts of [building.ring, ...building.holes]) {
    const ring = openRing(ringPts);
    const moved = ring.map((p) => translatePoint(p, offsetAt(p)));
    for (let index = 0; index < ring.length; index++) {
      const next = (index + 1) % ring.length;
      const quad: Polygon = [[
        [ring[index]![0], ring[index]![1]],
        [ring[next]![0], ring[next]![1]],
        [moved[next]![0], moved[next]![1]],
        [moved[index]![0], moved[index]![1]],
        [ring[index]![0], ring[index]![1]],
      ]];
      merged = union(merged, quad);
    }
    if (ringPts === building.ring) {
      const roof = closeRing(moved);
      if (roof.length >= 4) merged = union(merged, [roof]);
    }
  }
  return merged;
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
    (building.importedTopZ ?? NaN).toFixed(3),
    building.ring.length,
    building.holes.length,
    sample.altitudeDeg.toFixed(4),
    sample.azimuthDeg.toFixed(4),
  ].join(":");
}

function cachedBuildingShadow(
  building: BuildingFeat,
  sample: SolarSample,
  offset: Pt,
  terrain?: { ground: Ground; topZ: number; key: string },
): MultiPolygon | null {
  const key = buildingCacheKey(building, sample) + (terrain ? `:t${terrain.key}:${terrain.topZ.toFixed(3)}` : "");
  if (buildingShadowCache.has(key)) return buildingShadowCache.get(key)!;
  const shadow = terrain
    ? buildingShadowPolygonOnTerrain(building, (p) => terrainShadowOffset(sample, p, terrain.topZ, terrain.ground) ?? [0, 0])
    : buildingShadowPolygon(building, offset);
  buildingShadowCache.set(key, shadow);
  return shadow;
}

function unionCacheLookup(model: CityModel, input: PlanShadowInput, castShadows: boolean): string {
  return [
    castShadows ? 1 : 0,
    model.sideM,
    model.terrain ? `${model.terrain.cols}x${model.terrain.rows}:${model.terrain.min}:${model.terrain.max}` : "flat",
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

  // With terrain, shadows land on the ground the 3D view shows: regular buildings stand on their
  // lowest footprint sample (as buildCity extrudes them), imported massing keeps its own roof Z.
  const field = model.terrain;
  const ground: Ground | null = field ? (east, north) => sampleTerrain(field, east, north, model.sideM) : null;
  const terrainKey = field ? `${field.cols}x${field.rows}:${field.min}:${field.max}:${model.sideM}` : "";
  let merged: MultiPolygon = [];
  for (const building of model.buildings) {
    const offset = planShadowOffset(sample, building.height);
    if (!offset) continue;
    const topZ = ground
      ? (building.importedTopZ ?? footprintBase(field!, building.ring, model.sideM) + building.height)
      : 0;
    const shadow = cachedBuildingShadow(building, sample, offset, ground ? { ground, topZ, key: terrainKey } : undefined);
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
