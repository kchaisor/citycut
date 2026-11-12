import { describe, expect, it } from "vitest";
import { gridPointsInRing } from "./solarPlanShadowSteps";
import {
  appendBuildingRoofFootprint,
  buildRoofFootprintMeshesForModel,
  everyBuildingHasRoofFootprint,
  ringCentroid,
} from "./sunHoursRoofFootprint";
import { computeSunHoursGroundGrid } from "./sunHoursGroundPlan";
import { SUN_HOURS_GROUND_CELL_M } from "./sunHoursGround";
import { directSunHoursSamplesForModel } from "./sunHoursDirectSample";
import type { BuildingFeat, CityModel } from "../types";

const at = { lat: -37.8136, lon: 144.9631 };

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: at,
    sideM: 120,
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

function footprintBuilding(id: number, ring: BuildingFeat["ring"], height = 8): BuildingFeat {
  return {
    id,
    ring,
    holes: [],
    height,
    use: "residential",
    source: "none",
  };
}

describe("sunHoursRoofFootprint", () => {
  it("fills every building footprint including lattice-missed skinny fixtures", () => {
    const wide = footprintBuilding(1, [
      [-20, -20],
      [20, -20],
      [20, 20],
      [-20, 20],
      [-20, -20],
    ]);
    const skinny = footprintBuilding(2, [
      [30, 0],
      [31.2, 0],
      [31.2, 8],
      [30, 8],
      [30, 0],
    ]);
    const tiny = footprintBuilding(3, [
      [40, 0],
      [41.2, 0],
      [41.2, 1.2],
      [40, 1.2],
      [40, 0],
    ]);
    const city = model([wide, skinny, tiny]);
    expect(gridPointsInRing(tiny.ring, SUN_HOURS_GROUND_CELL_M).length).toBe(0);
    const samples = directSunHoursSamplesForModel(city);
    const tinyRoofSamples = samples.filter((s) => s.kind === "roof-cell" && s.buildingId === tiny.id);
    expect(tinyRoofSamples.length).toBe(1);
    expect(tinyRoofSamples[0]!.id).toContain("centroid");
    const hours = new Float32Array(samples.length);
    hours.fill(2.5);
    const { buildingTriangles } = buildRoofFootprintMeshesForModel(city, samples, hours, 5);
    expect(everyBuildingHasRoofFootprint(buildingTriangles, city.buildings)).toBe(true);
    for (const building of city.buildings) {
      const roofPositions: number[] = [];
      const roofColors: number[] = [];
      const triangles = appendBuildingRoofFootprint(city, building, samples, hours, 5, roofPositions, roofColors);
      expect(triangles).toBeGreaterThan(0);
      expect(roofPositions.length).toBeGreaterThan(8);
      expect(ringCentroid(building.ring).length).toBe(2);
    }
  });

  it("skips roof meshes for footprints that are not extruded in City", () => {
    const extruded = footprintBuilding(1, [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ]);
    const yardOnly = footprintBuilding(2, [
      [20, -6],
      [32, -6],
      [32, 6],
      [20, 6],
      [20, -6],
    ]);
    yardOnly.height = 0;
    const city = model([extruded, yardOnly]);
    const samples = directSunHoursSamplesForModel(city);
    const hours = new Float32Array(samples.length);
    hours.fill(2);
    const { buildingTriangles } = buildRoofFootprintMeshesForModel(city, samples, hours, 4);
    expect(buildingTriangles.get(extruded.id) ?? 0).toBeGreaterThan(0);
    expect(buildingTriangles.has(yardOnly.id)).toBe(false);
  });

  it("masks ground under extruded footprints while every masked building has roof triangles", () => {
    const building = footprintBuilding(1, [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ]);
    const city = model([building]);
    const grid = computeSunHoursGroundGrid(city, 2026, 6, 21);
    expect(grid).not.toBeNull();
    const samples = directSunHoursSamplesForModel(city);
    const hours = new Float32Array(samples.length);
    hours.fill(1.75);
    const { buildingTriangles, roofPositions } = buildRoofFootprintMeshesForModel(city, samples, hours, 4);
    expect(everyBuildingHasRoofFootprint(buildingTriangles, city.buildings)).toBe(true);
    expect(roofPositions.length).toBeGreaterThan(0);
    const maskedCount = grid!.masked.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    expect(maskedCount).toBeGreaterThan(0);
    for (const feat of city.buildings) {
      expect(buildingTriangles.get(feat.id) ?? 0).toBeGreaterThan(0);
    }
  });
});
