import type { CityModel } from "../types";

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-6) return Math.hypot(apx, apy);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

export function groundWindWantsCasing(model: CityModel, east: number, north: number): boolean {
  let onRoad = false;
  for (let r = 0; r < model.roads.length; r++) {
    const road = model.roads[r]!;
    if (road.kind === "rail") continue;
    const line = road.line;
    const half = Math.max(4, road.width * 0.5 + 2.5);
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k]!;
      const b = line[k + 1]!;
      if (distToSegment(east, north, a[0], a[1], b[0], b[1]) <= half) {
        onRoad = true;
        break;
      }
    }
    if (onRoad) break;
  }
  if (onRoad) return true;
  for (let a = 0; a < model.areas.length; a++) {
    const area = model.areas[a]!;
    if (area.kind !== "water") continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of area.ring) {
      minX = Math.min(minX, pt[0]);
      maxX = Math.max(maxX, pt[0]);
      minY = Math.min(minY, pt[1]);
      maxY = Math.max(maxY, pt[1]);
    }
    if (east >= minX && east <= maxX && north >= minY && north <= maxY) return true;
  }
  return false;
}
