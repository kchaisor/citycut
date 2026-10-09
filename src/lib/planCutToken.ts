import type { CityModel, Pt } from "../types";

function mixCutHash(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}

function hashLine(hash: number, line: Pt[]): number {
  let h = mixCutHash(hash, line.length);
  for (const [x, y] of line) {
    h = mixCutHash(h, Math.round(x * 100));
    h = mixCutHash(h, Math.round(y * 100));
  }
  return h;
}

/** Stable per-cut identity from frame and geometry (not feature counts alone). */
export function planModelCutToken(model: CityModel): string {
  let h = 2166136261;
  h = mixCutHash(h, Math.round(model.sideM));
  h = mixCutHash(h, Math.round(model.center.lat * 1e6));
  h = mixCutHash(h, Math.round(model.center.lon * 1e6));
  h = mixCutHash(h, model.frameShape === "circle" ? 1 : 0);
  for (const road of model.roads) {
    h = mixCutHash(h, road.id);
    h = mixCutHash(h, Math.round(road.width * 100));
    h = hashLine(h, road.line);
  }
  for (const building of model.buildings) {
    h = mixCutHash(h, building.id);
    h = hashLine(h, building.ring);
    h = mixCutHash(h, building.holes.length);
    for (const hole of building.holes) h = hashLine(h, hole);
  }
  for (const area of model.areas) {
    h = mixCutHash(h, area.id);
    h = hashLine(h, area.ring);
    for (const hole of area.holes) h = hashLine(h, hole);
  }
  for (const block of model.blocks ?? []) {
    h = hashLine(h, block.ring);
    for (const hole of block.holes) h = hashLine(h, hole);
  }
  for (const line of model.tramLines ?? []) h = hashLine(h, line);
  return `${model.sideM}:${model.center.lat.toFixed(6)}:${model.center.lon.toFixed(6)}:${h.toString(16)}`;
}
