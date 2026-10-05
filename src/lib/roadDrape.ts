import type { Pt, RoadFeat } from "../types";
import { polylineLength } from "./geo";

const DECK_MERGE_SNAP_M = 1.5;

/** Extra height on a bridge deck between the tapered abutments. */
export const BRIDGE_DECK_CLEARANCE_M = 5;

/** Distance from each abutment over which clearance tapers to zero. */
export const BRIDGE_DECK_TAPER_M = 12;

/** Shorter elevated spans stay on the ground-draped centreline. */
export const MIN_DECK_SPAN_M = 12;

/** Normalised distance along `line` of the closest point to `point`. */
export function closestParameter(line: Pt[], point: Pt): number {
  const total = polylineLength(line);
  if (total < 1e-9) return 0;
  let bestDist = Infinity;
  let bestAlong = 0;
  let walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (len * len)));
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    const dist = Math.hypot(point[0] - px, point[1] - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestAlong = walked + t * len;
    }
    walked += len;
  }
  return bestAlong / total;
}

/** Shortest distance from a plan point to a polyline centreline. */
export function distanceToPolyline(line: Pt[], point: Pt): number {
  if (line.length < 2) {
    return Math.hypot(point[0] - line[0][0], point[1] - line[0][1]);
  }
  let bestDist = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (len * len)));
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    bestDist = Math.min(bestDist, Math.hypot(point[0] - px, point[1] - py));
  }
  return bestDist;
}

function endpointsTouch(a: Pt, b: Pt): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= DECK_MERGE_SNAP_M;
}

function joinLines(first: Pt[], second: Pt[]): Pt[] | null {
  const a0 = first[0];
  const a1 = first[first.length - 1];
  const b0 = second[0];
  const b1 = second[second.length - 1];
  if (endpointsTouch(a1, b0)) return [...first, ...second.slice(1)];
  if (endpointsTouch(a1, b1)) return [...first, ...second.slice(0, -1).reverse()];
  if (endpointsTouch(a0, b1)) return [...second, ...first.slice(1)];
  if (endpointsTouch(a0, b0)) return [...second.slice(0, -1).reverse(), ...first];
  return null;
}

function canMergeDeck(a: RoadFeat, b: RoadFeat): boolean {
  return (
    Boolean(a.deck) &&
    Boolean(b.deck) &&
    a.kind === b.kind &&
    (a.grade ?? "local") === (b.grade ?? "local") &&
    Math.abs(a.width - b.width) < 0.05
  );
}

/** Chain deck centreline pieces that meet at the same abutment. */
export function mergeAdjacentDeckRoads(roads: RoadFeat[]): RoadFeat[] {
  if (roads.length <= 1) return roads.slice();
  let pool = roads.map((road) => ({ ...road, line: road.line.slice() }));
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    outer: for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (!canMergeDeck(pool[i], pool[j])) continue;
        const joined = joinLines(pool[i].line, pool[j].line);
        if (!joined || polylineLength(joined) < 0.5) continue;
        pool[i] = { ...pool[i], line: joined };
        pool.splice(j, 1);
        mergedAny = true;
        break outer;
      }
    }
  }
  return pool;
}

/**
 * Planar ramp between the abutment ground heights, plus clearance that
 * tapers to zero at each end. Within the taper, height blends toward the
 * local terrain sample so deck edges meet the ground without gaps.
 */
export function deckHeightAt(
  line: Pt[],
  sample: (east: number, north: number) => number,
  east: number,
  north: number,
  clearance = BRIDGE_DECK_CLEARANCE_M,
  taperM = BRIDGE_DECK_TAPER_M,
): number {
  const ground = sample(east, north);
  const t = closestParameter(line, [east, north]);
  const start = line[0];
  const end = line[line.length - 1];
  const z0 = sample(start[0], start[1]);
  const z1 = sample(end[0], end[1]);
  const base = z0 + t * (z1 - z0);
  const total = polylineLength(line);
  const taper = total < 1e-3 ? 0.5 : Math.min(0.45, taperM / total);
  let extra = clearance;
  if (taper > 0 && t < taper) extra = clearance * (t / taper);
  else if (taper > 0 && t > 1 - taper) extra = clearance * ((1 - t) / taper);
  const elevated = base + extra;
  if (taper > 0 && t < taper) {
    const blend = t / taper;
    const blended = ground + blend * (elevated - ground);
    return Math.max(ground, blended);
  }
  if (taper > 0 && t > 1 - taper) {
    const blend = (1 - t) / taper;
    const blended = ground + blend * (elevated - ground);
    return Math.max(ground, blended);
  }
  return elevated;
}

