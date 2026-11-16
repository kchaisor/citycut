import { describe, expect, it } from "vitest";
import { buildGroundWindGrid } from "./groundWindField";
import {
  createGroundWindStreaks,
  GROUND_WIND_FADE_IN_S,
  GROUND_WIND_FADE_OUT_S,
  GROUND_WIND_INDICES_PER_STREAK,
  GROUND_WIND_STREAKS_DEFAULT,
  GROUND_WIND_STREAKS_MAX,
  GROUND_WIND_VERTEX_STRIDE,
  GROUND_WIND_VERTS_PER_STREAK,
  groundWindLifeAlpha,
  groundWindMetresPerSecond,
  groundWindStreakCount,
  groundWindStreakIndices,
  stepGroundWindStreaks,
  writeGroundWindStreakVertices,
} from "./groundWindStreaks";
import type { CityModel, Pt } from "../types";

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function denseModel(sideM = 1000): CityModel {
  const buildings = [];
  let id = 1;
  const step = sideM / 8;
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      buildings.push({
        id: id++,
        ring: ring(i * step - step * 0.3, j * step - step * 0.3, i * step + step * 0.3, j * step + step * 0.3),
        holes: [],
        height: 12 + ((i + j + 6) % 4) * 6,
        use: "residential" as const,
        source: "osm_tag" as const,
      });
    }
  }
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

const flat = () => 1;

describe("groundWindStreaks", () => {
  it("scales the streak count with cut area", () => {
    expect(groundWindStreakCount({ sideM: 1000 })).toBe(GROUND_WIND_STREAKS_DEFAULT);
    expect(groundWindStreakCount({ sideM: 500 })).toBeLessThan(GROUND_WIND_STREAKS_DEFAULT);
    expect(groundWindStreakCount({ sideM: 3000 })).toBe(GROUND_WIND_STREAKS_MAX);
  });

  it("fades in and out over the life", () => {
    expect(groundWindLifeAlpha(0, 4)).toBe(0);
    expect(groundWindLifeAlpha(GROUND_WIND_FADE_IN_S / 2, 4)).toBeCloseTo(0.5, 5);
    expect(groundWindLifeAlpha(2, 4)).toBe(1);
    expect(groundWindLifeAlpha(4 - GROUND_WIND_FADE_OUT_S / 2, 4)).toBeCloseTo(0.5, 5);
    expect(groundWindLifeAlpha(4, 4)).toBe(0);
  });

  it("indexes one ribbon plus one arrowhead per streak", () => {
    const idx = groundWindStreakIndices(2);
    expect(idx.length).toBe(2 * GROUND_WIND_INDICES_PER_STREAK);
    expect(Math.max(...idx)).toBe(2 * GROUND_WIND_VERTS_PER_STREAK - 1);
  });

  it("keeps heads inside the cut and out of buildings, and respawns upwind", () => {
    const model = denseModel();
    const grid = buildGroundWindGrid(model, 8);
    const mps = groundWindMetresPerSecond(model.sideM, 20);
    const streaks = createGroundWindStreaks(model, grid, flat, mps, 1500);
    for (let s = 0; s < 400; s++) stepGroundWindStreaks(streaks, grid, flat, mps, 1 / 60);
    const half = model.sideM / 2;
    const obs = grid.obstacles;
    for (let p = 0; p < streaks.count; p++) {
      const e = streaks.headE[p]!;
      const n = streaks.headN[p]!;
      expect(Math.abs(e)).toBeLessThanOrEqual(half);
      expect(Math.abs(n)).toBeLessThanOrEqual(half);
      const i = Math.min(obs.cols - 1, Math.floor((e - obs.originE) / obs.cellM));
      const j = Math.min(obs.rows - 1, Math.floor((n - obs.originN) / obs.cellM));
      expect(obs.solid[j * obs.cols + i]).toBe(0);
    }
    expect(streaks.respawns).toBeGreaterThan(1500);
    expect(streaks.edgeRespawns / streaks.respawns).toBeGreaterThan(0.2);
  });

  it("moves heads downwind for a southerly", () => {
    const model = denseModel();
    const grid = buildGroundWindGrid(model, 8);
    const mps = groundWindMetresPerSecond(model.sideM, 20);
    const streaks = createGroundWindStreaks(model, grid, flat, mps, 600);
    for (let p = 0; p < streaks.count; p++) streaks.age[p] = 1;
    const before = Float32Array.from(streaks.headN);
    stepGroundWindStreaks(streaks, grid, flat, mps, 1 / 30);
    let north = 0;
    for (let p = 0; p < streaks.count; p++) north += streaks.headN[p]! - before[p]!;
    expect(north / streaks.count).toBeGreaterThan(0);
  });

  it("steps and writes 3,000 streaks in under 3 ms a frame", () => {
    const model = denseModel(2000);
    const grid = buildGroundWindGrid(model, 12);
    const mps = groundWindMetresPerSecond(model.sideM, 20);
    const streaks = createGroundWindStreaks(model, grid, flat, mps, 3000);
    for (let s = 0; s < 60; s++) {
      stepGroundWindStreaks(streaks, grid, flat, mps, 1 / 60);
      writeGroundWindStreakVertices(streaks);
    }
    const frames = 240;
    let drawn = 0;
    const t0 = performance.now();
    for (let s = 0; s < frames; s++) {
      stepGroundWindStreaks(streaks, grid, flat, mps, 1 / 60);
      drawn = writeGroundWindStreakVertices(streaks);
    }
    const msPerFrame = (performance.now() - t0) / frames;
    console.info(`ground wind: 3000 streaks ${msPerFrame.toFixed(3)} ms/frame`);
    expect(drawn).toBeGreaterThan(2000);
    expect(streaks.vertices.length).toBe(3000 * GROUND_WIND_VERTS_PER_STREAK * GROUND_WIND_VERTEX_STRIDE);
    expect(msPerFrame).toBeLessThan(3);
  });
});
