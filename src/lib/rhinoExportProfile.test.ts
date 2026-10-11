import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { cityModelTo3dm } from "./rhinoExport";
import type { CityModel, Pt } from "../types";

const profile = process.env.CITYCUT_PROFILE_RHINO === "1";

function denseKmModel(): CityModel {
  const sideM = 1000;
  const buildings = [];
  for (let i = 0; i < 800; i++) {
    const x = (i % 40) * 22 - 440;
    const y = Math.floor(i / 40) * 22 - 440;
    buildings.push({
      id: i + 1,
      ring: [
        [x, y],
        [x + 18, y],
        [x + 18, y + 18],
        [x, y + 18],
        [x, y],
      ] as Pt[],
      holes: [],
      height: 8 + (i % 7) * 3,
      use: "residential" as const,
      source: "none" as const,
    });
  }
  const trees = [];
  for (let i = 0; i < 1200; i++) {
    trees.push({
      id: i + 1,
      at: [(i % 50) * 18 - 450, Math.floor(i / 50) * 18 - 450] as Pt,
      height_m: 10,
      crown_diameter_m: 6,
      trunk_diameter_m: 0.4,
      sizeSource: "osm" as const,
    });
  }
  return {
    placeLabel: "Profile cut",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings,
    roads: [{ id: 9001, line: [[-500, 0], [500, 0]], width: 8, kind: "road" }],
    areas: [],
    trees,
    roadKm: 1,
    buildingCapHit: false,
    sourceNote: "profile",
  };
}

describe.skipIf(!profile)("rhino export profile", () => {
  it(
    "times a dense 1 km cut",
    async () => {
      const model = denseKmModel();
      const t0 = performance.now();
      const bytes = await cityModelTo3dm(model);
      const ms = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          sideM: model.sideM,
          buildingCount: model.buildings.length,
          treeCount: model.trees.length,
          ms: Math.round(ms),
          mb: Math.round((bytes.byteLength / (1024 * 1024)) * 10) / 10,
        }),
      );
      expect(bytes.byteLength).toBeGreaterThan(1000);
    },
    120_000,
  );
});
