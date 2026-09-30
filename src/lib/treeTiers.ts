import { pointInPolygon } from "./useCascade";
import { archetypeSize } from "./treeMap";
import { finishTreeSize } from "./trees";
import type { Pt, TreeFeat, TreeTier } from "../types";

export const TREE_DEDUPE_M = 3;
export const INFILL_CLEARANCE_M = 4;
export const INFILL_SPACING_M = 7;
export const MAX_TREE_INSTANCES = 8000;
/** Extra metres beyond half the mapped road width. */
export const ROAD_MASK_BUFFER_M = 2;

const SCRUB_ARCHETYPE = "shrub";
const WOOD_ARCHETYPE = "generic";
const TRIM_ORDER: TreeTier[] = ["canopy", "vicmap", "osm", "com"];

export type MaskPolygon = { ring: Pt[]; holes: Pt[][] };

export type CanopyPatch = MaskPolygon & { kind: "wood" | "forest" | "scrub" };

export type MaskRoad = { line: Pt[]; width: number };

type AssembleInput = {
  com: TreeFeat[];
  osm: TreeFeat[];
  vicmap: TreeFeat[];
  canopy: CanopyPatch[];
  buildings: MaskPolygon[];
  water: MaskPolygon[];
  roads: MaskRoad[];
  rng?: () => number;
};

export type AssembleResult = {
  trees: TreeFeat[];
  capHit: boolean;
  trimmed: Record<TreeTier, number>;
};

class PointIndex {
  private cells = new Map<string, Pt[]>();

  constructor(
    private cell: number,
    points: Pt[] = [],
  ) {
    for (const point of points) this.add(point);
  }

  add(point: Pt) {
    const key = this.key(point);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(point);
    else this.cells.set(key, [point]);
  }

  private key(point: Pt): string {
    return `${Math.floor(point[0] / this.cell)}:${Math.floor(point[1] / this.cell)}`;
  }

