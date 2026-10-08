import type { MultiPolygon } from "polygon-clipping";
import { openRing } from "./geo";

export const KELVIN_CROPS: Record<string, string> = {
  "facet-spot": "125 385 70 70",
  "kerb-return": "142 442 20 20",
  "path-kink": "171 381 24 24",
  "road-gaps": "284 127 55 35",
};

type BoundaryPt = { east: number; north: number; edgeLen: number; turnDeg: number };

function viewBoxBounds(vb: string): { eastMin: number; eastMax: number; northMin: number; northMax: number } {
  const [x, y, w, h] = vb.split(/\s+/).map(Number);
  return { eastMin: x, eastMax: x + w, northMin: -(y + h), northMax: -y };
}

function inCrop(east: number, north: number, vb: string): boolean {
  const b = viewBoxBounds(vb);
  return east >= b.eastMin && east <= b.eastMax && north >= b.northMin && north <= b.northMax;
}

function distPointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function boundaryPointsInCrop(multi: MultiPolygon, vb: string): BoundaryPt[] {
  const out: BoundaryPt[] = [];
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = openRing(ring);
      const n = open.length;
      for (let i = 0; i < n; i++) {
        const curr = open[i]!;
        const prev = open[(i + n - 1) % n]!;
        const next = open[(i + 1) % n]!;
        if (!inCrop(curr[0], curr[1], vb)) continue;
        const ax = curr[0] - prev[0];
        const ay = curr[1] - prev[1];
        const bx = next[0] - curr[0];
        const by = next[1] - curr[1];
        const la = Math.hypot(ax, ay);
        const lb = Math.hypot(bx, by);
        let turn = 0;
        if (la > 1e-9 && lb > 1e-9) {
          const cross = ax * by - ay * bx;
          const dot = ax * bx + ay * by;
          turn = (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
        }
        out.push({ east: curr[0], north: curr[1], edgeLen: Math.max(la, lb), turnDeg: turn });
      }
    }
  }
  return out;
}

function minDistToMulti(px: number, py: number, multi: MultiPolygon): number {
  let best = Infinity;
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = openRing(ring);
      for (let i = 0; i < open.length; i++) {
        const a = open[i]!;
        const b = open[(i + 1) % open.length]!;
        best = Math.min(best, distPointSeg(px, py, a[0], a[1], b[0], b[1]));
      }
    }
  }
  return best;
}

function isDeliberatelySmoothedRoad(pt: BoundaryPt): boolean {
  return pt.edgeLen > 1.5;
}

export function maxHausdorffOutsideSmoothed(
  main: MultiPolygon,
  pr: MultiPolygon,
  vb: string,
  layer: "path" | "road",
  roadMask?: MultiPolygon[],
): number {
  let max = 0;
  for (const pair of [
    { a: main, b: pr },
    { a: pr, b: main },
  ]) {
    for (const pt of boundaryPointsInCrop(pair.a, vb)) {
      if (layer === "road" && isDeliberatelySmoothedRoad(pt)) continue;
      if (layer === "path" && roadMask?.some((road) => minDistToMulti(pt.east, pt.north, road) <= 5)) continue;
      max = Math.max(max, minDistToMulti(pt.east, pt.north, pair.b));
    }
  }
  return max;
}

function isCurvedEdgeVertex(pt: BoundaryPt): boolean {
  return pt.turnDeg >= 5 && pt.turnDeg <= 120 && pt.edgeLen <= 2.5;
}

export function maxTurnOnCurves(multi: MultiPolygon, vb: string): number {
  let max = 0;
  for (const pt of boundaryPointsInCrop(multi, vb)) {
    if (!isCurvedEdgeVertex(pt)) continue;
    max = Math.max(max, pt.turnDeg);
  }
  return max;
}

export function curveVertexCount(multi: MultiPolygon, vb: string): number {
  return boundaryPointsInCrop(multi, vb).filter((pt) => isCurvedEdgeVertex(pt)).length;
}

export function roadCurveVertexCount(multi: MultiPolygon, vb: string, minEdgeM = 2): number {
  return boundaryPointsInCrop(multi, vb).filter((pt) => pt.edgeLen >= minEdgeM).length;
}
