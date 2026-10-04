import type { Pt, Ring } from "../types";

/** Simple miter-joined buffer around an open polyline (plan metres). */
export function bufferOpenLine(line: Pt[], halfWidth: number): Ring | null {
  if (line.length < 2 || halfWidth <= 0) return null;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = (-dy / len) * halfWidth;
    const ny = (dx / len) * halfWidth;
    left.push([line[i][0] + nx, line[i][1] + ny]);
    right.push([line[i][0] - nx, line[i][1] - ny]);
  }
  if (left.length < 2 || right.length < 2) return null;
  const ring: Ring = [...left, ...right.reverse()];
  ring.push(ring[0]);
  return ring;
}
