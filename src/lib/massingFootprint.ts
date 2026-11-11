import type { MultiPolygon, Polygon } from "./safePolygonClip";
import { clipUnion as unionFnLoaded } from "./safePolygonClip";
import { placedLocal, type ImportedMassing } from "./massingImport";
import type { BuildingFeat, LonLat, Pt } from "../types";

const unionFn = unionFnLoaded;

const IMPORTED_ID_BASE = -1_000_000;

const MIN_PLAN_AREA_M2 = 1e-4;
const UNION_BATCH = 2000;
const UP_FACE_MIN_NZ = 0.92;
const ROOF_Z_BUCKET_M = 0.03;
const ROOF_MIN_ABOVE_M = 0.05;

function closeRing(ring: Pt[]): Pt[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
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

function upwardRoofBuckets(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement">,
  origin: LonLat,
  zone: number,
): Map<number, Polygon[]> {
  const local = placedLocal(massing, massing.placement, origin, zone);
  const buckets = new Map<number, Polygon[]>();
  for (let t = 0; t + 2 < massing.indices.length; t += 3) {
    const ia = massing.indices[t]! * 3;
    const ib = massing.indices[t + 1]! * 3;
    const ic = massing.indices[t + 2]! * 3;
    const ax = local[ia]!, ay = local[ia + 1]!, az = local[ia + 2]!;
    const bx = local[ib]!, by = local[ib + 1]!, bz = local[ib + 2]!;
    const cx = local[ic]!, cy = local[ic + 1]!, cz = local[ic + 2]!;
    const flatZ = Math.abs(az - bz) < 1e-6 && Math.abs(bz - cz) < 1e-6;
    const planArea = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    if (flatZ) {
      if (!(planArea > MIN_PLAN_AREA_M2)) continue;
    } else {
      const ux = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      const uy = (bz - az) * (cy - ay) - (cz - az) * (by - ay);
      const uz = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      const length = Math.hypot(ux, uy, uz);
      if (!(length > 1e-9)) continue;
      const nz = Math.abs(uz) / length;
      if (nz < UP_FACE_MIN_NZ || uz <= 0) continue;
    }
    const topZ = Math.max(az, bz, cz);
    const bucket = Math.round(topZ / ROOF_Z_BUCKET_M) * ROOF_Z_BUCKET_M;
    if (!flatZ && Math.abs(planArea) < MIN_PLAN_AREA_M2) continue;
    const poly: Polygon =
      planArea > 0
        ? [[[ax, ay], [bx, by], [cx, cy], [ax, ay]]]
        : [[[ax, ay], [cx, cy], [bx, by], [ax, ay]]];
    const list = buckets.get(bucket) ?? [];
    list.push(poly);
    buckets.set(bucket, list);
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

export function massingUpperLevelOutlines(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement">,
  origin: LonLat,
  zone: number,
): ImportedMassingUpperLevel[] {
  const buckets = upwardRoofBuckets(massing, origin, zone);
  if (buckets.size <= 1) return [];
  const levels = [...buckets.keys()].sort((a, b) => a - b);
  const minZ = levels[0]!;
  const out: ImportedMassingUpperLevel[] = [];
  for (const z of levels) {
    if (z <= minZ + ROOF_MIN_ABOVE_M) continue;
    const merged = unionBucket(buckets.get(z) ?? []);
    const lines = ringsFromMerged(merged);
    if (lines.length === 0) continue;
    out.push({ z, lines });
  }
  return out;
}

export function massingUpperLevelPlanLines(
  imported: ImportedMassing[],
  origin: LonLat,
  zone: number,
): ImportedMassingUpperLevel[] {
  const out: ImportedMassingUpperLevel[] = [];
  for (const item of imported) {
    if (!item.visible) continue;
    out.push(...massingUpperLevelOutlines(item, origin, zone));
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
  let next = IMPORTED_ID_BASE;
  for (const item of imported) {
    if (!item.visible) continue;
    const { polygons, polygonTops } = massingFootprint(item, origin, zone);
    for (const [index, polygon] of polygons.entries()) {
      const topZ = polygonTops[index]!;
      const [outer, ...holes] = polygon;
      if (!outer || outer.length < 4) continue;
      out.push({
        id: next--,
        ring: closeRing(outer as Pt[]),
        holes: holes.map((hole) => closeRing(hole as Pt[])),
        height: Math.max(1, topZ - footprintGround(outer as Pt[], item.placement.base, groundAt)),
        use: "unclassified",
        source: "none",
        importedMassing: true,
        importedTopZ: topZ,
        ...(item.colour ? { importedColour: item.colour } : {}),
        overtureName: item.name,
      });
    }
  }
  return out;
}
