import { openRing, polylineLength, signedArea } from "./geo";
import type { AreaFeat, BuildingFeat, Pt, RoadFeat } from "../types";

function centroid(ring: Pt[]): Pt {
  const points = openRing(ring);
  if (points.length === 0) return [0, 0];
  let east = 0;
  let north = 0;
  for (const point of points) {
    east += point[0];
    north += point[1];
  }
  return [east / points.length, north / points.length];
}

function segmentDistance(point: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-8) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

function ringDistance(point: Pt, ring: Pt[]): number {
  const points = openRing(ring);
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const distance = segmentDistance(point, points[i], points[(i + 1) % points.length]);
    if (distance < best) best = distance;
  }
  return best;
}

/** Same outline, allowing a metre or two of node jitter from a duplicate import. */
export function footprintsMatch(a: Pt[], b: Pt[]): boolean {
  const left = centroid(a);
  const right = centroid(b);
  if (Math.hypot(left[0] - right[0], left[1] - right[1]) > 6) return false;
  const areaA = Math.abs(signedArea(a));
  const areaB = Math.abs(signedArea(b));
  const larger = Math.max(areaA, areaB, 1);
  if (Math.abs(areaA - areaB) / larger > 0.25) return false;
  const close = (ring: Pt[], other: Pt[]) => {
    const points = openRing(ring);
    if (points.length === 0) return false;
    const step = Math.max(1, Math.floor(points.length / 12));
    let hits = 0;
    let samples = 0;
    for (let i = 0; i < points.length; i += step) {
      samples += 1;
      if (ringDistance(points[i], other) <= 2.2) hits += 1;
    }
    return hits / samples >= 0.7;
  };
  return close(a, b) && close(b, a);
}

function cellKey(point: Pt, size: number): string {
  return `${Math.floor(point[0] / size)}:${Math.floor(point[1] / size)}`;
}

function nearby<T>(buckets: Map<string, T[]>, point: Pt, size: number): T[] {
  const cx = Math.floor(point[0] / size);
  const cy = Math.floor(point[1] / size);
  const found: T[] = [];
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      const bucket = buckets.get(`${x}:${y}`);
      if (bucket) found.push(...bucket);
    }
  }
  return found;
}

function buildingScore(building: BuildingFeat): number {
  const known = building.source === "none" ? 0 : 1_000_000;
  return known + building.height * 100 + Math.abs(signedArea(building.ring));
}

/** Drop ways and relation parts that trace the same footprint. Keeps the tagged use. */
export function dedupeBuildings(buildings: BuildingFeat[]): BuildingFeat[] {
  const cell = 8;
  const buckets = new Map<string, BuildingFeat[]>();
  const kept: BuildingFeat[] = [];
  for (const building of buildings) {
    const at = centroid(building.ring);
    const twins = nearby(buckets, at, cell).filter((other) => footprintsMatch(other.ring, building.ring));
    if (twins.length === 0) {
      kept.push(building);
      const key = cellKey(at, cell);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(building);
      else buckets.set(key, [building]);
      continue;
    }
    const best = twins.reduce((winner, other) => (buildingScore(other) > buildingScore(winner) ? other : winner));
    if (buildingScore(building) <= buildingScore(best)) continue;
    const index = kept.indexOf(best);
    if (index >= 0) kept[index] = building;
    for (const bucket of buckets.values()) {
      const slot = bucket.indexOf(best);
      if (slot >= 0) bucket[slot] = building;
    }
  }
  return kept;
}

/** Drop a second copy of the same park or water polygon. */
export function dedupeAreas(areas: AreaFeat[]): AreaFeat[] {
  const cell = 12;
  const buckets = new Map<string, AreaFeat[]>();
  const kept: AreaFeat[] = [];
  for (const area of areas) {
    const at = centroid(area.ring);
    const twin = nearby(buckets, at, cell).find(
      (other) => other.kind === area.kind && footprintsMatch(other.ring, area.ring),
    );
    if (!twin) {
      kept.push(area);
      const key = cellKey(at, cell);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(area);
      else buckets.set(key, [area]);
      continue;
    }
    if (Math.abs(signedArea(area.ring)) <= Math.abs(signedArea(twin.ring))) continue;
    const index = kept.indexOf(twin);
    if (index >= 0) kept[index] = area;
    for (const bucket of buckets.values()) {
      const slot = bucket.indexOf(twin);
      if (slot >= 0) bucket[slot] = area;
    }
  }
  return kept;
}

function roadKey(road: RoadFeat): string {
  const line = road.line.map((point) => `${Math.round(point[0] * 2) / 2},${Math.round(point[1] * 2) / 2}`).join(";");
  return `${road.kind}|${road.deck ? "deck" : "ground"}|${line}`;
}

/** Drop a second copy of the same centerline. The wider carriageway stays. */
export function dedupeRoads(roads: RoadFeat[]): { roads: RoadFeat[]; metres: number } {
  const seen = new Map<string, number>();
  const kept: RoadFeat[] = [];
  for (const road of roads) {
    const key = roadKey(road);
    const index = seen.get(key);
    if (index === undefined) {
      seen.set(key, kept.length);
      kept.push(road);
      continue;
    }
    if (road.width > kept[index].width) kept[index] = road;
  }
  const metres = kept.reduce((sum, road) => sum + polylineLength(road.line), 0);
  return { roads: kept, metres };
}
