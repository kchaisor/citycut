import type { LonLat, Pt, RoadFeat } from "../types";
import { tileLocalRect } from "./overtureTiles";

/** Largest distance between consecutive vertices along a polyline. */
export function maxConsecutiveJump(line: Pt[]): number {
  let max = 0;
  for (let i = 1; i < line.length; i++) {
    max = Math.max(max, Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  }
  return max;
}

/** Split where consecutive vertices jump farther than `maxJumpM`. */
export function splitPolylineAtJumps(line: Pt[], maxJumpM: number): Pt[][] {
  if (line.length < 2) return [];
  const parts: Pt[][] = [];
  let current: Pt[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const prev = line[i - 1];
    const next = line[i];
    const jump = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
    if (jump > maxJumpM && current.length >= 2) {
      parts.push(current);
      current = [next];
    } else {
      if (current.length === 0 || current[current.length - 1] !== next) current.push(next);
    }
  }
  if (current.length >= 2) parts.push(current);
  return parts;
}

/** Overture z14 tile span at the cut origin, times two for a safety margin. */
export function overtureMaxRoadJumpM(z: number, origin: LonLat): number {
  const n = 2 ** z;
  const x = Math.floor(((origin.lon + 180) / 360) * n);
  const latRad = (origin.lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const rect = tileLocalRect(z, x, y, origin);
  const span = Math.max(rect.maxE - rect.minE, rect.maxN - rect.minN);
  return span * 2;
}

export type SanitizeRoadsResult = { roads: RoadFeat[]; dropped: number; split: number };

/** Drop or split road centerlines with impossible vertex jumps (tile clip chords, bad merges). */
export function sanitizeRoadFeatures(
  roads: RoadFeat[],
  maxJumpM: number,
  log = console.warn,
): SanitizeRoadsResult {
  const out: RoadFeat[] = [];
  let dropped = 0;
  let split = 0;
  for (const road of roads) {
    const parts = splitPolylineAtJumps(road.line, maxJumpM);
    if (parts.length === 0) {
      if (road.line.length >= 2 && maxConsecutiveJump(road.line) > maxJumpM) {
        dropped += 1;
        log(`[CityCut roads] Dropped road ${road.id}: jump ${maxConsecutiveJump(road.line).toFixed(1)} m`);
      }
      continue;
    }
    if (parts.length > 1) split += parts.length - 1;
    for (let index = 0; index < parts.length; index++) {
      const line = parts[index];
      if (maxConsecutiveJump(line) > maxJumpM) {
        dropped += 1;
        log(`[CityCut roads] Dropped road part ${road.id}:${index}: jump ${maxConsecutiveJump(line).toFixed(1)} m`);
        continue;
      }
      out.push({
        ...road,
        id: index === 0 ? road.id : road.id + index,
        line,
      });
    }
  }
  return { roads: out, dropped, split };
}
