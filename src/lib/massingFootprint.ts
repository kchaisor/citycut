import type { MultiPolygon, Polygon } from "./safePolygonClip";
import { clipUnion as unionFnLoaded } from "./safePolygonClip";
import { placedLocal, type ImportedMassing, type MassingPlacement } from "./massingImport";
import type { BuildingFeat, LonLat, Pt } from "../types";

const unionFn = unionFnLoaded;

const IMPORTED_ID_BASE = -1_000_000;
const IMPORTED_SHADOW_ID_BASE = -2_000_000;

const MIN_PLAN_AREA_M2 = 1e-4;
const UNION_BATCH = 2000;
const UP_FACE_MIN_NZ = 0.92;
const ROOF_Z_BUCKET_M = 0.03;
const ROOF_MIN_ABOVE_M = 0.05;
const ROOF_FLAT_EPS_M = 0.05;

function closeRing(ring: Pt[]): Pt[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function partTriangleStarts(massing: Pick<ImportedMassing, "indices" | "partTriangleStarts">): number[] {
  const total = massing.indices.length / 3;
  const starts = massing.partTriangleStarts;
  if (starts && starts.length >= 2) return starts;
  return [0, total];
}

function sliceMassingTriangles(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement">,
  triStart: number,
  triEnd: number,
): Pick<ImportedMassing, "positions" | "indices" | "placement"> {
  return {
    positions: massing.positions,
    placement: massing.placement,
    indices: massing.indices.subarray(triStart * 3, triEnd * 3),
  };
}

export type ImportedMassingUpperLevel = {
  z: number;
  lines: Pt[][];
};

export function massingFootprint(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement">,
  origin: LonLat,
  zone: number,
): { polygons: MultiPolygon; topZ: number; polygonTops: number[] } {
  const local = placedLocal(massing, massing.placement, origin, zone);
  const tris: Polygon[] = [];
  const triTops: { x: number; y: number; z: number }[] = [];
  let topZ = -Infinity;
  for (let i = 2; i < local.length; i += 3) topZ = Math.max(topZ, local[i]!);
  for (let t = 0; t + 2 < massing.indices.length; t += 3) {
    const a = massing.indices[t]! * 3;
    const b = massing.indices[t + 1]! * 3;
    const c = massing.indices[t + 2]! * 3;
    const ax = local[a]!, ay = local[a + 1]!;
    const bx = local[b]!, by = local[b + 1]!;
    const cx = local[c]!, cy = local[c + 1]!;
    const area = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    if (Math.abs(area) < MIN_PLAN_AREA_M2) continue;
    triTops.push({ x: (ax + bx + cx) / 3, y: (ay + by + cy) / 3, z: Math.max(local[a + 2]!, local[b + 2]!, local[c + 2]!) });
    tris.push(area > 0 ? [[[ax, ay], [bx, by], [cx, cy], [ax, ay]]] : [[[ax, ay], [cx, cy], [bx, by], [ax, ay]]]);
  }
  if (tris.length === 0) return { polygons: [], topZ, polygonTops: [] };
  let merged: MultiPolygon = [];
  for (let i = 0; i < tris.length; i += UNION_BATCH) {
    const batch = tris.slice(i, i + UNION_BATCH);
    merged = unionFn(merged, ...batch, { layer: "imported massing", operation: "union" });
  }
  const polygonTops = merged.map((polygon) => {
    let top = -Infinity;
    const outer = polygon[0] ?? [];
    for (const t of triTops) if (t.z > top && pointInRing(t.x, t.y, outer)) top = t.z;
    return Number.isFinite(top) ? top : topZ;
  });
  return { polygons: merged, topZ, polygonTops };
}

function pointInRing(x: number, y: number, ring: ReadonlyArray<readonly [number, number] | number[]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function footprintGround(outer: Pt[], base: number, groundAt?: (east: number, north: number) => number): number {
  if (!groundAt || outer.length === 0) return base;
  let sum = 0;
  let count = 0;
  for (const [east, north] of outer) {
    const z = groundAt(east, north);
    if (Number.isFinite(z)) {
      sum += z;
      count += 1;
    }
  }
  return count > 0 ? sum / count : base;
}

type RoofHit = { bucket: number; poly: Polygon };

function upwardRoofHits(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement">,
  origin: LonLat,
  zone: number,
): RoofHit[] {
  const local = placedLocal(massing, massing.placement, origin, zone);
  const hits: RoofHit[] = [];
  for (let t = 0; t + 2 < massing.indices.length; t += 3) {
    const ia = massing.indices[t]! * 3;
    const ib = massing.indices[t + 1]! * 3;
    const ic = massing.indices[t + 2]! * 3;
    const ax = local[ia]!, ay = local[ia + 1]!, az = local[ia + 2]!;
    const bx = local[ib]!, by = local[ib + 1]!, bz = local[ib + 2]!;
    const cx = local[ic]!, cy = local[ic + 1]!, cz = local[ic + 2]!;
    const planArea = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    const dzMax = Math.max(Math.abs(az - bz), Math.abs(bz - cz), Math.abs(az - cz));
    if (dzMax <= ROOF_FLAT_EPS_M) {
      if (Math.abs(planArea) < MIN_PLAN_AREA_M2) continue;
    } else {
      const ux = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      const uy = (bz - az) * (cy - ay) - (cz - az) * (by - ay);
      const uz = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      const length = Math.hypot(ux, uy, uz);
      if (!(length > 1e-9)) continue;
      if (Math.abs(uz) / length < UP_FACE_MIN_NZ) continue;
      if (Math.abs(planArea) < MIN_PLAN_AREA_M2) continue;
    }
    const topZ = Math.max(az, bz, cz);
    const bucket = Math.round(topZ / ROOF_Z_BUCKET_M) * ROOF_Z_BUCKET_M;
    const poly: Polygon =
      planArea > 0
        ? [[[ax, ay], [bx, by], [cx, cy], [ax, ay]]]
        : [[[ax, ay], [cx, cy], [bx, by], [ax, ay]]];
    hits.push({ bucket, poly });
  }
  return hits;
}

function bucketRoofPolygons(hits: RoofHit[]): Map<number, Polygon[]> {
  const buckets = new Map<number, Polygon[]>();
  for (const hit of hits) {
    const list = buckets.get(hit.bucket) ?? [];
    list.push(hit.poly);
    buckets.set(hit.bucket, list);
  }
  return buckets;
}

function unionBucket(polys: Polygon[]): MultiPolygon {
  if (polys.length === 0) return [];
  let merged: MultiPolygon = [];
  for (let i = 0; i < polys.length; i += UNION_BATCH) {
    const batch = polys.slice(i, i + UNION_BATCH);
    merged = unionFn(merged, ...batch, { layer: "imported massing upper", operation: "union" });
  }
  return merged;
}

function ringsFromMerged(merged: MultiPolygon): Pt[][] {
  const lines: Pt[][] = [];
  for (const polygon of merged) {
    for (const ring of polygon) {
      if ((ring as Pt[]).length < 4) continue;
      lines.push(closeRing(ring as Pt[]));
    }
  }
  return lines;
}

function ringKey(ring: Pt[]): string {
  const open = ring.length > 0 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
    ? ring.slice(0, -1)
    : ring;
  return open
    .map((p) => `${p[0]!.toFixed(3)},${p[1]!.toFixed(3)}`)
    .sort()
    .join("|");
}

function dedupeRings(rings: Pt[][]): Pt[][] {
  const seen = new Set<string>();
  const out: Pt[][] = [];
  for (const ring of rings) {
    const key = ringKey(ring);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ring);
  }
  return out;
}

function roofBucketsForMassing(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement" | "partTriangleStarts">,
  origin: LonLat,
  zone: number,
): Map<number, Polygon[]> {
  const starts = partTriangleStarts(massing);
  const merged = new Map<number, Polygon[]>();
  for (let part = 0; part + 1 < starts.length; part++) {
    const slice = sliceMassingTriangles(massing, starts[part]!, starts[part + 1]!);
    const partBuckets = bucketRoofPolygons(upwardRoofHits(slice, origin, zone));
    for (const [bucket, polys] of partBuckets) {
      const list = merged.get(bucket) ?? [];
      list.push(...polys);
      merged.set(bucket, list);
    }
  }
  return merged;
}

function roofLevelsAboveFloor(
  buckets: Map<number, Polygon[]>,
  placement: MassingPlacement,
): number[] {
  const floorCutoff = placement.base + ROOF_MIN_ABOVE_M;
  return [...buckets.keys()].filter((z) => z > floorCutoff).sort((a, b) => a - b);
}

export function massingPodiumRoofFootprints(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement" | "partTriangleStarts">,
  origin: LonLat,
  zone: number,
): { podiumZ: number; polygons: MultiPolygon } {
  const buckets = roofBucketsForMassing(massing, origin, zone);
  const levels = roofLevelsAboveFloor(buckets, massing.placement);
  if (levels.length === 0) {
    return { podiumZ: massing.placement.base, polygons: [] };
  }
  const podiumZ = levels[0]!;
  return { podiumZ, polygons: unionBucket(buckets.get(podiumZ) ?? []) };
}

export function massingUpperLevelOutlines(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement" | "partTriangleStarts">,
  origin: LonLat,
  zone: number,
): ImportedMassingUpperLevel[] {
  const buckets = roofBucketsForMassing(massing, origin, zone);
  const levels = roofLevelsAboveFloor(buckets, massing.placement);
  if (levels.length <= 1) return [];
  const podiumRoofZ = levels[0]!;
  const out: ImportedMassingUpperLevel[] = [];
  for (const z of levels) {
    if (z <= podiumRoofZ + ROOF_MIN_ABOVE_M) continue;
    const merged = unionBucket(buckets.get(z) ?? []);
    const lines = dedupeRings(ringsFromMerged(merged));
    if (lines.length === 0) continue;
    out.push({ z, lines });
  }
  return out;
}

export type MassingPlanOutlineSummary = {
  podiumZ: number;
  podiumRings: Pt[][];
  towerRings: Pt[][];
};

export function massingPlanOutlineSummary(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement" | "partTriangleStarts">,
  origin: LonLat,
  zone: number,
): MassingPlanOutlineSummary {
  const { podiumZ, polygons } = massingPodiumRoofFootprints(massing, origin, zone);
  const podiumRings = dedupeRings(ringsFromMerged(polygons));
  const towerRings = dedupeRings(massingUpperLevelOutlines(massing, origin, zone).flatMap((level) => level.lines));
  return { podiumZ, podiumRings, towerRings };
}

export function massingUpperLevelPlanLines(
  imported: ImportedMassing[],
  origin: LonLat,
  zone: number,
): ImportedMassingUpperLevel[] {
  const byZ = new Map<number, Pt[][]>();
  for (const item of imported) {
    if (!item.visible) continue;
    for (const level of massingUpperLevelOutlines(item, origin, zone)) {
      const lines = byZ.get(level.z) ?? [];
      lines.push(...level.lines);
      byZ.set(level.z, lines);
    }
  }
  return [...byZ.entries()]
    .sort(([a], [b]) => a - b)
    .map(([z, lines]) => ({ z, lines: dedupeRings(lines) }));
}

function massingShadowCasters(
  item: ImportedMassing,
  origin: LonLat,
  zone: number,
  groundAt: ((east: number, north: number) => number) | undefined,
  nextId: () => number,
): BuildingFeat[] {
  const buckets = roofBucketsForMassing(item, origin, zone);
  const levels = [...buckets.keys()].sort((a, b) => a - b);
  const out: BuildingFeat[] = [];
  for (const z of levels) {
    const merged = unionBucket(buckets.get(z) ?? []);
    for (const polygon of merged) {
      const [outer, ...holes] = polygon;
      if (!outer || outer.length < 4) continue;
      const ring = closeRing(outer as Pt[]);
      const ground = footprintGround(ring, item.placement.base, groundAt);
      const height = Math.max(0.5, z - ground);
      out.push({
        id: nextId(),
        ring,
        holes: holes.map((hole) => closeRing(hole as Pt[])),
        height,
        use: "unclassified",
        source: "none",
        importedMassing: true,
        importedMassingShadowCaster: true,
        importedTopZ: z,
        overtureName: item.name,
      });
    }
  }
  return out;
}

export function massingDrawingBuildings(
  imported: ImportedMassing[],
  origin: LonLat,
  zone: number,
  groundAt?: (east: number, north: number) => number,
): BuildingFeat[] {
  const out: BuildingFeat[] = [];
  let nextFill = IMPORTED_ID_BASE;
  let nextShadow = IMPORTED_SHADOW_ID_BASE;
  for (const item of imported) {
    if (!item.visible) continue;
    const { podiumZ, polygons } = massingPodiumRoofFootprints(item, origin, zone);
  const { polygons: fallbackPolys, polygonTops } =
      polygons.length > 0 ? { polygons, polygonTops: polygons.map(() => podiumZ) } : massingFootprint(item, origin, zone);
    for (const [index, polygon] of fallbackPolys.entries()) {
      const topZ = polygonTops[index]!;
      const [outer, ...holes] = polygon;
      if (!outer || outer.length < 4) continue;
      out.push({
        id: nextFill--,
        ring: closeRing(outer as Pt[]),
        holes: holes.map((hole) => closeRing(hole as Pt[])),
        height: Math.max(1, topZ - footprintGround(outer as Pt[], item.placement.base, groundAt)),
        use: "unclassified",
        source: "none",
        importedMassing: true,
        importedMassingSkipShadow: true,
        importedTopZ: topZ,
        ...(item.colour ? { importedColour: item.colour } : {}),
        overtureName: item.name,
      });
    }
    out.push(
      ...massingShadowCasters(item, origin, zone, groundAt, () => nextShadow--),
    );
  }
  return out;
}
