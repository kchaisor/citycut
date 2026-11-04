import { REACH_UNREACHABLE, REACH_WALK_MPM } from "./constants";
import type { ReachDataset } from "./types";

export function walkMinutesFromOrigin(dataset: ReachDataset, originIndex: number, maxMin: number): Uint8Array {
  const n = dataset.h3Indices.length;
  const out = new Uint8Array(n);
  out.fill(REACH_UNREACHABLE);
  if (originIndex < 0 || originIndex >= n) return out;
  const dist = new Float32Array(n);
  dist.fill(Number.POSITIVE_INFINITY);
  const heap: { i: number; t: number }[] = [];
  const push = (i: number, t: number) => {
    if (t >= dist[i]!) return;
    dist[i] = t;
    heap.push({ i, t });
    heap.sort((a, b) => a.t - b.t);
  };
  push(originIndex, 0);
  while (heap.length > 0) {
    const { i, t } = heap.shift()!;
    if (t > dist[i]! + 1e-6) continue;
    if (t > maxMin + 1e-6) continue;
    out[i] = Math.min(REACH_UNREACHABLE - 1, Math.ceil(t));
    const nbrs = dataset.neighbors[i]!;
    const weights = dataset.edgeMinutes[i]!;
    for (let k = 0; k < nbrs.length; k++) {
      const j = nbrs[k]!;
      const w = weights[k]!;
      if (!Number.isFinite(w)) continue;
      push(j, t + w);
    }
  }
  return out;
}

export function walkMinutesBetween(dataset: ReachDataset, from: number, to: number, maxMin: number): number {
  if (from === to) return 0;
  const times = walkMinutesFromOrigin(dataset, from, maxMin);
  const v = times[to]!;
  return v >= REACH_UNREACHABLE ? Number.POSITIVE_INFINITY : v;
}

export function edgeMinutesFromMetres(metres: number): number {
  return metres / REACH_WALK_MPM;
}
