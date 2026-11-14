import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sampleTerrain } from "./terrain";
import type { CityModel, Pt, TerrainField } from "../types";
import { SURFACE } from "./surfaceLayers";
import {
  buildWaterMeshGeometry,
  clippedWaterRingsFromModel,
  legacyFrameRingEarcutTrisFromModel,
  maxWaterTriangleAspectRatio,
  meshPlanProjectedAreaM2,
  multiPolygonAreaM2,
  planTrisAreaM2,
  planTrisForWaterMesh,
  planWaterAreaM2,
  triangulateWaterMultiPolygon,
  waterFillMultiPolygonFromModel,
} from "./waterMesh3d";
function slopedField(): TerrainField {
  return {
    cols: 5,
    rows: 5,
    heights: new Float32Array(25).fill(3),
    min: 3,
    max: 3,
    spacingM: 40,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

describe("waterMesh3d", () => {
  it("keeps earcut mesh area within 2% of plan water for a frame outer with land holes", () => {
    const half = 500;
    const frame: Pt[] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
      [-half, -half],
    ];
    const land: Pt[] = [
      [-200, -200],
      [200, -200],
      [200, 200],
      [-200, 200],
      [-200, -200],
    ];
    const model: CityModel = {
      placeLabel: "Test",
      center: { lat: -33.87, lon: 151.18 },
      sideM: 1000,
      frameShape: "square",
      layers: { buildings: false, roads: false, waterGreen: true, trees: false },
      buildings: [],
      roads: [],
      areas: [{ id: 1, kind: "water", ring: frame, holes: [land] }],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "",
      terrain: slopedField(),
    };
    const planArea = planWaterAreaM2(model);
    const fillArea = multiPolygonAreaM2(waterFillMultiPolygonFromModel(model));
    expect(Math.abs(fillArea - planArea) / planArea).toBeLessThan(0.02);
    const sample = (east: number, north: number) => sampleTerrain(model.terrain!, east, north, model.sideM);
    const mesh = buildWaterMeshGeometry(model, sample, SURFACE.water.lift, {
      field: model.terrain!,
      sideM: model.sideM,
      frameShape: "square",
    });
    expect(mesh).toBeTruthy();
    const meshArea = meshPlanProjectedAreaM2(mesh!);
    mesh!.dispose();
    expect(Math.abs(meshArea - fillArea) / fillArea).toBeLessThan(0.02);
    const tris = triangulateWaterMultiPolygon(waterFillMultiPolygonFromModel(model));
    expect(maxWaterTriangleAspectRatio(tris)).toBeLessThanOrEqual(1000);
    expect(Math.abs(planTrisAreaM2(tris) - fillArea) / fillArea).toBeLessThan(0.02);
  });

});

describe("rozelle 1 km water mesh", () => {
  const fixturePath = path.join(process.cwd(), "src/lib/__fixtures__/rozelle-1km-water-clipped.json");
  const hasFixture = () => {
    try {
      readFileSync(fixturePath, "utf8");
      return true;
    } catch {
      return false;
    }
  };

  it("matches clipped water polygon area and stays below aspect ratio 1000", () => {
    if (!hasFixture()) return;
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      sideM: number;
      rings: Pt[][][];
    };
    const model: CityModel = {
      placeLabel: "Rozelle NSW",
      center: { lat: -33.8677, lon: 151.1832 },
      sideM: fixture.sideM,
      frameShape: "square",
      layers: { buildings: false, roads: false, waterGreen: true, trees: false },
      buildings: [],
      roads: [],
      areas: fixture.rings.map((rings, index) => ({
        id: 9000 + index,
        kind: "water" as const,
        ring: rings[0]!,
        holes: rings.slice(1),
      })),
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "",
      storedSiteLayer: {
        id: "sydney-rozelle",
        label: "Rozelle",
        sourceCredit: "test",
        zone: 56,
        meshBuildingCount: 1,
        structureCount: 0,
        hiddenOvertureCount: 0,
        meshKeyByBuildingId: {},
        buildingIdByMeshKey: {},
        bridgePlan: null,
        manifest: { origin: { lonLat: [151.1832, -33.8677] } } as never,
      },
      terrain: slopedField(),
    };
    expect(clippedWaterRingsFromModel(model).length).toBe(fixture.rings.length);
    const planArea = planWaterAreaM2(model);
    const fillArea = multiPolygonAreaM2(waterFillMultiPolygonFromModel(model));
    const sample = (east: number, north: number) => sampleTerrain(model.terrain!, east, north, model.sideM);
    const mesh = buildWaterMeshGeometry(model, sample, SURFACE.water.lift, {
      field: model.terrain!,
      sideM: model.sideM,
      frameShape: "square",
    });
    expect(mesh).toBeTruthy();
    const meshArea = meshPlanProjectedAreaM2(mesh!);
    mesh!.dispose();
    expect(Math.abs(meshArea - fillArea) / fillArea).toBeLessThan(0.02);
    expect(Math.abs(fillArea - planArea) / planArea).toBeLessThan(0.02);
    const meshTris = planTrisForWaterMesh(model);
    expect(maxWaterTriangleAspectRatio(meshTris)).toBeLessThanOrEqual(1000);
    expect(Math.abs(planTrisAreaM2(meshTris) - fillArea) / fillArea).toBeLessThan(0.02);
    const legacyTris = legacyFrameRingEarcutTrisFromModel(model);
    expect(maxWaterTriangleAspectRatio(legacyTris)).toBeGreaterThan(1000);
  });
});