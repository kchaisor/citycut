import type { MultiPolygon, Pair, Polygon } from "./safePolygonClip";
import {
  clipDifference as difference,
  clipIntersection as intersection,
  clipUnion as union,
} from "./safePolygonClip";
import { openRing } from "./geo";
import { siteFramePolygon } from "./siteFrame";
import { sunAtMelbourneLocal, type SolarSample } from "./solar";
import { buildingHeightsFingerprint } from "./heightOverrides";
import { footprintBase, sampleTerrain } from "./terrain";
import { planTreeShadowMulti } from "./solarTreePlanShadow";
import type { BuildingFeat, CityModel, Pt, Ring, TreeFeat } from "../types";

export type PlanShadowTreeMode = "off" | "both" | "proposed-only";

export function isProposedMassingBuilding(building: BuildingFeat): boolean {
  return Boolean(building.importedMassing || building.proposedMassing);
}

export function proposedMassingInModel(model: CityModel): boolean {
  return model.buildings.some(isProposedMassingBuilding);
}

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

export function planShadowOffset(sample: SolarSample, height: number): Pt | null {
  if (!sample.aboveHorizon || sample.direction[1] <= 1e-6 || height <= 0) return null;
  const [dx, dy, dz] = sample.direction;
  const scale = -height / dy;
  return [dx * scale, -dz * scale];
}

type Ground = (east: number, north: number) => number;

export function terrainShadowOffset(sample: SolarSample, point: Pt, topZ: number, ground: Ground): Pt | null {
  const unit = planShadowOffset(sample, 1);
  if (!unit) return null;
  const perMetre = Math.hypot(unit[0], unit[1]);
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

export function buildingShadowPolygonOnTerrain(
  building: BuildingFeat,
  offsetAt: (point: Pt) => Pt,
  snap = 1e-3,
): MultiPolygon | null {
  const footprint = footprintPolygon(building.ring, building.holes);
  if (!footprint) return null;
  const q = (v: number) => Math.round(v / snap) * snap;
  const qp = (p: Pt): Pair => [q(p[0]), q(p[1])];
  const pieces: Polygon[] = [footprint.map((ring) => ring.map((pair) => qp(pair as Pt))) as Polygon];
  for (const ringPts of [building.ring, ...building.holes]) {
    const ring = openRing(ringPts);
    const moved = ring.map((p) => translatePoint(p, offsetAt(p)));
    for (let index = 0; index < ring.length; index++) {
      const next = (index + 1) % ring.length;
      const quad = [qp(ring[index]!), qp(ring[next]!), qp(moved[next]!), qp(moved[index]!)];
      if (Math.abs(ringArea(quad)) < snap * snap) continue;
      pieces.push([[...quad, quad[0]!]]);
    }
    if (ringPts === building.ring) {
      const roof = moved.map(qp);
      if (roof.length >= 3 && Math.abs(ringArea(roof)) >= snap * snap) pieces.push([[...roof, roof[0]!]]);
    }
  }
  return union(pieces[0]!, ...pieces.slice(1));
}

function ringArea(ring: Pair[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function snapMulti(multi: MultiPolygon, snap: number): MultiPolygon {
  const q = (v: number) => Math.round(v / snap) * snap;
  return multi.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [q(x), q(y)] as Pair)));
}

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
  let shadow: MultiPolygon | null = null;
  if (terrain) {
    const offsetAt = (p: Pt) => terrainShadowOffset(sample, p, terrain.topZ, terrain.ground) ?? [0, 0];
    for (const snap of [1e-3, 1e-2]) {
      try {
        shadow = buildingShadowPolygonOnTerrain(building, offsetAt, snap);
        break;
      } catch {
        shadow = null;
      }
    }
    if (!shadow) shadow = safeFlatShadow(building, offset);
  } else {
    shadow = safeFlatShadow(building, offset);
  }
  buildingShadowCache.set(key, shadow);
  return shadow;
}

function safeFlatShadow(building: BuildingFeat, offset: Pt): MultiPolygon | null {
  try {
    return buildingShadowPolygon(building, offset);
  } catch {
    return null;
  }
}

function safeUnion(merged: MultiPolygon, shadow: MultiPolygon): MultiPolygon {
  for (const snap of [0, 1e-3, 1e-2]) {
    try {
      return snap === 0 ? union(merged, shadow) : union(snapMulti(merged, snap), snapMulti(shadow, snap));
    } catch {
    }
  }
  return merged;
}

