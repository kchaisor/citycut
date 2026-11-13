import { describe, expect, it } from "vitest";
import { buildGroundWindField } from "./groundWindField";
import {
  createGroundWindParticles,
  groundWindCoreWidthPx,
  groundWindMeanTrailScreenPx,
  groundWindMetresPerSecond,
  groundWindOrthographicProject,
  layoutGroundWindScreenSeeds,
  warmGroundWindParticles,
} from "./groundWindParticles";
import {
  groundWindEstimatedBlueCoverage,
  groundWindGroundNormalizedBalance,
  groundWindTargetParticleCount,
} from "./groundWindScreen";
import type { CityModel, Pt } from "../types";

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function denseModel(): CityModel {
  const buildings = [];
  let id = 1;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      buildings.push({
        id: id++,
        ring: ring(i * 60 - 18, j * 60 - 18, i * 60 + 18, j * 60 + 18),
        holes: [],
        height: 12,
        use: "residential" as const,
        source: "osm_tag" as const,
      });
    }
  }
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM: 320,
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

function bindOrthographicScreen(
  particles: ReturnType<typeof createGroundWindParticles>,
  model: CityModel,
  viewW: number,
  viewH: number,
) {
  particles.viewWidth = viewW;
  particles.viewHeight = viewH;
  particles.cityModel = model;
  particles.metresPerPx = model.sideM / viewW;
  particles.screenProject = (east, north, y) => groundWindOrthographicProject(east, north, y, viewW, viewH, model.sideM);
  particles.screenUnproject = (sx, sy) => ({
    east: (sx / viewW - 0.5) * model.sideM,
    north: (sy / viewH - 0.5) * model.sideM,
  });
}

describe("groundWindScreen", () => {
  it("targets about 1800 particles at 1440×900", () => {
    expect(groundWindTargetParticleCount(1440, 900)).toBe(1800);
    expect(groundWindTargetParticleCount(1280, 800)).toBeGreaterThan(1400);
  });

  it("estimates blue coverage at or above 2% at 1440×900", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.12 });
    const viewW = 1440;
    const viewH = 900;
    const particles = createGroundWindParticles(field, flat, 11, undefined, 3200, model);
    bindOrthographicScreen(particles, model, viewW, viewH);
    const active = layoutGroundWindScreenSeeds(particles, field, flat, model, 11);
    expect(active).toBeGreaterThan(900);
    const mps = groundWindMetresPerSecond(model.sideM, 20);
    warmGroundWindParticles(particles, field, flat, mps, 5);
    for (let i = 0; i < particles.count; i++) {
      const east = particles.east[i]!;
      const north = particles.north[i]!;
      const screen = particles.screenProject!(east, north, flat());
      if (screen) {
        particles.screenX[i] = screen.x;
        particles.screenY[i] = screen.y;
      }
    }
    const meanLen = groundWindMeanTrailScreenPx(particles, field, flat, particles.screenProject!, mps);
    const meanW = groundWindCoreWidthPx(15);
    const coverage = groundWindEstimatedBlueCoverage(particles.count, meanLen, meanW, viewW, viewH);
    expect(coverage).toBeGreaterThanOrEqual(0.02);
    expect(coverage).toBeLessThanOrEqual(0.1);
  }, 20_000);

  it("keeps ground-normalised west density at least 60% of east in the ground band", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.12 });
    const viewW = 1440;
    const viewH = 900;
    const particles = createGroundWindParticles(field, flat, 13, undefined, 3200, model);
    bindOrthographicScreen(particles, model, viewW, viewH);
    layoutGroundWindScreenSeeds(particles, field, flat, model, 13);
    warmGroundWindParticles(particles, field, flat, groundWindMetresPerSecond(model.sideM, 20), 4.5);
    for (let i = 0; i < particles.count; i++) {
      const east = particles.east[i]!;
      const north = particles.north[i]!;
      const screen = particles.screenProject!(east, north, flat());
      if (screen) {
        particles.screenX[i] = screen.x;
        particles.screenY[i] = screen.y;
      }
    }
    const { ratio } = groundWindGroundNormalizedBalance(particles.screenX, particles.screenY, particles.count, viewW);
    expect(ratio).toBeGreaterThanOrEqual(0.6);
  }, 20_000);
});
