import * as THREE from "three";
import type { CityModel, Pt } from "../types";
import { pointInPolygon } from "./useCascade";
import { SURFACE } from "./surfaceLayers";
import { waterAreasForCutFromModel } from "./waterMesh3d";
import { sampleTerrain } from "./terrain";
import { clipDifference, clipUnionEach, preparePolygonForClip, type MultiPolygon } from "./safePolygonClip";
import type { Tri } from "./terrainDrape";

export type WaterArea2D = { ring: Pt[]; holes: Pt[][] };

export type WaterCutContext = {
  areas: WaterArea2D[];
  heightAt: (east: number, north: number) => number;
};

export function waterAreasFromModel(model: CityModel): WaterArea2D[] {
  return waterAreasForCutFromModel(model);
}

export function waterCutContextFromModel(model: CityModel): WaterCutContext | null {
  const areas = waterAreasFromModel(model);
  if (areas.length === 0) return null;
  const field = model.terrain;
  const heightAt = field
    ? (east: number, north: number) => sampleTerrain(field, east, north, model.sideM)
    : () => 0;
  return { areas, heightAt };
}

export function pointInWaterAreas(east: number, north: number, areas: WaterArea2D[]): boolean {
  for (const area of areas) {
    if (pointInPolygon([east, north], area.ring, area.holes)) return true;
  }
  return false;
}

export function waterMultiPolygon(areas: WaterArea2D[]): MultiPolygon {
  const multi: MultiPolygon = [];
  for (const area of areas) {
    const poly = preparePolygonForClip([area.ring, ...area.holes]);
    if (poly) multi.push(poly);
  }
  return multi;
}

export function subtractWaterFromGroundRemaining(remaining: MultiPolygon, areas: WaterArea2D[]): MultiPolygon {
  if (areas.length === 0 || remaining.length === 0) return remaining;
  const water = waterMultiPolygon(areas);
  if (water.length === 0) return remaining;
  const union = clipUnionEach(water, { layer: "Water", operation: "union", featureId: "harbour" });
  if (union.length === 0) return remaining;
  return clipDifference(remaining, union, {
    layer: "Ground::Remaining",
    operation: "difference",
    featureId: "water-cut",
  });
}

export function filterTrisOutsideWater(tris: Tri[], areas: WaterArea2D[]): Tri[] {
  if (areas.length === 0) return tris;
  return tris.filter((tri) => {
    const east = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
    const north = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    return !pointInWaterAreas(east, north, areas);
  });
}

function triangleNormalY(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  let nx = aby * acz - abz * acy;
  let ny = abz * acx - abx * acz;
  let nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-8)) return 0;
  return ny / len;
}

export function cutWaterFromBufferGeometry(
  geometry: THREE.BufferGeometry,
  areas: WaterArea2D[],
  options: { horizontalMinY?: number } = {},
): THREE.BufferGeometry | null {
  if (areas.length === 0) return geometry;
  const horizontalMinY = options.horizontalMinY ?? 0.5;
  const position = geometry.getAttribute("position");
  if (!position) return geometry;
  const color = geometry.getAttribute("color");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  const keepVerts: number[] = [];
  const keepColors: number[] = [];
  const keepNormals: number[] = [];
  const keepIdx: number[] = [];
  const pushVertex = (vi: number) => {
    let neu = keepVerts.length / 3;
    const existing = viMap.get(vi);
    if (existing !== undefined) return existing;
    viMap.set(vi, neu);
    keepVerts.push(position.getX(vi), position.getY(vi), position.getZ(vi));
    if (color) keepColors.push(color.getX(vi), color.getY(vi), color.getZ(vi));
    if (normal) keepNormals.push(normal.getX(vi), normal.getY(vi), normal.getZ(vi));
    return neu;
  };
  const viMap = new Map<number, number>();
  const triCount = index ? index.count / 3 : position.count / 3;
  for (let t = 0; t < triCount; t++) {
    const ia = index ? index.getX(t * 3)! : t * 3;
    const ib = index ? index.getX(t * 3 + 1)! : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2)! : t * 3 + 2;
    const ax = position.getX(ia)!;
    const ay = position.getY(ia)!;
    const az = position.getZ(ia)!;
    const bx = position.getX(ib)!;
    const by = position.getY(ib)!;
    const bz = position.getZ(ib)!;
    const cx = position.getX(ic)!;
    const cy = position.getY(ic)!;
    const cz = position.getZ(ic)!;
    const east = (ax + bx + cx) / 3;
    const north = (-(az + bz + cz)) / 3;
    const inWater = pointInWaterAreas(east, north, areas);
    if (!inWater) {
      keepIdx.push(pushVertex(ia), pushVertex(ib), pushVertex(ic));
      continue;
    }
    const ny = triangleNormalY(ax, ay, az, bx, by, bz, cx, cy, cz);
    if (Math.abs(ny) < horizontalMinY) {
      keepIdx.push(pushVertex(ia), pushVertex(ib), pushVertex(ic));
    }
  }
  if (keepIdx.length < 3) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(keepVerts, 3));
  if (keepColors.length > 0) out.setAttribute("color", new THREE.Float32BufferAttribute(keepColors, 3));
  if (keepNormals.length > 0) out.setAttribute("normal", new THREE.Float32BufferAttribute(keepNormals, 3));
  out.setIndex(keepIdx);
  out.computeVertexNormals();
  return out;
}

export const WATER_RIM_EPSILON_M = 0.028;

export function waterAreaLiftM(index: number): number {
  return SURFACE.water.lift + (Math.abs(index) % 4) * 0.008 - WATER_RIM_EPSILON_M;
}