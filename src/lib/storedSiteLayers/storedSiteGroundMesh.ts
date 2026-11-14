import { SURFACE } from "../surfaceLayers";
import type { WaterCutContext } from "../waterSurfaceCut";
import { pointInWaterAreas } from "../waterSurfaceCut";
import type { StoredSiteMeshPart } from "./types";

const GROUND_NORMAL_MIN_Y = Math.cos((90 - 10) * (Math.PI / 180));
const GROUND_MAX_RELIEF_M = 2.8;
const GROUND_MIN_SPAN_M = 28;

export function storedSitePartStats(part: StoredSiteMeshPart): {
  reliefM: number;
  spanM: number;
  groundLikeVertexFrac: number;
} {
  const positions = part.positions;
  const vertexCount = positions.length / 3;
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const triCount = part.indices.length / 3;
  let groundLike = 0;
  let sampled = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = part.indices[t * 3]!;
    const ib = part.indices[t * 3 + 1]!;
    const ic = part.indices[t * 3 + 2]!;
    const ax = positions[ia * 3]!;
    const ay = positions[ia * 3 + 1]!;
    const az = positions[ia * 3 + 2]!;
    const bx = positions[ib * 3]!;
    const by = positions[ib * 3 + 1]!;
    const bz = positions[ib * 3 + 2]!;
    const cx = positions[ic * 3]!;
    const cy = positions[ic * 3 + 1]!;
    const cz = positions[ic * 3 + 2]!;
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
    if (!(len > 1e-8)) continue;
    sampled++;
    nx /= len;
    ny /= len;
    nz /= len;
    if (Math.abs(ny) >= GROUND_NORMAL_MIN_Y) groundLike++;
  }
  const reliefM = maxY - minY;
  const spanM = Math.max(maxX - minX, maxZ - minZ);
  const groundLikeVertexFrac = sampled > 0 ? groundLike / sampled : 0;
  return { reliefM, spanM, groundLikeVertexFrac };
}

export function storedSitePartIsTerrainDrapeSurface(part: StoredSiteMeshPart): boolean {
  const { reliefM, spanM, groundLikeVertexFrac } = storedSitePartStats(part);
  if (part.partId) return false;
  if (spanM > 750 && reliefM < 140 && groundLikeVertexFrac > 0.42) return true;
  if (reliefM > GROUND_MAX_RELIEF_M) return false;
  if (spanM < GROUND_MIN_SPAN_M) return false;
  if (groundLikeVertexFrac < 0.72) return false;
  return true;
}

function triangleNormalY(positions: Float32Array, ia: number, ib: number, ic: number): number {
  const ax = positions[ia * 3]!;
  const ay = positions[ia * 3 + 1]!;
  const az = positions[ia * 3 + 2]!;
  const bx = positions[ib * 3]!;
  const by = positions[ib * 3 + 1]!;
  const bz = positions[ib * 3 + 2]!;
  const cx = positions[ic * 3]!;
  const cy = positions[ic * 3 + 1]!;
  const cz = positions[ic * 3 + 2]!;
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

const WATER_COVER_MAX_Y_M = 6.5;

export function stripStoredSiteWaterCoverTriangles(part: StoredSiteMeshPart): StoredSiteMeshPart | null {
  const positions = part.positions;
  const triCount = part.indices.length / 3;
  const remap = new Map<number, number>();
  const outPos: number[] = [];
  const outIdx: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const ia = part.indices[t * 3]!;
    const ib = part.indices[t * 3 + 1]!;
    const ic = part.indices[t * 3 + 2]!;
    const ay = positions[ia * 3 + 1]!;
    const by = positions[ib * 3 + 1]!;
    const cy = positions[ic * 3 + 1]!;
    const ny = triangleNormalY(positions, ia, ib, ic);
    const groundLike = Math.abs(ny) >= GROUND_NORMAL_MIN_Y;
    const low = Math.max(ay, by, cy) <= WATER_COVER_MAX_Y_M;
    if (groundLike && low) continue;
    for (const old of [ia, ib, ic]) {
      let neu = remap.get(old);
      if (neu === undefined) {
        neu = outPos.length / 3;
        remap.set(old, neu);
        outPos.push(positions[old * 3]!, positions[old * 3 + 1]!, positions[old * 3 + 2]!);
      }
      outIdx.push(neu);
    }
  }
  if (outIdx.length < 3) return null;
  return {
    buildingId: part.buildingId,
    structure: part.structure,
    partId: part.partId,
    positions: new Float32Array(outPos),
    indices: new Uint32Array(outIdx),
  };
}

