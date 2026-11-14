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