function safeDifference(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon {
  if (subject.length === 0) return [];
  if (clip.length === 0) return subject;
  for (const snap of [0, 1e-3, 1e-2]) {
    try {
      return snap === 0 ? difference(subject, clip) : difference(snapMulti(subject, snap), snapMulti(clip, snap));
    } catch {
    }
  }
  return subject;
}

function clipShadowToFrame(merged: MultiPolygon, model: CityModel): MultiPolygon {
  if (merged.length === 0) return [];
  const frame = framePolygon(model.sideM, model.frameShape ?? "square");
  try {
    return intersection(merged, frame);
  } catch {
    return intersection(snapMulti(merged, 1e-2), frame);
  }
}

function planShadowMultiForBuildings(
  model: CityModel,
  input: PlanShadowInput,
  buildings: BuildingFeat[],
): MultiPolygon {
  if (buildings.length === 0) return [];
  const sample = sunAtMelbourneLocal(
    input.lat,
    input.lon,
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
  );
  if (!sample.aboveHorizon) return [];
  const field = model.terrain;
  const ground: Ground | null = field ? (east, north) => sampleTerrain(field, east, north, model.sideM) : null;
  const terrainKey = field ? `${field.cols}x${field.rows}:${field.min}:${field.max}:${model.sideM}` : "";
  let merged: MultiPolygon = [];
  for (const building of buildings) {
    if (building.importedMassingSkipShadow) continue;
    const offset = planShadowOffset(sample, building.height);
    if (!offset) continue;
    const topZ = ground
      ? (building.importedTopZ ?? footprintBase(field!, building.ring, model.sideM) + building.height)
      : 0;
    const shadow = cachedBuildingShadow(building, sample, offset, ground ? { ground, topZ, key: terrainKey } : undefined);
    if (!shadow || shadow.length === 0) continue;
    merged = merged.length === 0 ? shadow : safeUnion(merged, shadow);
  }
  return clipShadowToFrame(merged, model);
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

export type PlanShadowSplitRings = {
  existing: Ring[][];
  added: Ring[][];
};

function shadowWithTrees(
  model: CityModel,
  input: PlanShadowInput,
  buildings: readonly BuildingFeat[],
  trees: readonly TreeFeat[],
): MultiPolygon {
  const built = buildings.length > 0 ? planShadowMultiForBuildings(model, input, [...buildings]) : [];
  const treeMulti = trees.length > 0 ? planTreeShadowMulti(model, input, trees) : [];
  if (built.length === 0) return treeMulti;
  if (treeMulti.length === 0) return built;
  return safeUnion(built, treeMulti);
}

export function planShadowSplitRings(
  model: CityModel,
  input: PlanShadowInput,
  castShadows: boolean,
  treeMode: PlanShadowTreeMode = "off",
): PlanShadowSplitRings {
  if (!castShadows) return { existing: [], added: [] };
  const trees = model.trees ?? [];
  const treeExisting = treeMode === "both" ? trees : [];
  const treeProposed = treeMode === "off" ? [] : trees;
  if (model.buildings.length === 0 && treeProposed.length === 0) return { existing: [], added: [] };
  const context = model.buildings.filter((building) => !isProposedMassingBuilding(building));
  const proposed = model.buildings.filter(isProposedMassingBuilding);
  const full = shadowWithTrees(model, input, model.buildings, treeMode === "proposed-only" ? trees : treeProposed);
  if (proposed.length === 0) {
  const existingMulti = shadowWithTrees(model, input, model.buildings, treeExisting);
    return { existing: shadowRingsFromMulti(existingMulti), added: [] };
  }
  const contextOnly = shadowWithTrees(model, input, context, treeExisting);
  const addedMulti = safeDifference(full, contextOnly);
  return {
    existing: shadowRingsFromMulti(contextOnly),
    added: shadowRingsFromMulti(addedMulti),
  };
}

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
  const merged = planShadowMultiForBuildings(model, input, model.buildings);
  if (merged.length === 0) return unionCache;
  unionCache = shadowRingsFromMulti(merged);
  return unionCache;
}

export function clearPlanShadowCache(): void {
  buildingShadowCache.clear();
  unionCacheKey = "";
  unionCache = [];
}

export function importedMassingShadowCasters(buildings: BuildingFeat[]): BuildingFeat[] {
  return buildings.filter((building) => building.importedMassingShadowCaster);
}

export function importedPlanShadowRings(
  model: CityModel,
  input: PlanShadowInput,
  castShadows: boolean,
): Ring[][] {
  const casters = importedMassingShadowCasters(model.buildings);
  if (!castShadows || casters.length === 0) return [];
  return planShadowRings({ ...model, buildings: casters }, input, true);
}
