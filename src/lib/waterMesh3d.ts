import earcut from "earcut";
import * as THREE from "three";
import { openRing, signedArea } from "./geo";
import {
  cleanOpenRing,
  clipDifference,
  clipUnionEach,
  prepareMultiPolygonForClip,
  preparePolygonForClip,
  type MultiPolygon,
} from "./safePolygonClip";
import {
  clipAreaToSiteFrame,
  DEFAULT_SITE_FRAME_SHAPE,
  frameGroundSize,
  siteFramePolygon,
  type FrameGroundSize,
  type SiteFrameShape,
} from "./siteFrame";
import { terrainMeshHeight, type Tri } from "./terrainDrape";
import type { CityModel, Pt, Ring, TerrainField } from "../types";

export type ClippedWaterRings = Pt[][];

export type WaterTerrainGrid = {
  field: TerrainField;
  sideM: number;
  frameSize?: FrameGroundSize;
  frameShape?: SiteFrameShape;
};

export function clippedWaterRingsFromModel(model: CityModel): ClippedWaterRings[] {
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const frameSize = frameGroundSize(model.sideM);
  const out: ClippedWaterRings[] = [];
  for (const area of model.areas) {
    if (area.kind !== "water") continue;
    const rings = clipAreaToSiteFrame(area.ring, area.holes, model.sideM, frameShape, frameSize);
    if (rings?.[0] && rings[0].length >= 3) out.push(rings);
  }
  return out;
}

function orientOpenRing(open: Pt[], ccw: boolean): Pt[] {
  const positive = signedArea(open) > 0;
  return positive === ccw ? open : open.slice().reverse();
}

function ringsToFillMultiPolygon(
  rings: ClippedWaterRings,
  sideM: number,
  frameShape: SiteFrameShape,
  frameSize: FrameGroundSize,
): MultiPolygon {
  const prepared = preparePolygonForClip([rings[0] as Ring, ...(rings.slice(1) as Ring[])]);
  if (!prepared) return [];
  if (prepared.length > 1) {
    const halfW = frameSize.widthM / 2;
    const halfH = frameSize.heightM / 2;
    const outerOpen = cleanOpenRing(openRing(prepared[0]!));
    const frameLike =
      outerOpen != null &&
      outerOpen.length >= 3 &&
      outerOpen.every((p) => Math.abs(p[0]) <= halfW + 2 && Math.abs(p[1]) <= halfH + 2);
    if (frameLike) {
      const frame = siteFramePolygon(sideM, frameShape, frameSize);
      const landPolys = prepared.slice(1).map((hole) => [hole] as import("./safePolygonClip").Polygon);
      const land = clipUnionEach(landPolys, { layer: "Water", operation: "union", featureId: "land-holes" });
      if (land.length > 0) {
        const water = clipDifference(frame, land, {
          layer: "Water",
          operation: "difference",
          featureId: "frame-minus-land",
        });
        if (water.length > 0) return prepareMultiPolygonForClip(water);
      }
    }
  }
  return [prepared];
}

export function waterFillMultiPolygonFromModel(model: CityModel): MultiPolygon {
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const frameSize = frameGroundSize(model.sideM);
  const multi: MultiPolygon = [];
  for (const rings of clippedWaterRingsFromModel(model)) {
    multi.push(...ringsToFillMultiPolygon(rings, model.sideM, frameShape, frameSize));
  }
  return multi;
}

export function polygonWithHolesAreaM2(rings: ClippedWaterRings): number {
  const outer = rings[0];
  if (!outer || outer.length < 3) return 0;
  let area = Math.abs(signedArea(openRing(outer)));
  for (const hole of rings.slice(1)) {
    if (hole.length < 3) continue;
    area -= Math.abs(signedArea(openRing(hole)));
  }
  return Math.max(0, area);
}

export function multiPolygonAreaM2(multi: MultiPolygon): number {
  let total = 0;
  for (const polygon of multi) {
    if (!polygon[0]) continue;
    const rings = polygon.map((ring) => ring.map(([x, y]) => [x, y] as Pt));
    total += polygonWithHolesAreaM2(rings);
  }
  return total;
}

export function planWaterAreaM2(model: CityModel): number {
  let total = 0;
  for (const rings of clippedWaterRingsFromModel(model)) {
    total += polygonWithHolesAreaM2(rings);
  }
  return total;
}

function flattenForEarcut(polygon: MultiPolygon[number]): { flat: number[]; holeIndices: number[] } | null {
  if (!polygon[0]) return null;
  const outer = cleanOpenRing(openRing(polygon[0]!));
  if (!outer) return null;
  const contour = orientOpenRing(outer, true);
  const flat: number[] = [];
  const holeIndices: number[] = [];
  for (const p of contour) flat.push(p[0], p[1]);
  for (const holeRing of polygon.slice(1)) {
    const hole = cleanOpenRing(openRing(holeRing));
    if (!hole) continue;
    const path = orientOpenRing(hole, false);
    holeIndices.push(flat.length / 2);
    for (const p of path) flat.push(p[0], p[1]);
  }
  if (flat.length < 6) return null;
  return { flat, holeIndices };
}

export function triangulateWaterPolygon(polygon: MultiPolygon[number]): Tri[] {
  const data = flattenForEarcut(polygon);
  if (!data) return [];
  const indices = earcut(data.flat, data.holeIndices, 2);
  const tris: Tri[] = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ia = indices[i]!;
    const ib = indices[i + 1]!;
    const ic = indices[i + 2]!;
    tris.push([
      [data.flat[ia * 2]!, data.flat[ia * 2 + 1]!],
      [data.flat[ib * 2]!, data.flat[ib * 2 + 1]!],
      [data.flat[ic * 2]!, data.flat[ic * 2 + 1]!],
    ]);
  }
  return tris;
}