  /** True when another point is strictly closer than `metres`. */
  within(point: Pt, metres: number): boolean {
    const cx = Math.floor(point[0] / this.cell);
    const cy = Math.floor(point[1] / this.cell);
    const reach = Math.max(1, Math.ceil(metres / this.cell));
    for (let y = cy - reach; y <= cy + reach; y++) {
      for (let x = cx - reach; x <= cx + reach; x++) {
        const bucket = this.cells.get(`${x}:${y}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (Math.hypot(other[0] - point[0], other[1] - point[1]) < metres) return true;
        }
      }
    }
    return false;
  }
}

/** Drop incoming trees that sit within `metres` of one already kept. */
export function omitWithin(existing: Pt[], incoming: TreeFeat[], metres: number): TreeFeat[] {
  if (incoming.length === 0 || existing.length === 0) return incoming.slice();
  const index = new PointIndex(metres, existing);
  return incoming.filter((tree) => !index.within(tree.at, metres));
}

function evenSample<T>(items: T[], keep: number): T[] {
  if (keep <= 0) return [];
  if (items.length <= keep) return items.slice();
  const step = items.length / keep;
  const out: T[] = [];
  for (let i = 0; i < keep; i++) out.push(items[Math.min(items.length - 1, Math.floor(i * step))]);
  return out;
}

export function capTreeInstances(
  groups: Record<TreeTier, TreeFeat[]>,
  cap = MAX_TREE_INSTANCES,
): { trees: TreeFeat[]; capHit: boolean; trimmed: Record<TreeTier, number> } {
  const next: Record<TreeTier, TreeFeat[]> = {
    com: groups.com.slice(),
    osm: groups.osm.slice(),
    vicmap: groups.vicmap.slice(),
    canopy: groups.canopy.slice(),
  };
  const trimmed: Record<TreeTier, number> = { com: 0, osm: 0, vicmap: 0, canopy: 0 };
  let total = next.com.length + next.osm.length + next.vicmap.length + next.canopy.length;
  if (total > cap) {
    for (const tier of TRIM_ORDER) {
      if (total <= cap) break;
      const drop = Math.min(total - cap, next[tier].length);
      trimmed[tier] = drop;
      next[tier] = evenSample(next[tier], next[tier].length - drop);
      total -= drop;
    }
  }
  if (trimmed.canopy + trimmed.vicmap + trimmed.osm + trimmed.com > 0) {
    console.info(
      `CityCut capped trees at ${cap}. Trimmed ${trimmed.canopy} canopy infill, ${trimmed.vicmap} Vicmap, ${trimmed.osm} OpenStreetMap, and ${trimmed.com} City of Melbourne.`,
    );
  }
  return {
    trees: [...next.com, ...next.osm, ...next.vicmap, ...next.canopy],
    capHit: total < groups.com.length + groups.osm.length + groups.vicmap.length + groups.canopy.length,
    trimmed,
  };
}

function distanceToSegment(point: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  if (length < 1e-6) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

type Segment = { a: Pt; b: Pt; reach: number };

class SegmentIndex {
  private cells = new Map<string, Segment[]>();
  private cell = 24;

  add(segment: Segment) {
    const pad = segment.reach;
    const minX = Math.min(segment.a[0], segment.b[0]) - pad;
    const maxX = Math.max(segment.a[0], segment.b[0]) + pad;
    const minY = Math.min(segment.a[1], segment.b[1]) - pad;
    const maxY = Math.max(segment.a[1], segment.b[1]) + pad;
    const x0 = Math.floor(minX / this.cell);
    const x1 = Math.floor(maxX / this.cell);
    const y0 = Math.floor(minY / this.cell);
    const y1 = Math.floor(maxY / this.cell);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = `${x}:${y}`;
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(segment);
        else this.cells.set(key, [segment]);
      }
    }
  }

  hits(point: Pt): boolean {
    const key = `${Math.floor(point[0] / this.cell)}:${Math.floor(point[1] / this.cell)}`;
    const bucket = this.cells.get(key);
    if (!bucket) return false;
    for (const segment of bucket) {
      if (distanceToSegment(point, segment.a, segment.b) < segment.reach) return true;
    }
    return false;
  }
}

class PolygonIndex {
  private cells = new Map<string, MaskPolygon[]>();
  private cell = 32;

  add(polygon: MaskPolygon) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of polygon.ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const x0 = Math.floor(minX / this.cell);
    const x1 = Math.floor(maxX / this.cell);
    const y0 = Math.floor(minY / this.cell);
    const y1 = Math.floor(maxY / this.cell);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = `${x}:${y}`;
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(polygon);
        else this.cells.set(key, [polygon]);
      }
    }
  }

  contains(point: Pt): boolean {
    const key = `${Math.floor(point[0] / this.cell)}:${Math.floor(point[1] / this.cell)}`;
    const bucket = this.cells.get(key);
    if (!bucket) return false;
    return bucket.some((polygon) => pointInPolygon(point, polygon.ring, polygon.holes));
  }
}

function ringBounds(ring: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Poisson-disc points at about 7 m. Candidates land between one and two
 * spacings from an existing sample, and nothing closer than the spacing is kept.
 */
export function poissonDisc(
  patch: CanopyPatch,
  spacing: number,
  blocked: (point: Pt) => boolean,
  rng: () => number,
): Pt[] {
  const bounds = ringBounds(patch.ring);
  if (!Number.isFinite(bounds.minX) || bounds.maxX - bounds.minX < 1 || bounds.maxY - bounds.minY < 1) {
    return [];
  }
  const cell = spacing / Math.SQRT2;
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cell));
  const grid = new Array<number>(cols * rows).fill(-1);
  const points: Pt[] = [];
  const active: number[] = [];

  const cellOf = (point: Pt) => {
    const col = Math.min(cols - 1, Math.max(0, Math.floor((point[0] - bounds.minX) / cell)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((point[1] - bounds.minY) / cell)));
    return row * cols + col;
  };

  const tooClose = (point: Pt) => {
    const col = Math.floor((point[0] - bounds.minX) / cell);
    const row = Math.floor((point[1] - bounds.minY) / cell);
    for (let y = row - 2; y <= row + 2; y++) {
      if (y < 0 || y >= rows) continue;
      for (let x = col - 2; x <= col + 2; x++) {
        if (x < 0 || x >= cols) continue;
        const index = grid[y * cols + x];
        if (index < 0) continue;
        if (Math.hypot(points[index][0] - point[0], points[index][1] - point[1]) < spacing) return true;
      }
    }
    return false;
  };

  const accept = (point: Pt) => {
    if (!pointInPolygon(point, patch.ring, patch.holes)) return false;
    if (blocked(point)) return false;
    if (tooClose(point)) return false;
    const index = points.length;
    points.push(point);
    grid[cellOf(point)] = index;
    active.push(index);
    return true;
  };

  for (let attempt = 0; attempt < 40 && active.length === 0; attempt++) {
    accept([
      bounds.minX + rng() * (bounds.maxX - bounds.minX),
      bounds.minY + rng() * (bounds.maxY - bounds.minY),
    ]);
  }
  if (active.length === 0) return [];

  while (active.length > 0 && points.length < 20000) {
    const slot = Math.floor(rng() * active.length);
    const origin = points[active[slot]];
    let placed = false;
    for (let k = 0; k < 12; k++) {
      const angle = rng() * Math.PI * 2;
      const distance = spacing * (1 + rng());
      if (
        accept([
          origin[0] + Math.cos(angle) * distance,
          origin[1] + Math.sin(angle) * distance,
        ])
      ) {
        placed = true;
        break;
      }
    }
    if (!placed) active.splice(slot, 1);
  }
  return points;
}

function canopyTree(id: number, at: Pt, kind: CanopyPatch["kind"]): TreeFeat {
  const archetype = kind === "scrub" ? SCRUB_ARCHETYPE : WOOD_ARCHETYPE;
  const spec = archetypeSize(archetype);
  const sized = finishTreeSize(
    {
      height: spec.height_m,
      crown: spec.crown_diameter_m,
      trunk: spec.trunk_diameter_m,
      crownMeasured: false,
      trunkMeasured: false,
      sizeSource: "default",
    },
    archetype,
  );
  return { id, at, ...sized, tier: "canopy", archetype };
}

export function fillCanopy(
  patches: CanopyPatch[],
  mask: { buildings: MaskPolygon[]; water: MaskPolygon[]; roads: MaskRoad[]; trees: Pt[] },
  rng: () => number = Math.random,
  idStart = 1,
): TreeFeat[] {
  const buildings = new PolygonIndex();
  for (const polygon of mask.buildings) buildings.add(polygon);
  const water = new PolygonIndex();
  for (const polygon of mask.water) water.add(polygon);
  const roads = new SegmentIndex();
  for (const road of mask.roads) {
    const reach = road.width / 2 + ROAD_MASK_BUFFER_M;
    for (let i = 0; i < road.line.length - 1; i++) {
      roads.add({ a: road.line[i], b: road.line[i + 1], reach });
    }
  }
  const existing = new PointIndex(INFILL_CLEARANCE_M, mask.trees);
  const placedIndex = new PointIndex(INFILL_SPACING_M);
  const blocked = (point: Pt) =>
    buildings.contains(point) ||
    water.contains(point) ||
    roads.hits(point) ||
    existing.within(point, INFILL_CLEARANCE_M) ||
    placedIndex.within(point, INFILL_SPACING_M);

  const placed: TreeFeat[] = [];
  let id = idStart;
  for (const patch of patches) {
    const points = poissonDisc(patch, INFILL_SPACING_M, blocked, rng);
    for (const at of points) {
      const tree = canopyTree(id, at, patch.kind);
      id += 1;
      placed.push(tree);
      placedIndex.add(at);
    }
  }
  return placed;
}

function tag(trees: TreeFeat[], tier: TreeTier): TreeFeat[] {
  return trees.map((tree) => (tree.tier === tier ? tree : { ...tree, tier }));
}

/** Priority order, then the instance cap. Canopy is trimmed before Vicmap. */
export function assembleTreeTiers(input: AssembleInput): AssembleResult {
  const com = tag(input.com, "com");
  const osm = tag(omitWithin(com.map((tree) => tree.at), input.osm, TREE_DEDUPE_M), "osm");
  const higher = [...com, ...osm];
  const vicmap = tag(
    omitWithin(higher.map((tree) => tree.at), input.vicmap, TREE_DEDUPE_M),
    "vicmap",
  );
  const canopy = fillCanopy(
    input.canopy,
    {
      buildings: input.buildings,
      water: input.water,
      roads: input.roads,
      trees: [...higher, ...vicmap].map((tree) => tree.at),
    },
    input.rng,
  );
  return capTreeInstances({ com, osm, vicmap, canopy });
}
