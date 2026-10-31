import { describe, expect, it } from "vitest";
import { carveNestedBuildings } from "./buildingHeightPipeline";
import { intersectionAreaM2 } from "./comBuildingHeightsMatch";
import { buildingMeshOverlaps, countBuildingMeshesById } from "./layerDuplicateAudit";
import type { BuildingFeat, CityModel, Ring } from "../types";

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
const b = (id: number, ring: Ring, height: number, extra: Partial<BuildingFeat> = {}): BuildingFeat => ({
  id,
  ring,
  holes: [],
  height,
  use: "commercial",
  source: "none",
  ...extra,
});
const model = (buildings: BuildingFeat[]): CityModel => ({
  center: { lat: -37.81, lon: 144.96 },
  sideM: 200,
  buildings,
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "",
  placeLabel: "test",
  layers: { buildings: true, roads: false, waterGreen: false, trees: false },
});

describe("carveNestedBuildings (Overture outline inside another)", () => {
  it("a taller nested building is cut out of its container, so the shared area is drawn once", () => {
    const block = b(1, sq(0, 0, 60, 60), 9);
    const tower = b(2, sq(20, 20, 40, 40), 60);
    const out = carveNestedBuildings([block, tower]);
    expect(out[1]).toBe(tower);
    expect(out[0].height).toBe(9);
    expect(out[0].meshDrawnBy).toBeUndefined();
    for (const part of out[0].extrusionParts ?? []) expect(intersectionAreaM2(part, tower)).toBeLessThan(1e-6);
    expect(buildingMeshOverlaps(out).acrossBuildingPairs).toBe(0);
  });

  it("a nested building with the same CoM mass as its container draws nothing; the container draws it", () => {
    const bands = [
      { ring: sq(0, 0, 60, 60), holes: [sq(20, 20, 40, 40)], height: 25 },
      { ring: sq(20, 20, 40, 40), holes: [], height: 80 },
    ];
    const container = b(1, sq(0, 0, 60, 60), 80, { heightTier: "com", extrusionParts: bands });
    const nested = b(2, sq(20, 20, 40, 40), 80, { heightTier: "com" });
    const before = buildingMeshOverlaps([container, nested]);
    expect(before.acrossBuildingPairs).toBeGreaterThan(0);
    const out = carveNestedBuildings([container, nested]);
    expect(out[0]).toBe(container);
    expect(out[1].meshDrawnBy).toBe(1);
    expect(out[1].height).toBe(80);
    expect(buildingMeshOverlaps(out).acrossBuildingPairs).toBe(0);
    const meshes = countBuildingMeshesById(model(out));
    expect(meshes.get(1)).toBe(2);
    expect(meshes.get(2)).toBeUndefined();
  });

  it("leaves neighbours that only touch along an edge alone", () => {
    const a = b(1, sq(0, 0, 20, 20), 10);
    const c = b(2, sq(19.9, 0, 40, 20), 12);
    const out = carveNestedBuildings([a, c]);
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(c);
  });
});