function lineBounds(line: Pt[]): { minE: number; maxE: number; minN: number; maxN: number } {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const point of line) {
    minE = Math.min(minE, point[0]);
    maxE = Math.max(maxE, point[0]);
    minN = Math.min(minN, point[1]);
    maxN = Math.max(maxN, point[1]);
  }
  return { minE, maxE, minN, maxN };
}

/** Spatial index so batched deck fills only scan nearby centrelines. */
export function deckLinePicker(lines: Pt[][], cellSize = 28): (east: number, north: number) => number {
  if (lines.length === 0) return () => 0;
  if (lines.length === 1) return () => 0;
  const index = new Map<string, number[]>();
  const bounds = lines.map((line) => lineBounds(line));
  lines.forEach((line, lineIndex) => {
    if (line.length < 2) return;
    const box = bounds[lineIndex];
    const col0 = Math.floor(box.minE / cellSize);
    const col1 = Math.floor(box.maxE / cellSize);
    const row0 = Math.floor(box.minN / cellSize);
    const row1 = Math.floor(box.maxN / cellSize);
    for (let col = col0; col <= col1; col++) {
      for (let row = row0; row <= row1; row++) {
        const key = `${col},${row}`;
        const bucket = index.get(key);
        if (bucket) bucket.push(lineIndex);
        else index.set(key, [lineIndex]);
      }
    }
  });
  return (east: number, north: number) => {
    const col = Math.floor(east / cellSize);
    const row = Math.floor(north / cellSize);
    const candidates = new Set<number>();
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const bucket = index.get(`${col + dc},${row + dr}`);
        if (!bucket) continue;
        for (const lineIndex of bucket) candidates.add(lineIndex);
      }
    }
    const scan = candidates.size > 0 ? [...candidates] : lines.map((_, lineIndex) => lineIndex);
    let bestIndex = scan[0];
    let bestDist = Infinity;
    for (const lineIndex of scan) {
      const line = lines[lineIndex];
      if (line.length < 2) continue;
      const dist = distanceToPolyline(line, [east, north]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = lineIndex;
      }
    }
    return bestIndex;
  };
}

/** Terrain sample on the ground; deck height on elevated spans in the same unioned fill. */
export function roadSampleWithDecks(
  deckRoads: RoadFeat[],
  baseSample: (east: number, north: number) => number,
): (east: number, north: number) => number {
  const merged = mergeAdjacentDeckRoads(deckRoads);
  if (merged.length === 0) return baseSample;
  const lines = merged.map((road) => road.line);
  const pickIndex = deckLinePicker(lines);
  const bounds = merged.map((road) => {
    const box = lineBounds(road.line);
    const pad = road.width / 2 + 4;
    return {
      minE: box.minE - pad,
      maxE: box.maxE + pad,
      minN: box.minN - pad,
      maxN: box.maxN + pad,
    };
  });
  const cache = new Map<string, number>();
  return (east: number, north: number) => {
    let near = false;
    for (const box of bounds) {
      if (east >= box.minE && east <= box.maxE && north >= box.minN && north <= box.maxN) {
        near = true;
        break;
      }
    }
    if (!near) return baseSample(east, north);
    const key = `${Math.round(east * 2) / 2},${Math.round(north * 2) / 2}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const road = merged[pickIndex(east, north)];
    const dist = distanceToPolyline(road.line, [east, north]);
    const value =
      dist <= road.width / 2 + 0.35
        ? deckHeightAt(road.line, baseSample, east, north)
        : baseSample(east, north);
    cache.set(key, value);
    return value;
  };
}

/** Deck height using the nearest merged centreline (for batched deck fills). */
export function deckHeightAtNearest(
  lines: Pt[][],
  sample: (east: number, north: number) => number,
  east: number,
  north: number,
  clearance = BRIDGE_DECK_CLEARANCE_M,
  taperM = BRIDGE_DECK_TAPER_M,
): number {
  if (lines.length === 0) return sample(east, north);
  if (lines.length === 1) return deckHeightAt(lines[0], sample, east, north, clearance, taperM);
  const pickIndex = deckLinePicker(lines);
  return deckHeightAt(lines[pickIndex(east, north)], sample, east, north, clearance, taperM);
}
