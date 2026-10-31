import type { CityModel, Pt, RoadFeat } from "../types";

export const WALK_RIPPLE_SPEED_MPM = 80;
export const WALK_RIPPLE_MAX_MIN = 15;
export const WALK_RIPPLE_BANDS_MIN = [5, 10, 15] as const;

const NODE_EPS_M = 0.35;

export type WalkNetworkEdge = {
  a: number;
  b: number;
  lengthM: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
};

export type WalkNetwork = {
  nodes: Pt[];
  edges: WalkNetworkEdge[];
};

export function isWalkNetworkRoad(road: RoadFeat): boolean {
  if (road.kind !== "road") return false;
  if (road.service) return false;
  return true;
}

export function buildWalkNetwork(roads: readonly RoadFeat[]): WalkNetwork | null {
  const walkable = roads.filter(isWalkNetworkRoad);
  if (walkable.length === 0) return null;
  const nodes: Pt[] = [];
  const nodeIndex = new Map<string, number>();

  const nodeAt = (x: number, y: number): number => {
    const key = `${Math.round(x / NODE_EPS_M)},${Math.round(y / NODE_EPS_M)}`;
    const existing = nodeIndex.get(key);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push([x, y]);
    nodeIndex.set(key, id);
    return id;
  };

  const edges: WalkNetworkEdge[] = [];
  for (const road of walkable) {
    const line = road.line;
    if (line.length < 2) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i]!;
      const [bx, by] = line[i + 1]!;
      const lengthM = Math.hypot(bx - ax, by - ay);
      if (lengthM < 0.05) continue;
      const a = nodeAt(ax, ay);
      const b = nodeAt(bx, by);
      if (a === b) continue;
      edges.push({ a, b, lengthM, ax, ay, bx, by });
    }
  }
  if (edges.length === 0) return null;
  return { nodes, edges };
}

export type NetworkSnap = {
  east: number;
  north: number;
  edgeIndex: number;
  tAlong: number;
};

export function snapToWalkNetwork(network: WalkNetwork, east: number, north: number): NetworkSnap {
  let bestDist = Infinity;
  let best: NetworkSnap = { east, north, edgeIndex: 0, tAlong: 0 };
  network.edges.forEach((edge, edgeIndex) => {
    const dx = edge.bx - edge.ax;
    const dy = edge.by - edge.ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) return;
    const t = Math.max(0, Math.min(1, ((east - edge.ax) * dx + (north - edge.ay) * dy) / len2));
    const px = edge.ax + t * dx;
    const py = edge.ay + t * dy;
    const d = Math.hypot(east - px, north - py);
    if (d < bestDist) {
      bestDist = d;
      best = { east: px, north: py, edgeIndex, tAlong: t };
    }
  });
  return best;
}

export type RippleTimesNetwork = {
  mode: "network";
  origin: Pt;
  snap: NetworkSnap;
  nodeTimesMin: Float64Array;
  edgeVertexTimes: Float32Array;
};

export type RippleTimesStraight = {
  mode: "straight";
  origin: Pt;
};

export type RippleTimes = RippleTimesNetwork | RippleTimesStraight;

function minutesPerMetre(): number {
  return 1 / WALK_RIPPLE_SPEED_MPM;
}

