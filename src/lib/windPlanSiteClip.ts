import type { CityModel, Pt } from "../types";
import type { WorldRing } from "./windPlanContours";

export type CutExtent = { minE: number; minN: number; maxE: number; maxN: number };

export type WindPlanSiteClip = { rings: WorldRing[]; fallback: "site" | "cut" };

export function cutExtent(model: Pick<CityModel, "sideM" | "widthM" | "heightM">): CutExtent {
  const w = model.widthM ?? model.sideM;
  const h = model.heightM ?? model.sideM;
  return { minE: -w / 2, minN: -h / 2, maxE: w / 2, maxN: h / 2 };
}

function ringArea(ring: WorldRing): number {
  let sum = 0;
  const n = ring.length / 2;
  for (let k = 0; k < n; k++) {
    const m = (k + 1) % n;
    sum += ring[k * 2]! * ring[m * 2 + 1]! - ring[m * 2]! * ring[k * 2 + 1]!;
  }
  return sum / 2;
}

function closedRing(line: readonly Pt[]): WorldRing | null {
  const points: Pt[] = [];
  for (const point of line) {
    const last = points[points.length - 1];
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    points.push(point);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first![0] === last![0] && first![1] === last![1]) points.pop();
  if (points.length < 3) return null;
  const ring = new Float64Array(points.length * 2);
  points.forEach(([e, n], k) => {
    ring[k * 2] = e;
    ring[k * 2 + 1] = n;
  });
  return Math.abs(ringArea(ring)) > 1e-6 ? ring : null;
}

function cutRing({ minE, minN, maxE, maxN }: CutExtent): WorldRing {
  return Float64Array.of(minE, minN, maxE, minN, maxE, maxN, minE, maxN);
}

export function windPlanSiteClip(model: Pick<CityModel, "sideM" | "widthM" | "heightM" | "siteBoundaryLines">): WindPlanSiteClip {
  const rings: WorldRing[] = [];
  for (const line of model.siteBoundaryLines ?? []) {
    const ring = closedRing(line);
    if (ring) rings.push(ring);
  }
  if (rings.length > 0) return { rings, fallback: "site" };
  return { rings: [cutRing(cutExtent(model))], fallback: "cut" };
}

export function pointInClip(e: number, n: number, rings: readonly WorldRing[]): boolean {
  let inside = false;
  for (const ring of rings) {
    const count = ring.length / 2;
    for (let k = 0, m = count - 1; k < count; m = k++) {
      const ae = ring[k * 2]!;
      const an = ring[k * 2 + 1]!;
      const be = ring[m * 2]!;
      const bn = ring[m * 2 + 1]!;
      if (an > n !== bn > n && e < ((be - ae) * (n - an)) / (bn - an) + ae) inside = !inside;
    }
  }
  return inside;
}
