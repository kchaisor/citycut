import type { WalkNetwork } from "./walkRippleNetwork";

export const WALK_RIPPLE_RIBBON_HALF_MIN_M = 4;
export const WALK_RIPPLE_RIBBON_HALF_MAX_M = 6;
export const WALK_RIPPLE_RIBBON_HALF_DEFAULT_M = 5;

export type RibbonHeightSample = (east: number, north: number) => number;

export type WalkRippleRibbonBuffers = {
  positions: Float32Array;
  centers: Float32Array;
  offsets: Float32Array;
  arrivals: Float32Array;
  edgeLengthsM: number[];
  halfWidthM: number;
};

export function clampRibbonHalfWidthM(halfWidthM: number): number {
  return Math.max(WALK_RIPPLE_RIBBON_HALF_MIN_M, Math.min(WALK_RIPPLE_RIBBON_HALF_MAX_M, halfWidthM));
}

export function buildNetworkRibbonBuffers(
  network: WalkNetwork,
  edgeVertexTimes: Float32Array,
  halfWidthM: number,
  heightAt: RibbonHeightSample,
  lineLiftM: number,
): WalkRippleRibbonBuffers {
  const hw = clampRibbonHalfWidthM(halfWidthM);
  const positions: number[] = [];
  const centers: number[] = [];
  const offsets: number[] = [];
  const arrivals: number[] = [];
  const edgeLengthsM: number[] = [];

  network.edges.forEach((edge, edgeIndex) => {
    const base = edgeIndex * 4;
    const ta = edgeVertexTimes[base]!;
    const tb = edgeVertexTimes[base + 2]!;
    const dx = edge.bx - edge.ax;
    const dy = edge.by - edge.ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.05) return;
    edgeLengthsM.push(len);
    const ox = (-dy / len) * hw;
    const oy = (dx / len) * hw;

    const zA = heightAt(edge.ax, edge.ay) + lineLiftM;
    const zB = heightAt(edge.bx, edge.by) + lineLiftM;

    const pushCorner = (ex: number, en: number, z: number, tMin: number, offx: number, offy: number) => {
      const cx = ex;
      const cy = z;
      const cz = -en;
      const ox3 = offx;
      const oy3 = -offy;
      const oz3 = 0;
      centers.push(cx, cy, cz);
      offsets.push(ox3, oy3, oz3);
      positions.push(cx + ox3, cy + oy3, cz + oz3);
      arrivals.push(tMin);
    };

    pushCorner(edge.ax, edge.ay, zA, ta, ox, oy);
    pushCorner(edge.ax, edge.ay, zA, ta, -ox, -oy);
    pushCorner(edge.bx, edge.by, zB, tb, ox, oy);
    pushCorner(edge.bx, edge.by, zB, tb, -ox, -oy);
  });

  const cornerCount = positions.length / 3;
  const tris: number[] = [];
  for (let e = 0; e < cornerCount / 4; e++) {
    const i = e * 4;
    tris.push(i, i + 2, i + 3, i, i + 3, i + 1);
  }
  const expandedPositions: number[] = [];
  const expandedCenters: number[] = [];
  const expandedOffsets: number[] = [];
  const expandedArrivals: number[] = [];
  for (const idx of tris) {
    expandedCenters.push(centers[idx * 3]!, centers[idx * 3 + 1]!, centers[idx * 3 + 2]!);
    expandedOffsets.push(offsets[idx * 3]!, offsets[idx * 3 + 1]!, offsets[idx * 3 + 2]!);
    expandedPositions.push(positions[idx * 3]!, positions[idx * 3 + 1]!, positions[idx * 3 + 2]!);
    expandedArrivals.push(arrivals[idx]!);
  }

  return {
    positions: new Float32Array(expandedPositions),
    centers: new Float32Array(expandedCenters),
    offsets: new Float32Array(expandedOffsets),
    arrivals: new Float32Array(expandedArrivals),
    edgeLengthsM,
    halfWidthM: hw,
  };
}

function segmentLength3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  return Math.hypot(bx - ax, by - ay, bz - az);
}

export function maxRibbonTriangleEdgeM(positions: Float32Array): number {
  let max = 0;
  const triCount = positions.length / 9;
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 9;
    const edges = [
      segmentLength3(positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!, positions[i0 + 3]!, positions[i0 + 4]!, positions[i0 + 5]!),
      segmentLength3(positions[i0 + 3]!, positions[i0 + 4]!, positions[i0 + 5]!, positions[i0 + 6]!, positions[i0 + 7]!, positions[i0 + 8]!),
      segmentLength3(positions[i0 + 6]!, positions[i0 + 7]!, positions[i0 + 8]!, positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!),
    ];
    for (const len of edges) {
      if (len > max) max = len;
    }
  }
  return max;
}

export function assertRibbonTriangleEdges(
  positions: Float32Array,
  edgeLengthsM: number[],
  halfWidthM: number,
): void {
  const vertCount = positions.length / 3;
  const triCount = vertCount / 3;
  const longestEdge = edgeLengthsM.reduce((a, b) => Math.max(a, b), 0);
  const maxAllowed = longestEdge + 2 * halfWidthM + 0.5;
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 9;
    const edges = [
      segmentLength3(positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!, positions[i0 + 3]!, positions[i0 + 4]!, positions[i0 + 5]!),
      segmentLength3(positions[i0 + 3]!, positions[i0 + 4]!, positions[i0 + 5]!, positions[i0 + 6]!, positions[i0 + 7]!, positions[i0 + 8]!),
      segmentLength3(positions[i0 + 6]!, positions[i0 + 7]!, positions[i0 + 8]!, positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!),
    ];
    for (const len of edges) {
      if (len > maxAllowed + 1e-3) {
        throw new Error(`Ribbon triangle edge ${len.toFixed(2)}m exceeds ${maxAllowed.toFixed(2)}m`);
      }
    }
  }
}
