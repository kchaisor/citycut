import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CityModel, Pt } from "../types";
import type { Tri } from "./terrainDrape";
import { sampleTerrain } from "./terrain";
import { SURFACE } from "./surfaceLayers";
import {
  multiPolygonAreaM2,
  orientWaterTriUpward,
  planTrisForWaterMesh,
  upwardFacingWaterCoverageRatio,
  upwardFacingWaterTrisAreaM2,
  waterFillMultiPolygonFromModel,
  waterTriNormalY,
} from "./waterMesh3d";

describe("waterMesh3d winding", () => {
  it("flips CCW plan triangles to +Y normals on the draped ground", () => {
    const tri: Tri = [
      [0, 0],
      [0, 40],
      [40, 0],
    ];
    const sample = () => 3;
    const lift = SURFACE.water.lift;
    expect(waterTriNormalY(tri, sample, lift)).toBeLessThan(0);
    expect(waterTriNormalY(orientWaterTriUpward(tri, sample, lift), sample, lift)).toBeGreaterThan(0);
  });

  it("covers at least 98% of the drawing water polygon with upward-facing mesh triangles", () => {
    const fixturePath = path.join(process.cwd(), "src/lib/__fixtures__/rozelle-1km-water-clipped.json");
    let fixture: { sideM: number; rings: Pt[][][] };
    try {
      fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    } catch {
      return;
    }
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
      terrain: {
        cols: 5,
        rows: 5,
        heights: new Float32Array(25).fill(3),
        min: 3,
        max: 5,
        spacingM: 40,
        zoom: 14,
        metresPerPixel: 4,
        source: "Mapterhorn",
      },
    };
    const sample = (e: number, n: number) => sampleTerrain(model.terrain!, e, n, model.sideM);
    const lift = SURFACE.water.lift;
    expect(upwardFacingWaterCoverageRatio(model, sample, lift, true)).toBeGreaterThanOrEqual(0.98);
    const tris = planTrisForWaterMesh(model);
    let backward = 0;
    for (const tri of tris) {
      if (waterTriNormalY(tri, sample, lift) < 0) backward++;
    }
    const repaired = tris.map((tri) => orientWaterTriUpward(tri, sample, lift));
    let repairedBackward = 0;
    for (const tri of repaired) {
      if (waterTriNormalY(tri, sample, lift) < 0) repairedBackward++;
    }
    expect(repairedBackward).toBe(0);
    if (backward > 0) expect(repairedBackward).toBeLessThan(backward);
  });

  it("f1bc327-style alternating flip fails the 98% upward-facing coverage bar", () => {
    const fixturePath = path.join(process.cwd(), "src/lib/__fixtures__/rozelle-1km-water-clipped.json");
    let fixture: { sideM: number; rings: Pt[][][] };
    try {
      fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    } catch {
      return;
    }
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
      terrain: {
        cols: 5,
        rows: 5,
        heights: new Float32Array(25).fill(3),
        min: 3,
        max: 3,
        spacingM: 40,
        zoom: 14,
        metresPerPixel: 4,
        source: "Mapterhorn",
      },
    };
    const sample = (e: number, n: number) => sampleTerrain(model.terrain!, e, n, model.sideM);
    const lift = SURFACE.water.lift;
    const fill = multiPolygonAreaM2(waterFillMultiPolygonFromModel(model));
    const tris = planTrisForWaterMesh(model);
    const sharded = tris.map((tri, index) =>
      index % 2 === 0 ? ([tri[0]!, tri[2]!, tri[1]!] as [Pt, Pt, Pt]) : tri,
    );
    const badCover = upwardFacingWaterTrisAreaM2(sharded, sample, lift, false) / fill;
    expect(badCover).toBeLessThan(0.9);
    expect(upwardFacingWaterCoverageRatio(model, sample, lift, true)).toBeGreaterThanOrEqual(0.98);
  });
});