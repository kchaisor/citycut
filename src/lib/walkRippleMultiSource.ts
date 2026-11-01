import {
  WALK_RIPPLE_MAX_MIN,
  WALK_RIPPLE_SPEED_MPM,
  snapToWalkNetwork,
  type NetworkSnap,
  type WalkNetwork,
  type WalkNetworkEdge,
} from "./walkRippleNetwork";
import type { Pt } from "../types";

export const WALK_RIPPLE_MAX_ORIGINS = 3;

export type RippleOriginSnap = {
  originIndex: number;
  point: Pt;
  snap: NetworkSnap;
};

export type MultiSourceRippleResult = {
  origins: Pt[];
  snaps: RippleOriginSnap[];
  nodeTimesMin: Float64Array;
  nodeOriginId: Uint8Array;
  edgeVertexTimes: Float32Array;
  edgeVertexOriginId: Float32Array;
  seamSegments: Float32Array;
};

function minutesPerMetre(): number {
  return 1 / WALK_RIPPLE_SPEED_MPM;
}

type HeapItem = { node: number; time: number; origin: number };

function pushHeap(heap: HeapItem[], item: HeapItem): void {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    const p = heap[parent]!;
    if (p.time <= heap[i]!.time) break;
    const tmp = heap[i]!;
    heap[i] = p;
    heap[parent] = tmp;
    i = parent;
  }
}

function popHeap(heap: HeapItem[]): HeapItem | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length === 0) return top;
  heap[0] = last;
  let i = 0;
  for (;;) {
    const left = i * 2 + 1;
    const right = left + 1;
    let smallest = i;
    if (left < heap.length && heap[left]!.time < heap[smallest]!.time) smallest = left;
    if (right < heap.length && heap[right]!.time < heap[smallest]!.time) smallest = right;
    if (smallest === i) break;
    const tmp = heap[i]!;
    heap[i] = heap[smallest]!;
    heap[smallest] = tmp;
    i = smallest;
  }
  return top;
}

function seedOriginOnEdge(
  network: WalkNetwork,
  edgeIndex: number,
  tAlong: number,
  originIndex: number,
  heap: HeapItem[],
  dist: Float64Array,
  originAt: Uint8Array,
): void {
  const edge = network.edges[edgeIndex]!;
  const mpm = minutesPerMetre();
  const segLen = edge.lengthM;
  const tA = tAlong * segLen * mpm;
  const tB = (1 - tAlong) * segLen * mpm;
  const tryPush = (node: number, time: number) => {
    if (time < dist[node]! - 1e-12) {
      dist[node] = time;
      originAt[node] = originIndex;
      pushHeap(heap, { node, time, origin: originIndex });
      return;
    }
    if (Math.abs(time - dist[node]!) <= 1e-9 && originIndex < originAt[node]!) {
      originAt[node] = originIndex;
      pushHeap(heap, { node, time, origin: originIndex });
    }
  };
  tryPush(edge.a, tA);
  tryPush(edge.b, tB);
}

export function computeMultiSourceRipple(network: WalkNetwork, originPoints: readonly Pt[]): MultiSourceRippleResult {
  const capped = originPoints.slice(0, WALK_RIPPLE_MAX_ORIGINS);
  const n = network.nodes.length;
  const dist = new Float64Array(n);
  dist.fill(Number.POSITIVE_INFINITY);
  const originAt = new Uint8Array(n);
  originAt.fill(255);
  const heap: HeapItem[] = [];
  const snaps: RippleOriginSnap[] = [];
  const origins: Pt[] = [];

  capped.forEach(([east, north], originIndex) => {
    const snap = snapToWalkNetwork(network, east, north);
    origins.push([snap.east, snap.north]);
    snaps.push({ originIndex, point: [snap.east, snap.north], snap });
    seedOriginOnEdge(network, snap.edgeIndex, snap.tAlong, originIndex, heap, dist, originAt);
  });

  while (heap.length > 0) {
    const item = popHeap(heap);
    if (!item) break;
    const { node, time, origin } = item;
    if (time > dist[node]! + 1e-9) continue;
    if (originAt[node]! !== origin) continue;
    for (let ei = 0; ei < network.edges.length; ei++) {
      const e = network.edges[ei]!;
      let next = -1;
      let add = 0;
      if (e.a === node) {
        next = e.b;
        add = e.lengthM * minutesPerMetre();
      } else if (e.b === node) {
        next = e.a;
        add = e.lengthM * minutesPerMetre();
      }
      if (next < 0) continue;
      const nextTime = time + add;
      if (nextTime >= dist[next]! - 1e-12) {
        if (nextTime <= dist[next]! + 1e-9 && origin < originAt[next]!) {
          originAt[next] = origin;
        }
        continue;
      }
      dist[next] = nextTime;
      originAt[next] = origin;
      pushHeap(heap, { node: next, time: nextTime, origin });
    }
  }

  const edgeVertexTimes = new Float32Array(network.edges.length * 4);
  const edgeVertexOriginId = new Float32Array(network.edges.length * 4);
  network.edges.forEach((e, i) => {
    const ta = dist[e.a]!;
    const tb = dist[e.b]!;
    const oa = originAt[e.a]!;
    const ob = originAt[e.b]!;
    const base = i * 4;
    const fill = (offset: number, t: number, o: number) => {
      edgeVertexTimes[offset] = Number.isFinite(t) ? t : WALK_RIPPLE_MAX_MIN + 1;
      edgeVertexOriginId[offset] = o;
    };
    fill(base, ta, oa);
    fill(base + 1, ta, oa);
    fill(base + 2, tb, ob);
    fill(base + 3, tb, ob);
  });

  const seamSegments = computeSeamSegments(network, dist, originAt);

  return {
    origins,
    snaps,
    nodeTimesMin: dist,
    nodeOriginId: originAt,
    edgeVertexTimes,
    edgeVertexOriginId,
    seamSegments,
  };
}

