import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import { addBuildingEdges } from "./buildingEdges";
import { buildingIdFromIntersection } from "./buildingPick";
import {
  SELECTED_BUILDING_FILL_OPACITY,
  mountSelectedBuildingVisual,
  selectedBuildingOpacityAfterPick,
} from "./buildingSelectionVisual";

const colourMode = { colourByUse: false, uniformBuildings: true, colourBySource: false };

const model = {
  placeLabel: "Test",
  center: { lat: -37.81, lon: 145.1 },
  sideM: 400,
  roadKm: 0,
  buildingCapHit: false,
  buildings: [
    {
      id: 1,
      ring: [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
        [0, 0],
      ] as [number, number][],
      holes: [],
      height: 10,
      use: "residential" as const,
      source: "osm_tag" as const,
    },
    {
      id: 2,
      ring: [
        [40, 0],
        [70, 0],
        [70, 30],
        [40, 30],
        [40, 0],
      ] as [number, number][],
      holes: [],
      height: 12,
      use: "commercial" as const,
      source: "osm_tag" as const,
    },
  ],
  roads: [],
  areas: [],
  trees: [],
  layers: { buildings: true, roads: true, waterGreen: true, trees: false },
  sourceNote: "test",
};

function mergedBuildingMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.buildingIdByGroup) found = mesh;
  });
  return found;
}

describe("buildingSelectionVisual", () => {
  it("gives 0.5 overlay opacity after a 3D pick and restores the mesh on deselect", () => {
    const city = buildCityGroup(model, { uniformBuildings: true });
    addBuildingEdges(city);
    const merged = mergedBuildingMesh(city);
    expect(merged).not.toBeNull();

    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(55, 80, 15), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(city, true);
    const buildingId = hits.map(buildingIdFromIntersection).find((id) => id != null) ?? 2;
    expect(buildingId).toBe(2);

    const opacity = selectedBuildingOpacityAfterPick(city, model, buildingId, colourMode);
    expect(opacity).toBeCloseTo(SELECTED_BUILDING_FILL_OPACITY, 2);

    const groups = merged!.geometry.groups;
    const byGroup = merged!.userData.buildingIdByGroup as number[];
    for (let index = 0; index < groups.length; index++) {
      if (byGroup[index] === buildingId) expect(groups[index]!.count).toBeGreaterThan(0);
    }
    expect(merged!.visible).toBe(true);

    disposeObject(city);
  });

  it("zeroes merged geometry groups while selected and restores on deselect", () => {
    const city = buildCityGroup(model, { uniformBuildings: true });
    addBuildingEdges(city);
    const mounted = mountSelectedBuildingVisual(city, model, 2, colourMode);
    expect(mounted).not.toBeNull();
    expect(mounted!.overlayOpacity).toBeCloseTo(0.5, 2);

    const merged = mergedBuildingMesh(city)!;
    const byGroup = merged.userData.buildingIdByGroup as number[];
    for (let index = 0; index < merged.geometry.groups.length; index++) {
      if (byGroup[index] === 2) expect(merged.geometry.groups[index]!.count).toBe(0);
    }

    mounted!.restore();
    for (let index = 0; index < merged.geometry.groups.length; index++) {
      if (byGroup[index] === 2) expect(merged.geometry.groups[index]!.count).toBeGreaterThan(0);
    }
    disposeObject(city);
  });
});
