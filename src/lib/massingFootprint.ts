import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { placedLocal, type ImportedMassing } from "./massingImport";
import type { BuildingFeat, LonLat, Pt } from "../types";

type UnionFn = (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;

/** Same CJS/ESM interop guard as siteFrame.ts: Vite's dev build exposes the API on `default`. */
function unionFn(): UnionFn {
  const loaded = polygonClipping as unknown as { union?: UnionFn; default?: { union?: UnionFn } };
  if (typeof loaded.union === "function") return loaded.union;
  if (typeof loaded.default?.union === "function") return loaded.default.union;
  throw new Error("polygon-clipping did not load.");
}

/** Ids for drawing-only footprints, well clear of OSM/Overture building ids. */
const IMPORTED_ID_BASE = -1_000_000;

/** Triangles thinner than this in plan (m²) are walls seen edge-on and add nothing to the footprint. */
const MIN_PLAN_AREA_M2 = 1e-4;
const UNION_BATCH = 2000;

function closeRing(ring: Pt[]): Pt[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/**
 * Plan footprint of one placed massing model, in the CityModel's local metres: the union of every
 * triangle projected to plan, using the same MGA → local transform as the 3D view.
 */
export function massingFootprint(
  massing: Pick<ImportedMassing, "positions" | "indices" | "placement">,
  origin: LonLat,
  zone: number,
): { polygons: MultiPolygon; topZ: number } {
  const local = placedLocal(massing, massing.placement, origin, zone);
  const tris: Polygon[] = [];
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
    tris.push(area > 0 ? [[[ax, ay], [bx, by], [cx, cy], [ax, ay]]] : [[[ax, ay], [cx, cy], [bx, by], [ax, ay]]]);
  }
  if (tris.length === 0) return { polygons: [], topZ };
  const union = unionFn();
  let merged: MultiPolygon = [];
  for (let i = 0; i < tris.length; i += UNION_BATCH) {
    const batch = tris.slice(i, i + UNION_BATCH);
    merged = union(merged, ...batch);
  }
  return { polygons: merged, topZ };
}

/**
 * Ground (AHD m) under a footprint: mean terrain at its vertices. Drawings extrude from the ground, so
 * height must be the top above *terrain*, not above the model's lowest vertex: a model whose base Z
 * sits below or above the terrain (or carries geometry sunk into it) otherwise casts plan shadows
 * from the wrong height. Without terrain, falls back to the placement base.
 */
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

/**
 * Drawing-only buildings for the visible imported models: one per footprint polygon, flagged
 * `importedMassing` so the site plan fills it yellow. Figure-ground and exploded axo count them as figure.
 */
export function massingDrawingBuildings(
  imported: ImportedMassing[],
  origin: LonLat,
  zone: number,
  /** Terrain (AHD m) at a local point; the same field the 3D view and click placement use. */
  groundAt?: (east: number, north: number) => number,
): BuildingFeat[] {
  const out: BuildingFeat[] = [];
  let next = IMPORTED_ID_BASE;
  for (const item of imported) {
    if (!item.visible) continue;
    const { polygons, topZ } = massingFootprint(item, origin, zone);
    for (const polygon of polygons) {
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
        overtureName: item.name,
      });
    }
  }
  return out;
}
