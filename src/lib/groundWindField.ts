import type { CityModel } from "../types";
import { downwindFromSector, type WindPeriodStats } from "./windRose";
import { sampleTerrain } from "./terrain";

export const GROUND_WIND_DEFAULT_SECTOR = 0;
export const GROUND_WIND_LOOP_SEC = 5.2;
export const GROUND_WIND_PARTICLE_COUNT = 1320;
export const GROUND_WIND_GRID = 72;

export type GroundWindParticle = {
  east: number;
  north: number;
  phase: number;
  speed: number;
  lane: number;
};

export function groundWindGlyphScaleM(sideM: number): { length: number; width: number } {
  const length = Math.max(14, sideM * 0.028);
  return { length, width: Math.max(2.2, length * 0.14) };
}

function hash01(seed: number): number {
  return (Math.imul(seed, 2654435761) >>> 0) / 4294967296;
}

export function buildingBlocks(model: CityModel): boolean[][] {
  const n = GROUND_WIND_GRID;
  const half = model.sideM / 2;
  const step = model.sideM / n;
  const blocks = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  for (const building of model.buildings) {
    let minE = Infinity;
    let maxE = -Infinity;
    let minN = Infinity;
    let maxN = -Infinity;
    for (const [e, nn] of building.ring) {
      minE = Math.min(minE, e);
      maxE = Math.max(maxE, e);
      minN = Math.min(minN, nn);
      maxN = Math.max(maxN, nn);
    }
    const i0 = Math.max(0, Math.floor((minE + half) / step));
    const i1 = Math.min(n - 1, Math.floor((maxE + half) / step));
    const j0 = Math.max(0, Math.floor((minN + half) / step));
    const j1 = Math.min(n - 1, Math.floor((maxN + half) / step));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        blocks[i]![j] = true;
      }
    }
  }
  return blocks;
}

export function groundWindBaseVector(stats: WindPeriodStats | null): { east: number; north: number } {
  const sector = stats?.prevailingSector ?? GROUND_WIND_DEFAULT_SECTOR;
  return downwindFromSector(sector);
}

export function groundWindVectorAt(
  east: number,
  north: number,
  model: CityModel,
  blocks: boolean[][],
  base: { east: number; north: number },
): { east: number; north: number; speed: number } {
  const n = GROUND_WIND_GRID;
  const half = model.sideM / 2;
  const step = model.sideM / n;
  const ci = Math.min(n - 1, Math.max(0, Math.floor((east + half) / step)));
  const cj = Math.min(n - 1, Math.max(0, Math.floor((north + half) / step)));
  let ve = base.east;
  let vn = base.north;
  if (blocks[ci]?.[cj]) {
    const pushE = east / (Math.abs(east) + 1);
    const pushN = north / (Math.abs(north) + 1);
    ve += pushE * 0.55;
    vn += pushN * 0.55;
    const len = Math.hypot(ve, vn) || 1;
    ve /= len;
    vn /= len;
  }
  const open = blocks[ci]?.[cj] ? 0.45 : 1;
  const street = Math.abs(ve) > 0.75 || Math.abs(vn) > 0.75 ? 1.15 : 1;
  return { east: ve, north: vn, speed: open * street };
}

export function buildGroundWindParticles(model: CityModel, stats: WindPeriodStats | null): GroundWindParticle[] {
  const base = groundWindBaseVector(stats);
  const blocks = buildingBlocks(model);
  const half = model.sideM / 2;
  const step = model.sideM / GROUND_WIND_GRID;
  const out: GroundWindParticle[] = [];
  let attempts = 0;
  for (let i = 0; out.length < GROUND_WIND_PARTICLE_COUNT && attempts < GROUND_WIND_PARTICLE_COUNT * 8; i++) {
    attempts += 1;
    const east = hash01(i * 17 + 3) * model.sideM - half;
    const north = hash01(i * 31 + 7) * model.sideM - half;
    const ci = Math.min(GROUND_WIND_GRID - 1, Math.max(0, Math.floor((east + half) / step)));
    const cj = Math.min(GROUND_WIND_GRID - 1, Math.max(0, Math.floor((north + half) / step)));
    if (blocks[ci]?.[cj] && hash01(i * 97 + 5) < 0.92) continue;
    const flow = groundWindVectorAt(east, north, model, blocks, base);
    out.push({
      east,
      north,
      phase: hash01(i * 53 + 11),
      speed: flow.speed * (0.75 + hash01(i * 71) * 0.4),
      lane: 0.55 + hash01(i * 83) * 0.45,
    });
  }
  return out;
}

export function groundWindHeightAt(model: CityModel, east: number, north: number): number {
  const y = model.terrain ? sampleTerrain(model.terrain, east, north, model.sideM) : 0;
  return y + Math.max(0.8, model.sideM * 0.0014);
}
