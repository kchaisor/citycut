import type { WalkNetwork } from "./walkRippleNetwork";

export const WALK_RIPPLE_RIBBON_HALF_MIN_M = 4;
export const WALK_RIPPLE_RIBBON_HALF_MAX_M = 6;
export const WALK_RIPPLE_RIBBON_HALF_DEFAULT_M = 5;

export type RibbonHeightSample = (east: number, north: number) => number;

export type WalkRippleRibbonBuffers = {
  positions: Float32Array;
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
    const aLeft = [edge.ax + ox, zA, -(edge.ay + oy), ta] as const;
    const aRight = [edge.ax - ox, zA, -(edge.ay - oy), ta] as const;
    const bLeft = [edge.bx + ox, zB, -(edge.by + oy), tb] as const;
    const bRight = [edge.bx - ox, zB, -(edge.by - oy), tb] as const;

    for (const c of [aLeft, bLeft, bRight, aLeft, bRight, aRight]) {
      positions.push(c[0], c[1], c[2]);
      arrivals.push(c[3]);
    }
  });

  return {
    positions: new Float32Array(positions),
    arrivals: new Float32Array(arrivals),
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
  let maxEdge = 0;
  const triCount = positions.length / 9;
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 9;
    const edges = [
      segmentLength3(positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!, positions[i0 + 3]!, positions[i0 + 4]!, positions[i0 + 5]!),
      segmentLength3(positions[i0 + 3]!, positions[i0 + 4]!, positions[i0 + 5]!, positions[i0 + 6]!, positions[i0 + 7]!, positions[i0 + 8]!),
      segmentLength3(positions[i0 + 6]!, positions[i0 + 7]!, positions[i0 + 8]!, positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!),
    ];
    for (const len of edges) maxEdge = Math.max(maxEdge, len);
  }
  return maxEdge;
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
