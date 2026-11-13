import { describe, expect, it } from "vitest";
import { buildGroundWindField } from "./groundWindField";
import {
  createGroundWindParticles,
  GROUND_WIND_PARTICLES_MAX,
  groundWindDrawnSeQuarterBands,
  groundWindFrameWindowDensityAudit,
  groundWindMetresPerSecond,
  layoutGroundWindScreenSeeds,
  stepGroundWindParticles,
  warmGroundWindParticles,
} from "./groundWindParticles";
import { createGroundWindPerspectiveScreen } from "./groundWindPerspective";
import { groundWindRenderStats } from "./groundWindDebug";
import { groundWindTargetParticleCount } from "./groundWindScreen";
import type { CityModel, Pt } from "../types";

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function openGroundModel(): CityModel {
  const buildings = [];
  let id = 1;
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      if (Math.abs(i) <= 1 && Math.abs(j) <= 1) continue;
      if ((i + j) % 3 === 0) continue;
      buildings.push({
        id: id++,
        ring: ring(i * 42 - 10, j * 42 - 10, i * 42 + 10, j * 42 + 10),
        holes: [],
        height: 14,
        use: "residential" as const,
        source: "osm_tag" as const,
      });
    }
  }
  return {
    placeLabel: "Open",
    center: { lon: 145, lat: -38 },
    sideM: 380,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings,
    roads: [
      {
        id: 1,
        line: [
          [-180, -20],
          [180, -20],
        ],
        width: 12,
        kind: "road",
        grade: "arterial",
      },
    ],
    areas: [],
    trees: [],
    roadKm: 0.4,
    buildingCapHit: false,
    sourceNote: "",
  };
}

describe("groundWindPerspective", () => {
  it("lays out enough perspective particles and keeps them drawable after warm advection", () => {
    const model = openGroundModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.1 });
    const viewW = 1440;
    const viewH = 900;
    const { project, unproject, heightAt } = createGroundWindPerspectiveScreen(model, viewW, viewH);
    const particles = createGroundWindParticles(field, heightAt, 17, undefined, GROUND_WIND_PARTICLES_MAX, model);
    particles.viewWidth = viewW;
    particles.viewHeight = viewH;
    particles.screenProject = project;
    particles.screenUnproject = unproject;
    particles.metresPerPx = model.sideM / (viewW * 0.55);
    const active = layoutGroundWindScreenSeeds(particles, field, heightAt, model, 17);
    expect(active).toBeGreaterThan(groundWindTargetParticleCount(viewW, viewH) * 0.55);
    const mps = groundWindMetresPerSecond(model.sideM, 18);
    warmGroundWindParticles(particles, field, heightAt, mps, 2);
    for (let step = 0; step < 90; step++) {
      stepGroundWindParticles(particles, field, heightAt, 1 / 60, mps);
    }
    const stats = groundWindRenderStats(particles, viewW);
    expect(stats.active).toBeGreaterThanOrEqual(active);
    expect(stats.drawable).toBeGreaterThanOrEqual(active * 0.88);
  }, 25_000);

  it("keeps ground-normalised drawn length within 0.35x of the frame median in ground-rich windows", () => {
    const model = openGroundModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.1 });
    const viewW = 1440;
    const viewH = 900;
    const { project, unproject, heightAt } = createGroundWindPerspectiveScreen(model, viewW, viewH);
    const particles = createGroundWindParticles(field, heightAt, 23, undefined, GROUND_WIND_PARTICLES_MAX, model);
    particles.viewWidth = viewW;
    particles.viewHeight = viewH;
    particles.screenProject = project;
    particles.screenUnproject = unproject;
    particles.metresPerPx = model.sideM / (viewW * 0.55);
    layoutGroundWindScreenSeeds(particles, field, heightAt, model, 23);
    const mps = groundWindMetresPerSecond(model.sideM, 18);
    warmGroundWindParticles(particles, field, heightAt, mps, 2);
    for (let step = 0; step < 160; step++) {
      stepGroundWindParticles(particles, field, heightAt, 1 / 60, mps);
    }
    const audit = groundWindFrameWindowDensityAudit(particles, field, model, heightAt, 200, 0.15, 100, 0.35);
    const report = {
      medianNormalised: audit.medianNormalised,
      groundRichWindows: audit.groundRichWindows,
      minRatioToMedian: audit.minRatioToMedian,
      worst: audit.worst,
    };
    const seBands = groundWindDrawnSeQuarterBands(particles, field, model, heightAt);
    console.log(`ground-wind se-drawn ${JSON.stringify(seBands)}`);
    console.log(`ground-wind window-density ${JSON.stringify(report)}`);
    expect(seBands.left.groundNormalisedLength).toBeGreaterThan(0);
    expect(seBands.right.groundNormalisedLength).toBeGreaterThan(seBands.left.groundNormalisedLength * 0.35);
    expect(audit.groundRichWindows).toBeGreaterThan(4);
    expect(audit.minRatioToMedian).toBeGreaterThanOrEqual(0.35);
  }, 45_000);
});
