import { beforeEach, describe, expect, it } from "vitest";
import { mgaCrs } from "./crsZone";
import { importMassingFixture, ringArea, towerOutlineCount } from "./massingFixture3dm";
import {
  massingDrawingBuildings,
  massingPlanOutlineSummary,
  massingUpperLevelPlanLines,
} from "./massingFootprint";
import {
  clearPlanShadowCache,
  importedPlanShadowRings,
  planShadowOffset,
  planShadowRings,
} from "./buildingShadows";
import { sampleTerrain } from "./terrain";
import { sunAtMelbourneLocal } from "./solar";
import { sunStudyCasterModel } from "./sunStudyPlan";
import type { BuildingFeat, CityModel, Pt } from "../types";

const origin = { lon: 151.21512, lat: -33.8572 };
const zone = mgaCrs(origin.lon).zone;
const sideM = 600;
const terrainZ = 8;
const flatTerrain = {
  cols: 3,
  rows: 3,
  heights: new Float32Array(9).fill(terrainZ),
  min: terrainZ,
  max: terrainZ,
  spacingM: sideM / 2,
  zoom: 15,
  metresPerPixel: 1,
  source: "test",
};

function cityModel(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Rozelle",
    center: origin,
    sideM,
    terrain: flatTerrain,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

function cotAltitude(
  hour: number,
): number {
  const sample = sunAtMelbourneLocal(origin.lat, origin.lon, 2026, 9, 22, hour, 0);
  expect(sample.aboveHorizon).toBe(true);
  return 1 / Math.tan((sample.altitudeDeg * Math.PI) / 180);
}

function shadowReach(
  model: CityModel,
  hour: number,
  building: BuildingFeat,
): number {
  const input = { lat: origin.lat, lon: origin.lon, year: 2026, month: 9, day: 22, hour, minute: 0 };
  clearPlanShadowCache();
  const rings = planShadowRings({ ...model, buildings: [building] }, input, true);
  const off = planShadowOffset(
    sunAtMelbourneLocal(origin.lat, origin.lon, 2026, 9, 22, hour, 0),
    1,
  )!;
  const u: Pt = [off[0] / Math.hypot(off[0], off[1]), off[1] / Math.hypot(off[0], off[1])];
  const along = (p: Pt) => p[0] * u[0] + p[1] * u[1];
  let far = -Infinity;
  for (const poly of rings) for (const ring of poly) for (const p of ring) far = Math.max(far, along(p));
  const base = Math.max(...building.ring.map(along));
  return far - base;
}

describe("Rozelle campus imported massing", () => {
  beforeEach(() => clearPlanShadowCache());

  it("metre and millimetre fixtures share podium/tower outlines and per-roof shadow casters", async () => {
    const metres = await importMassingFixture("rozelleCampus", origin, zone);
    const millimetres = await importMassingFixture("rozelleCampusMm", origin, zone);
    expect(metres.partTriangleStarts.length).toBeGreaterThanOrEqual(9);
    expect(millimetres.partTriangleStarts.length).toBe(metres.partTriangleStarts.length);
    const metresSummary = massingPlanOutlineSummary(metres, origin, zone);
    expect(metresSummary.podiumRings.length).toBeGreaterThanOrEqual(3);
    expect(metresSummary.towerRings.length).toBeGreaterThanOrEqual(5);
    expect(towerOutlineCount(metres, origin, zone)).toBe(towerOutlineCount(millimetres, origin, zone));
    const groundAt = (e: number, n: number) => sampleTerrain(flatTerrain, e, n, sideM);
    const drawnM = massingDrawingBuildings([metres], origin, zone, groundAt);
    const drawnMm = massingDrawingBuildings([millimetres], origin, zone, groundAt);
    const castersM = drawnM.filter((b) => b.importedMassingShadowCaster);
    const castersMm = drawnMm.filter((b) => b.importedMassingShadowCaster);
    expect(castersM.length).toBeGreaterThanOrEqual(8);
    expect(castersMm.length).toBe(castersM.length);
    const upper = massingUpperLevelPlanLines([metres], origin, zone);
    expect(upper.reduce((n, level) => n + level.lines.length, 0)).toBeGreaterThanOrEqual(5);
    const maxPodium = Math.max(...metresSummary.podiumRings.map((ring) => ringArea(ring)));
    const maxTower = Math.max(...metresSummary.towerRings.map((ring) => ringArea(ring)));
    expect(maxPodium).toBeGreaterThan(maxTower);
  });

  it("equinox 9am: tallest tower shadow length ≈ height / tan(alt); podium much shorter", async () => {
    const item = await importMassingFixture("rozelleCampus", origin, zone);
    const groundAt = (e: number, n: number) => sampleTerrain(flatTerrain, e, n, sideM);
    const buildings = massingDrawingBuildings([item], origin, zone, groundAt);
    const casters = buildings.filter((b) => b.importedMassingShadowCaster);
    const tower = casters.reduce((best, b) => (b.height > best.height ? b : best));
    const podium = casters
      .filter((b) => (b.importedTopZ ?? 0) <= 25)
      .reduce((best, b) => ((b.importedTopZ ?? 0) > (best.importedTopZ ?? 0) ? b : best));
    expect(tower.height).toBeGreaterThan(75);
    expect(podium.height).toBeGreaterThan(8);
    expect(podium.height).toBeLessThan(35);
    expect(tower.height / podium.height).toBeGreaterThan(4);
    const model = cityModel(buildings);
    const cot = cotAltitude(9);
    const towerRatio = shadowReach(model, 9, tower) / tower.height;
    const podiumRatio = shadowReach(model, 9, podium) / podium.height;
    expect(towerRatio).toBeCloseTo(cot, 2);
    expect(podiumRatio).toBeCloseTo(cot, 2);
    expect(shadowReach(model, 9, tower) / shadowReach(model, 9, podium)).toBeGreaterThan(3);
    const importedRings = importedPlanShadowRings(
      model,
      { lat: origin.lat, lon: origin.lon, year: 2026, month: 9, day: 22, hour: 9, minute: 0 },
      true,
    );
    expect(importedRings.length).toBeGreaterThan(0);
  });

  it("equinox 3pm tower shadow is shorter than at 9am", async () => {
    const item = await importMassingFixture("rozelleCampus", origin, zone);
    const groundAt = (e: number, n: number) => sampleTerrain(flatTerrain, e, n, sideM);
    const buildings = massingDrawingBuildings([item], origin, zone, groundAt);
    const casters = buildings.filter((b) => b.importedMassingShadowCaster);
    const tower = casters.reduce((best, b) => (b.height > best.height ? b : best));
    const model = cityModel(buildings);
    const reach9 = shadowReach(model, 9, tower);
    const reach15 = shadowReach(model, 15, tower);
    expect(reach15).toBeGreaterThan(reach9 * 1.12);
    expect(shadowReach(model, 15, tower) / tower.height).toBeCloseTo(cotAltitude(15), 2);
    expect(shadowReach(model, 9, tower) / tower.height).toBeCloseTo(cotAltitude(9), 2);
  });

  it("casts plan-fan shadows when only the visible imported footprint is selected", async () => {
    const item = await importMassingFixture("rozelleCampus", origin, zone);
    const buildings = massingDrawingBuildings([item], origin, zone);
    const display = buildings.find((building) => building.importedMassingSkipShadow);
    expect(display).toBeTruthy();
    const base: CityModel = {
      placeLabel: "Rozelle",
      center: origin,
      sideM,
      layers: { buildings: true, roads: false, waterGreen: false, trees: false },
      buildings,
      roads: [],
      areas: [],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "test",
    };
    clearPlanShadowCache();
    const study = { lat: origin.lat, lon: origin.lon, year: 2026, month: 6, day: 21, hour: 12, minute: 0 };
    const casterModel = sunStudyCasterModel(base, "selected", [display!.id]);
    const selectedCasters = casterModel.buildings.filter((building) => building.importedMassingShadowCaster);
    expect(selectedCasters.length).toBeGreaterThanOrEqual(2);
    expect(selectedCasters.some((building) => (building.importedTopZ ?? 0) <= 30)).toBe(true);
    expect(selectedCasters.some((building) => building.height > 40)).toBe(true);
    const fullCasters = buildings.filter((building) => building.importedMassingShadowCaster);
    const tower = selectedCasters.reduce((best, building) => (building.height > best.height ? building : best));
    expect(fullCasters.some((building) => building.id === tower.id)).toBe(true);
    expect(planShadowRings(casterModel, study, true).length).toBeGreaterThan(0);
  });
});
