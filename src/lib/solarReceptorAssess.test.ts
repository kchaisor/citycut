import { beforeEach, describe, expect, it } from "vitest";
import { clearPlanShadowCache } from "./buildingShadows";
import { createMassingBlock } from "./massingBlock";
import { massingBlocksToBuildingFeats } from "./massingBlockPlan";
import { ringFromCorners } from "./solarAccessB43";
import { assessSolarReceptor } from "./solarReceptorAssess";
import type { BuildingFeat, CityModel } from "../types";

const CBD = { lat: -37.8136, lon: 144.9631 };

function box(id: number, east: number, north: number, size: number, height: number): BuildingFeat {
  const half = size / 2;
  return {
    id,
    ring: [
      [east - half, north - half],
      [east + half, north - half],
      [east + half, north + half],
      [east - half, north + half],
      [east - half, north - half],
    ],
    holes: [],
    height,
    use: "unclassified",
    source: "none",
  };
}

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: CBD,
    sideM: 200,
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

describe("solar receptor B4-3 assess", () => {
  beforeEach(() => clearPlanShadowCache());

  it("reports proposal failure when added massing shades a previously compliant yard", () => {
    const drawn = createMassingBlock(
      "cut-test",
      [
        [12, -6],
        [42, -6],
        [42, 8],
        [28, 8],
        [28, 32],
      ],
      { floors: 6, width_m: 14 },
    );
    const proposed = massingBlocksToBuildingFeats([drawn])[0]!;
    const m = model([box(1, -30, 0, 24, 14), proposed]);
    const receptor = {
      id: "yard",
      ring: ringFromCorners([18, -24], [34, -10]),
    };
    const result = assessSolarReceptor(m, receptor, 2026);
    expect(result.existingSunlitM2).toBeGreaterThan(result.proposedSunlitM2 + 4);
    expect(result.existingPass).toBe(true);
    expect(result.proposedPass).toBe(false);
    expect(result.status.kind).toBe("fail-proposal");
  });

  it("leaves a distant yard passing under existing and proposed", () => {
    const drawn = createMassingBlock(
      "cut-test",
      [
        [12, -6],
        [42, -6],
        [42, 8],
        [28, 8],
        [28, 32],
      ],
      { floors: 6, width_m: 14 },
    );
    const proposed = massingBlocksToBuildingFeats([drawn])[0]!;
    const m = model([proposed]);
    const receptor = {
      id: "far",
      ring: ringFromCorners([-45, -45], [-28, -30]),
    };
    const result = assessSolarReceptor(m, receptor, 2026);
    expect(result.existingPass).toBe(true);
    expect(result.proposedPass).toBe(true);
    expect(result.status.kind).toBe("pass");
  });
});
