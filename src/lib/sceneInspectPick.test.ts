import { describe, expect, it } from "vitest";
import type { TreeFeat } from "../types";
import { nearestTreeIdAt, sceneSelectionBuildingId, type SceneSelection } from "./sceneInspectPick";

const tree = (id: number, east: number, north: number): TreeFeat => ({
  id,
  at: [east, north],
  height_m: 10,
  crown_diameter_m: 4,
  trunk_diameter_m: 0.4,
  sizeSource: "default",
});

describe("scene inspect pick helpers", () => {
  it("reads building id from building selections only", () => {
    const building: SceneSelection = {
      kind: "building",
      buildingId: 12,
      clientX: 0,
      clientY: 0,
      world: { east: 1, north: 2, up: 3 },
    };
    expect(sceneSelectionBuildingId(building)).toBe(12);
    expect(sceneSelectionBuildingId({ ...building, kind: "tree", treeId: 1 } as SceneSelection)).toBeNull();
    expect(sceneSelectionBuildingId(null)).toBeNull();
  });

  it("picks the nearest tree within search radius", () => {
    const trees = [tree(1, 0, 0), tree(2, 20, 0)];
    expect(nearestTreeIdAt(1, 0, trees, 8)).toBe(1);
    expect(nearestTreeIdAt(18, 0, trees, 8)).toBe(2);
    expect(nearestTreeIdAt(100, 100, trees, 8)).toBeNull();
  });
});
