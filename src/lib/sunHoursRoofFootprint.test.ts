import { describe, expect, it } from "vitest";
import { gridPointsInRing } from "./solarPlanShadowSteps";
import * as THREE from "three";
import dandenongFixture from "./fixtures/dandenong-cleeland-ground.json";
import realTerrain from "./__fixtures__/dandenongTerrain.json";
import { extrudePart } from "./buildCity";
import { openRing } from "./geo";
import { SURFACE } from "./surfaceLayers";
import { footprintBase } from "./terrain";
import {
  appendBuildingRoofFootprint,
  buildRoofFootprintMeshesForModel,
  everyBuildingHasRoofFootprint,
  ringCentroid,
} from "./sunHoursRoofFootprint";
import { computeSunHoursGroundGrid } from "./sunHoursGroundPlan";
import { SUN_HOURS_GROUND_CELL_M } from "./sunHoursGround";
import { directSunHoursSamplesForModel } from "./sunHoursDirectSample";
import { sunHoursDirectRgb } from "./sunHoursGround";
import type { BuildingFeat, CityModel, Ring, TerrainField } from "../types";

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

  it("lifts the roof overlay clear of the extruded roof on small, large, stepped and terrain buildings", () => {
    const small = footprintBuilding(1, rect(-30, -30, 8, 10), 7);
    const large = footprintBuilding(2, rect(-10, -50, 180, 120), 9);
    const stepped = footprintBuilding(3, rect(30, 30, 20, 20), 30);
    stepped.extrusionParts = [
      { ring: rect(30, 30, 20, 20), holes: [], height: 6 },
      { ring: rect(34, 34, 10, 10), holes: [], height: 24, base: 6 },
    ];
    const terrain: TerrainField = {
      ...(realTerrain as Omit<TerrainField, "heights">),
      heights: new Float32Array(realTerrain.heights),
    };
    for (const city of [model([small, large, stepped]), { ...model([small, large, stepped]), sideM: 1000, terrain }]) {
      const samples = directSunHoursSamplesForModel(city);
      const hours = new Float32Array(samples.length).fill(3);
      for (const building of city.buildings) {
        const roofPositions: number[] = [];
        appendBuildingRoofFootprint(city, building, samples, hours, 6, roofPositions, []);
        const parts = building.extrusionParts ?? [{ ring: building.ring, holes: building.holes, height: building.height }];
        const base = (city.terrain ? footprintBase(city.terrain, building.ring, city.sideM) : 0) + SURFACE.building.lift;
        const roofTops = parts.map((part) => {
          const geometry = extrudePart(part.ring, part.holes, part.height, base + (part.base ?? 0))!;
          geometry.computeBoundingBox();
          return geometry.boundingBox!.max.y;
        });
        const overlayYs = new Set<number>();
        for (let index = 1; index < roofPositions.length; index += 3) overlayYs.add(roofPositions[index]!);
        expect(overlayYs.size).toBe(parts.length);
        const sortedOverlay = [...overlayYs].sort((a, b) => a - b);
        const sortedTops = [...roofTops].sort((a, b) => a - b);
        sortedTops.forEach((top, index) => {
          expect(sortedOverlay[index]! - top).toBeGreaterThanOrEqual(0.1);
          expect(sortedOverlay[index]! - top).toBeLessThan(0.3);
        });
      }
    }
  });

  it("covers a large rectangular roof completely, in the 0-hour colour when samples are missing", () => {
    const large = footprintBuilding(7, rect(-10, -50, 180, 120), 9);
    const city = model([large]);
    for (const samples of [directSunHoursSamplesForModel(city), []]) {
      const hours = new Float32Array(samples.length).fill(4);
      const roofPositions: number[] = [];
      const roofColors: number[] = [];
      appendBuildingRoofFootprint(city, large, samples, hours, 6, roofPositions, roofColors);
      expect(overlayPlanArea(roofPositions)).toBeCloseTo(ringArea(large.ring), 3);
      if (samples.length === 0) {
        const zero = sunHoursDirectRgb(0, 6);
        for (let index = 0; index < roofColors.length; index += 3) {
          expect(roofColors.slice(index, index + 3)).toEqual(zero);
        }
      }
    }
  });

  it("covers every large Dandenong roof with no missing chunk", () => {
    const city = dandenongFixture as unknown as CityModel;
    const big = city.buildings.filter((building) => ringArea(building.ring) > 1000);
    expect(big.length).toBeGreaterThan(5);
    const samples = directSunHoursSamplesForModel({ ...city, buildings: big });
    const hours = new Float32Array(samples.length).fill(3);
    for (const building of big) {
      const roofPositions: number[] = [];
      appendBuildingRoofFootprint(city, building, samples, hours, 6, roofPositions, []);
      expect(overlayPlanArea(roofPositions) / ringArea(building.ring)).toBeCloseTo(1, 3);
    }
  });
});

function rect(east: number, north: number, width: number, depth: number): Ring {
  return [
    [east, north],
    [east + width, north],
    [east + width, north + depth],
    [east, north + depth],
    [east, north],
  ];
}

function ringArea(ring: Ring): number {
  const open = openRing(ring);
  let twice = 0;
  for (let index = 0; index < open.length; index++) {
    const [ae, an] = open[index]!;
    const [be, bn] = open[(index + 1) % open.length]!;
    twice += ae * bn - be * an;
  }
  return Math.abs(twice) / 2;
}

function overlayPlanArea(positions: number[]): number {
  let area = 0;
  for (let index = 0; index < positions.length; index += 9) {
    const a = new THREE.Vector2(positions[index]!, positions[index + 2]!);
    const b = new THREE.Vector2(positions[index + 3]!, positions[index + 5]!);
    const c = new THREE.Vector2(positions[index + 6]!, positions[index + 8]!);
    area += Math.abs(b.clone().sub(a).cross(c.clone().sub(a))) / 2;
  }
  return area;
}