export function equalTimeSplitM(edge: WalkNetworkEdge, ta: number, tb: number): number {
  const mpm = minutesPerMetre();
  const l = edge.lengthM;
  if (l < 1e-6) return 0;
  const s = (tb - ta + l * mpm) / (2 * mpm);
  return Math.max(0, Math.min(l, s));
}

export function computeSeamSegments(
  network: WalkNetwork,
  nodeTimes: Float64Array,
  nodeOriginId: Uint8Array,
  tickHalfM = 2.4,
): Float32Array {
  const out: number[] = [];
  for (const edge of network.edges) {
    const oa = nodeOriginId[edge.a]!;
    const ob = nodeOriginId[edge.b]!;
    if (oa === ob || oa > 2 || ob > 2) continue;
    const ta = nodeTimes[edge.a]!;
    const tb = nodeTimes[edge.b]!;
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) continue;
    const s = equalTimeSplitM(edge, ta, tb);
    const t = s / edge.lengthM;
    const px = edge.ax + (edge.bx - edge.ax) * t;
    const py = edge.ay + (edge.by - edge.ay) * t;
    const dx = edge.bx - edge.ax;
    const dy = edge.by - edge.ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * tickHalfM;
    const ny = (dx / len) * tickHalfM;
    out.push(px - nx, py - ny, px + nx, py + ny);
  }
  return new Float32Array(out);
}

export type OriginShare = {
  originIndex: number;
  streetLengthM: number;
  buildingCount: number;
};

export function computeOriginSharesAtMinute(
  network: WalkNetwork,
  nodeTimes: Float64Array,
  nodeOriginId: Uint8Array,
  buildingArrivals: ReadonlyMap<number, number>,
  buildingOriginById: ReadonlyMap<number, number>,
  minuteCutoff: number,
): OriginShare[] {
  const street = [0, 0, 0];
  const buildings = [0, 0, 0];
  const mpm = minutesPerMetre();
  for (const edge of network.edges) {
    const ta = nodeTimes[edge.a]!;
    const tb = nodeTimes[edge.b]!;
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) continue;
    const oa = nodeOriginId[edge.a]!;
    const ob = nodeOriginId[edge.b]!;
    if (oa > 2 || ob > 2) continue;
    const l = edge.lengthM;
    if (oa === ob) {
      if (Math.min(ta, tb) <= minuteCutoff + 0.04) street[oa]! += l;
      continue;
    }
    const s = equalTimeSplitM(edge, ta, tb);
    const timeAtSplit = ta + s * mpm;
    if (ta <= minuteCutoff + 0.04) street[oa]! += s;
    if (tb <= minuteCutoff + 0.04) street[ob]! += l - s;
    if (timeAtSplit <= minuteCutoff + 0.04 && timeAtSplit >= ta - 0.04 && timeAtSplit >= tb - 0.04) {
      street[oa]! += 0;
    }
  }
  for (const [id, arrival] of buildingArrivals) {
    if (arrival > minuteCutoff + 0.04) continue;
    const o = buildingOriginById.get(id);
    if (o === undefined || o > 2) continue;
    buildings[o]! += 1;
  }
  return [0, 1, 2].map((originIndex) => ({
    originIndex,
    streetLengthM: street[originIndex]!,
    buildingCount: buildings[originIndex]!,
  }));
}

export function formatOriginSharePercents(shares: OriginShare[]): string[] {
  const streetTotal = shares.reduce((s, x) => s + x.streetLengthM, 0);
  const buildingTotal = shares.reduce((s, x) => s + x.buildingCount, 0);
  return shares.map((share) => {
    const streetPct = streetTotal > 0 ? Math.round((share.streetLengthM / streetTotal) * 100) : 0;
    const buildingPct = buildingTotal > 0 ? Math.round((share.buildingCount / buildingTotal) * 100) : 0;
    return `${streetPct}% / ${buildingPct}% bldg`;
  });
}