export function computeRippleTimesNetwork(
  network: WalkNetwork,
  originEast: number,
  originNorth: number,
): RippleTimesNetwork {
  const snap = snapToWalkNetwork(network, originEast, originNorth);
  const mpm = minutesPerMetre();
  const n = network.nodes.length;
  const dist = new Float64Array(n);
  dist.fill(Number.POSITIVE_INFINITY);
  const heap: Array<{ node: number; time: number }> = [];

  const push = (node: number, time: number) => {
    if (time >= dist[node]!) return;
    dist[node] = time;
    heap.push({ node, time });
    heap.sort((a, b) => a.time - b.time);
  };

  const edge = network.edges[snap.edgeIndex]!;
  const segLen = edge.lengthM;
  const tA = snap.tAlong * segLen * mpm;
  const tB = (1 - snap.tAlong) * segLen * mpm;
  push(edge.a, tA);
  push(edge.b, tB);

  while (heap.length > 0) {
    const { node, time } = heap.shift()!;
    if (time > dist[node]! + 1e-9) continue;
    for (let ei = 0; ei < network.edges.length; ei++) {
      const e = network.edges[ei]!;
      let next = -1;
      let add = 0;
      if (e.a === node) {
        next = e.b;
        add = e.lengthM * mpm;
      } else if (e.b === node) {
        next = e.a;
        add = e.lengthM * mpm;
      }
      if (next >= 0) push(next, time + add);
    }
  }

  const edgeVertexTimes = new Float32Array(network.edges.length * 4);
  network.edges.forEach((e, i) => {
    const ta = dist[e.a]!;
    const tb = dist[e.b]!;
    const base = i * 4;
    edgeVertexTimes[base] = Number.isFinite(ta) ? ta : WALK_RIPPLE_MAX_MIN + 1;
    edgeVertexTimes[base + 1] = Number.isFinite(ta) ? ta : WALK_RIPPLE_MAX_MIN + 1;
    edgeVertexTimes[base + 2] = Number.isFinite(tb) ? tb : WALK_RIPPLE_MAX_MIN + 1;
    edgeVertexTimes[base + 3] = Number.isFinite(tb) ? tb : WALK_RIPPLE_MAX_MIN + 1;
  });

  return {
    mode: "network",
    origin: [snap.east, snap.north],
    snap,
    nodeTimesMin: dist,
    edgeVertexTimes,
  };
}

export function computeRippleTimesStraight(originEast: number, originNorth: number): RippleTimesStraight {
  return { mode: "straight", origin: [originEast, originNorth] };
}

export function computeRippleTimes(model: Pick<CityModel, "roads">, originEast: number, originNorth: number): RippleTimes {
  const network = buildWalkNetwork(model.roads);
  if (!network) return computeRippleTimesStraight(originEast, originNorth);
  return computeRippleTimesNetwork(network, originEast, originNorth);
}

export function buildingArrivalMinutes(
  times: RippleTimes,
  buildingCentroid: Pt,
  network: WalkNetwork | null,
): number {
  const mpm = minutesPerMetre();
  const [ex, ey] = buildingCentroid;
  if (times.mode === "straight") {
    const [ox, oy] = times.origin;
    return Math.hypot(ex - ox, ey - oy) * mpm;
  }
  if (!network) return Math.hypot(ex - times.origin[0], ey - times.origin[1]) * mpm;
  let best = Number.POSITIVE_INFINITY;
  const dist = times.nodeTimesMin;
  for (let i = 0; i < network.nodes.length; i++) {
    const [nx, ny] = network.nodes[i]!;
    const nodeT = dist[i]!;
    if (!Number.isFinite(nodeT)) continue;
    const d = Math.hypot(ex - nx, ey - ny);
    best = Math.min(best, nodeT + d * mpm);
  }
  for (const e of network.edges) {
    const dx = e.bx - e.ax;
    const dy = e.by - e.ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ((ex - e.ax) * dx + (ey - e.ay) * dy) / len2));
    const px = e.ax + t * dx;
    const py = e.ay + t * dy;
    const ta = dist[e.a]!;
    const tb = dist[e.b]!;
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) continue;
    const edgeT = ta + (tb - ta) * t;
    const tail = Math.hypot(ex - px, ey - py) * mpm;
    best = Math.min(best, edgeT + tail);
  }
  return best;
}

export function assignBuildingArrivals(
  model: Pick<CityModel, "buildings" | "roads">,
  times: RippleTimes,
): Map<number, number> {
  const network = times.mode === "network" ? buildWalkNetwork(model.roads) : null;
  const out = new Map<number, number>();
  for (const building of model.buildings) {
    if (building.meshDrawnBy !== undefined) continue;
    const ring = building.ring;
    if (ring.length < 3) continue;
    let sx = 0;
    let sy = 0;
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
    }
    const n = ring.length;
    const arrival = buildingArrivalMinutes(times, [sx / n, sy / n], network);
    out.set(building.id, arrival);
  }
  return out;
}
