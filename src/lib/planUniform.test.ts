import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import { planPaths } from "./svgPlan";
import { sitePlanChunks } from "./aiPlan";
import { cityModelTo3dm } from "./rhinoExport";
import { model as baseAiModel } from "./aiExport.test";
import type { BuildingFeat, BuildingUse, CityModel, Pt } from "../types";

function squareBuilding(id: number): BuildingFeat {
  return {
    id,
    ring: [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ],
    holes: [],
    height: 12,
    use: "retail",
    source: "osm_tag",
  };
}

const baseModel = (): CityModel => ({
  ...baseAiModel(),
  sideM: 200,
  buildings: [squareBuilding(1)],
  siteBuildingIds: [2],
  siteBoundaryLines: [
    [
      [-50, -50],
      [50, -50],
    ] as Pt[],
  ],
});

describe("uniform white on plan and exports", () => {
  it("uses uniform fill on the SVG plan while site yellow wins", () => {
    const model = {
      ...baseModel(),
      buildings: [squareBuilding(1), { ...squareBuilding(2), use: "civic" as BuildingUse }],
    };
    const plan = planPaths(model, undefined, undefined, 1000, undefined, undefined, {
      buildingColour: { colourByUse: false, uniformBuildings: true, colourBySource: false },
      highlightManual: false,
    });
    const site = plan.buildings.find((b) => b.site);
    const other = plan.buildings.find((b) => !b.site);
    expect(site?.fill.toUpperCase()).toBe(getColour("--site-building").toUpperCase());
    expect(other?.fill.toUpperCase()).toBe("#FFFFFF");
  });

  it("includes building outline pens in uniform mode for site plan PDF chunks", () => {
    const chunks = sitePlanChunks(baseModel(), 1000, undefined, { uniformBuildings: true });
    const buildings = chunks.find((chunk) => chunk.name === "Buildings");
    expect(buildings?.paths?.[0]?.strokeMm).toBeGreaterThan(0);
  });

  it("exports Rhino with a single Buildings layer when uniform is on", async () => {
    const bytes = await cityModelTo3dm(baseModel(), { uniformBuildings: true });
    expect(bytes.length).toBeGreaterThan(500);
  });
});