export function triangulateWaterMultiPolygon(multi: MultiPolygon): Tri[] {
  const tris: Tri[] = [];
  for (const polygon of multi) tris.push(...triangulateWaterPolygon(polygon));
  return tris;
}

function triangleAspectRatio2d(tri: Tri): number {
  const [a, b, c] = tri;
  const ab = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const bc = Math.hypot(b[0] - c[0], b[1] - c[1]);
  const ca = Math.hypot(c[0] - a[0], c[1] - a[0]);
  const min = Math.min(ab, bc, ca);
  const max = Math.max(ab, bc, ca);
  if (!(min > 1e-9)) return Infinity;
  return max / min;
}

export function planTrisAreaM2(tris: Tri[]): number {
  let area = 0;
  for (const [a, b, c] of tris) {
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    area += Math.abs(cross) * 0.5;
  }
  return area;
}

export function maxWaterTriangleAspectRatio(tris: Tri[]): number {
  let max = 0;
  for (const tri of tris) max = Math.max(max, triangleAspectRatio2d(tri));
  return max;
}

export function meshPlanProjectedAreaM2(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  const index = geometry.getIndex();
  let area = 0;
  const triCount = index ? index.count / 3 : position.count / 3;
  for (let t = 0; t < triCount; t++) {
    const ia = index ? index.getX(t * 3)! : t * 3;
    const ib = index ? index.getX(t * 3 + 1)! : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2)! : t * 3 + 2;
    const ax = position.getX(ia)!;
    const az = position.getZ(ia)!;
    const bx = position.getX(ib)!;
    const bz = position.getZ(ib)!;
    const cx = position.getX(ic)!;
    const cz = position.getZ(ic)!;
    const a: Pt = [ax, -az];
    const b: Pt = [bx, -bz];
    const c: Pt = [cx, -cz];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    area += Math.abs(cross) * 0.5;
  }
  return area;
}

function maxEdgeM(tri: Tri): number {
  const [a, b, c] = tri;
  return Math.max(
    Math.hypot(a[0] - b[0], a[1] - b[1]),
    Math.hypot(b[0] - c[0], b[1] - c[1]),
    Math.hypot(c[0] - a[0], c[1] - a[0]),
  );
}

function subdividePlanTris(tris: Tri[], maxEdge: number): Tri[] {
  const out: Tri[] = [];
  for (const tri of tris) {
    if (maxEdgeM(tri) <= maxEdge || maxWaterTriangleAspectRatio([tri]) > 80) {
      out.push(tri);
      continue;
    }
    const [a, b, c] = tri;
    const mab: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const mbc: Pt = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    const mca: Pt = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
    out.push([a, mab, mca], [mab, b, mbc], [mca, mbc, c], [mab, mbc, mca]);
  }
  return out;
}

function trisToBufferGeometry(
  tris: Tri[],
  heightAt: (east: number, north: number) => number,
  lift: number,
): THREE.BufferGeometry | null {
  if (tris.length === 0) return null;
  const positions: number[] = [];
  for (const [a, b, c] of tris) {
    for (const [east, north] of [a, b, c]) {
      positions.push(east, heightAt(east, north) + lift, -north);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function planTrisForWaterMesh(model: CityModel): Tri[] {
  const multi = waterFillMultiPolygonFromModel(model);
  if (multi.length === 0) return [];
  let tris = triangulateWaterMultiPolygon(multi);
  if (tris.length === 0) return [];
  tris = tris.filter((tri) => triangleAspectRatio2d(tri) <= 1000);
  const field = model.terrain;
  const relief = field ? field.max - field.min : 0;
  let maxEdge = 0;
  if (model.storedSiteLayer) maxEdge = 10;
  else if (relief > 0.5 && field) maxEdge = Math.max(Math.min(field.spacingM, 3), 4);
  if (maxEdge > 0) tris = subdividePlanTris(tris, maxEdge);
  return tris;
}

export function buildWaterMeshGeometry(
  model: CityModel,
  heightAt: (east: number, north: number) => number,
  lift: number,
  _terrainGrid?: WaterTerrainGrid | null,
): THREE.BufferGeometry | null {
  const tris = planTrisForWaterMesh(model);
  if (tris.length === 0) return null;
  const field = model.terrain;
  const zAt = field
    ? (east: number, north: number) => terrainMeshHeight(field, model.sideM, east, north)
    : heightAt;
  return trisToBufferGeometry(tris, zAt, lift);
}

export function legacyFrameRingEarcutTrisFromModel(model: CityModel): Tri[] {
  const tris: Tri[] = [];
  for (const rings of clippedWaterRingsFromModel(model)) {
    const prepared = preparePolygonForClip([rings[0] as Ring, ...(rings.slice(1) as Ring[])]);
    if (!prepared) continue;
    tris.push(...triangulateWaterPolygon(prepared));
  }
  return tris;
}

export function waterAreasForCutFromModel(model: CityModel): { ring: Pt[]; holes: Pt[][] }[] {
  const multi = waterFillMultiPolygonFromModel(model);
  return multi
    .filter((poly) => poly[0] && poly[0].length >= 3)
    .map((poly) => ({
      ring: poly[0]!.map(([x, y]) => [x, y] as Pt),
      holes: poly.slice(1).map((ring) => ring.map(([x, y]) => [x, y] as Pt)),
    }));
}