export function refineStoredSiteMeshPart(part: StoredSiteMeshPart): StoredSiteMeshPart | null {
  if (storedSitePartIsTerrainDrapeSurface(part)) return null;
  return stripStoredSiteWaterCoverTriangles(part);
}

const CONTEXT_WATER_NORMAL_MIN_Y = 0.9;
const CONTEXT_WATER_LIP_M = 2;

export function stripStoredSiteContextWaterTriangles(
  part: StoredSiteMeshPart,
  waterCut: WaterCutContext,
): { part: StoredSiteMeshPart | null; dropped: number; kept: number } {
  const positions = part.positions;
  const triCount = part.indices.length / 3;
  let dropped = 0;
  let kept = 0;
  const remap = new Map<number, number>();
  const outPos: number[] = [];
  const outIdx: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const ia = part.indices[t * 3]!;
    const ib = part.indices[t * 3 + 1]!;
    const ic = part.indices[t * 3 + 2]!;
    const ax = positions[ia * 3]!;
    const ay = positions[ia * 3 + 1]!;
    const az = positions[ia * 3 + 2]!;
    const bx = positions[ib * 3]!;
    const by = positions[ib * 3 + 1]!;
    const bz = positions[ib * 3 + 2]!;
    const cx = positions[ic * 3]!;
    const cy = positions[ic * 3 + 1]!;
    const cz = positions[ic * 3 + 2]!;
    const east = (ax + bx + cx) / 3;
    const north = -(az + bz + cz) / 3;
    const ny = triangleNormalY(positions, ia, ib, ic);
    const maxY = Math.max(ay, by, cy);
    const lip = waterCut.heightAt(east, north) + SURFACE.water.lift + CONTEXT_WATER_LIP_M;
    const horizontal = ny > CONTEXT_WATER_NORMAL_MIN_Y || ny < -CONTEXT_WATER_NORMAL_MIN_Y;
    const drop = pointInWaterAreas(east, north, waterCut.areas) && horizontal && maxY <= lip;
    if (drop) {
      dropped++;
      continue;
    }
    kept++;
    for (const old of [ia, ib, ic]) {
      let neu = remap.get(old);
      if (neu === undefined) {
        neu = outPos.length / 3;
        remap.set(old, neu);
        outPos.push(positions[old * 3]!, positions[old * 3 + 1]!, positions[old * 3 + 2]!);
      }
      outIdx.push(neu);
    }
  }
  if (outIdx.length < 3) return { part: null, dropped, kept: 0 };
  return {
    part: {
      buildingId: part.buildingId,
      structure: part.structure,
      partId: part.partId,
      positions: new Float32Array(outPos),
      indices: new Uint32Array(outIdx),
    },
    dropped,
    kept,
  };
}

export function refineStoredSiteContextPart(
  part: StoredSiteMeshPart,
  waterCut: WaterCutContext | null,
): StoredSiteMeshPart | null {
  if (storedSitePartIsTerrainDrapeSurface(part)) return null;
  if (!waterCut) return stripStoredSiteWaterCoverTriangles(part);
  const { part: stripped, dropped, kept } = stripStoredSiteContextWaterTriangles(part, waterCut);
  if (typeof console !== "undefined" && console.info) {
    console.info("[rozelle-context-water]", { dropped, kept });
  }
  return stripped;
}