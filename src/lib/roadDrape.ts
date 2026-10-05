import type { Pt } from "../types";
import { polylineLength } from "./geo";

/** Extra height on a bridge deck between the tapered abutments. */
export const BRIDGE_DECK_CLEARANCE_M = 5;

/** Distance from each abutment over which clearance tapers to zero. */
export const BRIDGE_DECK_TAPER_M = 12;

/** Normalised distance along `line` of the closest point to `point`. */
export function closestParameter(line: Pt[], point: Pt): number {
  const total = polylineLength(line);
  if (total < 1e-9) return 0;
  let bestDist = Infinity;
  let bestAlong = 0;
  let walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (len * len)));
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    const dist = Math.hypot(point[0] - px, point[1] - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestAlong = walked + t * len;
    }
    walked += len;
  }
  return bestAlong / total;
}

/**
 * Planar ramp between the abutment ground heights, plus clearance that
 * tapers to zero at each end. Within the taper, height blends toward the
 * local terrain sample so deck edges meet the ground without gaps.
 */
export function deckHeightAt(
  line: Pt[],
  sample: (east: number, north: number) => number,
  east: number,
  north: number,
  clearance = BRIDGE_DECK_CLEARANCE_M,
  taperM = BRIDGE_DECK_TAPER_M,
): number {
  const ground = sample(east, north);
  const t = closestParameter(line, [east, north]);
  const start = line[0];
  const end = line[line.length - 1];
  const z0 = sample(start[0], start[1]);
  const z1 = sample(end[0], end[1]);
  const base = z0 + t * (z1 - z0);
  const total = polylineLength(line);
  const taper = total < 1e-3 ? 0.5 : Math.min(0.45, taperM / total);
  let extra = clearance;
  if (taper > 0 && t < taper) extra = clearance * (t / taper);
  else if (taper > 0 && t > 1 - taper) extra = clearance * ((1 - t) / taper);
  const elevated = base + extra;
  if (taper > 0 && t < taper) {
    const blend = t / taper;
    const blended = ground + blend * (elevated - ground);
    return Math.max(ground, blended);
  }
  if (taper > 0 && t > 1 - taper) {
    const blend = (1 - t) / taper;
    const blended = ground + blend * (elevated - ground);
    return Math.max(ground, blended);
  }
  return elevated;
}
