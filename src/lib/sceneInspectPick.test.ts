import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { TreeFeat } from "../types";
import {
  INSPECT_ADDITIVE_CLICK_MAX_PX,
  INSPECT_CLICK_MAX_PX,
  INSPECT_NEAR_MISS_PX,
  inspectNearMissOffsets,
  isInspectClick,
  nearestTreeIdAt,
  pickSceneSelectionFromHits,
  sceneSelectionBuildingId,
  type SceneSelection,
} from "./sceneInspectPick";

const tree = (id: number, east: number, north: number): TreeFeat => ({
  id,
  at: [east, north],
  height_m: 10,
  crown_diameter_m: 4,
  trunk_diameter_m: 0.4,
  sizeSource: "default",
});

function buildingHit(buildingId: number): THREE.Intersection {
  const mesh = new THREE.Mesh();
  mesh.userData.buildingId = buildingId;
  return {
    distance: 1,
    point: new THREE.Vector3(10, 5, -20),
    object: mesh,
  } as THREE.Intersection;
}

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

  it("replaces building A with building B when picking again without closing", () => {
    const context = { trees: [] as TreeFeat[], sideM: 400 };
    const first = pickSceneSelectionFromHits([buildingHit(7)], context, 100, 200, false);
    const second = pickSceneSelectionFromHits([buildingHit(9)], context, 320, 410, false);
    expect(first).toMatchObject({ kind: "building", buildingId: 7, clientX: 100, clientY: 200 });
    expect(second).toMatchObject({ kind: "building", buildingId: 9, clientX: 320, clientY: 410 });
    expect(first?.kind).toBe("building");
    expect(second?.kind).toBe("building");
    if (first?.kind === "building" && second?.kind === "building") {
      expect(second.buildingId).not.toBe(first.buildingId);
    }
  });

  it("marks a Shift pick as additive so more than one building stays selected", () => {
    const context = { trees: [] as TreeFeat[], sideM: 400 };
    const added = pickSceneSelectionFromHits([buildingHit(9)], context, 320, 410, true);
    expect(added).toMatchObject({ kind: "building", buildingId: 9, additive: true });
    const replaced = pickSceneSelectionFromHits([buildingHit(9)], context, 320, 410, false);
    expect(replaced).toMatchObject({ kind: "building", buildingId: 9, additive: false });
  });

  it("treats a Shift-click with about 10 px of jitter as a click", () => {
    expect(isInspectClick(10, true)).toBe(true);
    expect(isInspectClick(INSPECT_ADDITIVE_CLICK_MAX_PX, true)).toBe(true);
  });

  it("treats a 10 to 14 px move without Shift as a click", () => {
    expect(isInspectClick(10, false)).toBe(true);
    expect(isInspectClick(INSPECT_CLICK_MAX_PX, false)).toBe(true);
    expect(isInspectClick(0, false)).toBe(true);
  });

  it("ignores a plain drag past the cap", () => {
    expect(isInspectClick(INSPECT_CLICK_MAX_PX + 1, false)).toBe(false);
    expect(isInspectClick(40, false)).toBe(false);
  });

  it("ignores a Shift drag well above the jitter cap", () => {
    expect(isInspectClick(INSPECT_ADDITIVE_CLICK_MAX_PX + 1, true)).toBe(false);
    expect(isInspectClick(40, true)).toBe(false);
  });

  it("uses the same 14 px cap with and without Shift", () => {
    expect(INSPECT_CLICK_MAX_PX).toBe(14);
    expect(INSPECT_ADDITIVE_CLICK_MAX_PX).toBe(14);
  });

  it("retries a near miss on two rings no further than 8 px out", () => {
    const offsets = inspectNearMissOffsets();
    expect(INSPECT_NEAR_MISS_PX).toBe(8);
    expect(offsets).toHaveLength(16);
    const distances = offsets.map(([x, y]) => Math.hypot(x, y));
    expect(Math.max(...distances)).toBeCloseTo(8);
    expect(distances.slice(0, 8).every((distance) => Math.abs(distance - 4) < 1e-9)).toBe(true);
  });
});
