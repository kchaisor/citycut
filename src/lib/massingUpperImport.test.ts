import { describe, expect, it } from "vitest";
import { mgaCrs } from "./crsZone";
import {
  massingDrawingBuildings,
  massingPlanOutlineSummary,
  massingUpperLevelOutlines,
  massingUpperLevelPlanLines,
} from "./massingFootprint";
import { clearPlanShadowCache, importedPlanShadowRings, planShadowRings } from "./buildingShadows";
import { importMassingFixture, ringArea, towerOutlineCount } from "./massingFixture3dm";
import { planPaths } from "./svgPlan";
import type { CityModel } from "../types";

const origin = { lon: 151.21512, lat: -33.8572 };
const zone = mgaCrs(origin.lon).zone;

const kinds = ["separate", "setback", "millimetres", "edgeTower"] as const;

describe("imported Rhino massing upper-level outlines", () => {
  for (const kind of kinds) {
    it(`${kind}: tower-top outlines exist after parseMassing3dm`, async () => {
      const item = await importMassingFixture(kind, origin, zone);
      expect(item.partTriangleStarts.length).toBeGreaterThanOrEqual(2);
      expect(towerOutlineCount(item, origin, zone)).toBeGreaterThanOrEqual(1);
    });
  }

  it("inverted roof winding on edge tower still yields an upper outline", async () => {
    const item = await importMassingFixture("edgeTower", origin, zone);
    expect(towerOutlineCount(item, origin, zone)).toBeGreaterThanOrEqual(1);
  });

  it("Rozelle campus: three podiums and five tower outlines on plan", async () => {
    const item = await importMassingFixture("rozelleCampus", origin, zone);
    const { podiumRings, towerRings } = massingPlanOutlineSummary(item, origin, zone);
    expect(podiumRings.length).toBeGreaterThanOrEqual(3);
    expect(towerRings.length).toBeGreaterThanOrEqual(5);
  });

  it("separate multi-object fixture: podium outline and tower outline both present on plan", async () => {
    const item = await importMassingFixture("separate", origin, zone);
    const { podiumRings, towerRings } = massingPlanOutlineSummary(item, origin, zone);
    expect(podiumRings.length).toBeGreaterThanOrEqual(1);
    expect(towerRings.length).toBeGreaterThanOrEqual(1);
    const podiumArea = Math.max(...podiumRings.map((ring) => ringArea(ring)));
    const widestTower = Math.max(...towerRings.map((ring) => ringArea(ring)));
    expect(podiumArea).toBeGreaterThan(widestTower);
    const buildings = massingDrawingBuildings([item], origin, zone);
    const plan = planPaths({
      placeLabel: "Rozelle",
      center: origin,
      sideM: 400,
      layers: { buildings: true, roads: false, waterGreen: false, trees: false },
      buildings,
      importedMassingUpperLevels: massingUpperLevelPlanLines([item], origin, zone),
      roads: [],
      areas: [],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "test",
    });
    expect(plan.buildings.filter((b) => b.imported).length).toBeGreaterThanOrEqual(1);
    expect(plan.importedUpperLevels.length).toBeGreaterThanOrEqual(1);
    expect(plan.importedUpperLevels.reduce((n, level) => n + level.lines.length, 0)).toBeGreaterThanOrEqual(1);
  });

  it("single-part gable roof yields no upper-level outlines", async () => {
    const item = await importMassingFixture("gableSingle", origin, zone);
    expect(massingUpperLevelOutlines(item, origin, zone)).toEqual([]);
    expect(massingUpperLevelPlanLines([item], origin, zone)).toEqual([]);
  });

  it("podium plus towers fixture still yields tower upper outlines", async () => {
    const item = await importMassingFixture("separate", origin, zone);
    expect(towerOutlineCount(item, origin, zone)).toBeGreaterThanOrEqual(1);
    const upper = massingUpperLevelPlanLines([item], origin, zone);
    expect(upper.reduce((n, level) => n + level.lines.length, 0)).toBeGreaterThanOrEqual(1);
  });

  it("per-roof shadow casters produce imported plan shadows", async () => {
    const item = await importMassingFixture("setback", origin, zone);
    const buildings = massingDrawingBuildings([item], origin, zone);
    const casters = buildings.filter((b) => b.importedMassingShadowCaster);
    expect(casters.length).toBeGreaterThanOrEqual(2);
    const terrainZ = 5;
    const model: CityModel = {
      placeLabel: "Rozelle",
      center: origin,
      sideM: 400,
      terrain: {
        cols: 3,
        rows: 3,
        heights: new Float32Array(9).fill(terrainZ),
        min: terrainZ,
        max: terrainZ,
        spacingM: 200,
        zoom: 15,
        metresPerPixel: 1,
        source: "test",
      },
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
    const rings = planShadowRings(
      model,
      { lat: origin.lat, lon: origin.lon, year: 2026, month: 9, day: 22, hour: 15, minute: 0 },
      true,
    );
    expect(rings.length).toBeGreaterThan(0);
    const importedOnly = importedPlanShadowRings(model, { lat: origin.lat, lon: origin.lon, year: 2026, month: 9, day: 22, hour: 15, minute: 0 }, true);
    expect(importedOnly.length).toBeGreaterThan(0);
  });
});
