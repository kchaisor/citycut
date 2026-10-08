import { describe, expect, it, vi } from "vitest";
import type { BuildingFeat } from "../types";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import { attachFootprintBBox } from "./comBuildingHeightsMatch";
import {
  applyRealSourceUnmatchedTier,
  comAnyOverlapRatio,
  findSilentDefaultViolations,
} from "./buildingHeightSourceTruth";
import { inferHeightTier } from "./buildingHeightResolve";

const center = { lon: 144.98, lat: -37.812 };

function building(id: number, ring: BuildingFeat["ring"], extra: Partial<BuildingFeat> = {}): BuildingFeat {
  return {
    id,
    ring,
    holes: [],
    height: 6,
    heightFromFallback: true,
    use: "civic",
    source: "zone",
    ...extra,
  };
}

describe("buildingHeightSourceTruth", () => {
  it("flags zone default when any CoM overlap is below threshold", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const osm = building(1, [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ]);
    const com = attachFootprintBBox(
      "s1",
      [
        [18, 0],
        [20, 0],
        [20, 20],
        [18, 20],
        [18, 0],
      ],
      [],
      30,
    );
    expect(comAnyOverlapRatio(osm, [com])).toBeGreaterThan(0);
    expect(comAnyOverlapRatio(osm, [com])).toBeLessThan(0.2);
    const out = applyRealSourceUnmatchedTier(osm, center, [com], [], [osm]);
    expect(inferHeightTier(out)).toBe("real_source_unmatched");
    expect(out.zoneDefaultNote).toMatch(/below match threshold/);
  });

  it("guard finds no silent defaults after truth pass", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const osm = building(2, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const com: ComBuildingFootprint = attachFootprintBBox(
      "c",
      [
        [9, 0],
        [10, 0],
        [10, 10],
        [9, 10],
        [9, 0],
      ],
      [],
      24,
    );
    const stamped = applyRealSourceUnmatchedTier(osm, center, [com], [], [osm]);
    const violations = findSilentDefaultViolations([stamped], center, [com], []);
    expect(violations.length).toBe(0);
    expect(inferHeightTier(stamped)).toBe("real_source_unmatched");
  });
});
