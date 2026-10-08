import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import {
  applyHeightOverrides,
  applyOverrideToBuilding,
  buildingDisplayHeightM,
  removeOverrideForBuilding,
  upsertOverrideForBuilding,
  type HeightOverrideStore,
} from "./heightOverrides";
import { applyComBuildingHeights, attachFootprintBBox } from "./comBuildingHeights";
import { applyDevelopmentFloorsToBuildings } from "./comDevelopmentFloors";
import { inferHeightTier } from "./buildingHeightResolve";
import type { BuildingFeat, CityModel, Ring } from "../types";

const origin = { lon: 144.98, lat: -37.812 };

function square(ring: Ring, height: number, extra: Partial<BuildingFeat> = {}): BuildingFeat {
  return {
    id: 1,
    ring,
    holes: [],
    height,
    use: "commercial",
    source: "osm_tag",
    ...extra,
  };
}

function buildingMeshCount(group: THREE.Group): number {
  let count = 0;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.name.startsWith("Building")) count += 1;
  });
  return count;
}

describe("building height blast radius", () => {
  it("manual override replaces CoM extrusion parts and 3D export uses the edited scalar height", () => {
    const ring: Ring = [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
      [0, 0],
    ];
    const base = square(ring, 6, { heightFromFallback: true });
    const com = applyComBuildingHeights(
      [base],
      [attachFootprintBBox("t", ring, [], 24)],
    ).buildings[0]!;
    expect(com.height).toBe(24);
    expect(inferHeightTier(com)).toBe("com");
    const manual = applyOverrideToBuilding(com, 18);
    expect(manual.extrusionParts).toBeUndefined();
    expect(manual.heightManual).toBe(true);
    expect(inferHeightTier(manual)).toBe("manual");

    const model: CityModel = {
      placeLabel: "Test",
      center: origin,
      sideM: 200,
      layers: { buildings: true, roads: false, waterGreen: false, trees: false },
      buildings: [manual],
      roads: [],
      areas: [],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "",
    };
    const group = buildCityGroup(model);
    expect(buildingMeshCount(group)).toBe(1);
    disposeObject(group);
    expect(buildingDisplayHeightM(manual)).toBe(18);
    expect(manual.extrusionParts).toBeUndefined();
  });

  it("reset via removeOverrideForBuilding restores the model height before the edit", () => {
    const building = square(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      12,
    );
    const store: HeightOverrideStore = { v: 1, overrides: [] };
    const editedStore = upsertOverrideForBuilding(store, building, origin, 40);
    const applied = applyHeightOverrides([building], editedStore, origin).buildings[0]!;
    expect(applied.height).toBe(40);
    const cleared = removeOverrideForBuilding(editedStore, applied, origin);
    const restored = applyHeightOverrides([building], cleared, origin).buildings[0]!;
    expect(restored.height).toBe(12);
    expect(restored.heightManual).toBeUndefined();
  });

  it("DAM floors skip buildings that already have CoM height", () => {
    const ring: Ring = [
      [0, 0],
      [30, 0],
      [30, 30],
      [0, 30],
      [0, 0],
    ];
    const zoned = square(ring, 6, { heightFromFallback: true, id: 99 });
    const withCom = applyComBuildingHeights(
      [zoned],
      [attachFootprintBBox("h", ring, [], 22)],
    ).buildings[0]!;
    const afterDam = applyDevelopmentFloorsToBuildings(
      [withCom],
      origin,
      [{ lon: origin.lon, lat: origin.lat, floorsAbove: 9 }],
    )[0]!;
    expect(inferHeightTier(afterDam)).toBe("com");
    expect(afterDam.height).toBe(22);
  });
});
