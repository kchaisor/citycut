import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { buildCityGroup, disposeObject } from "./buildCity";
import { addBuildingEdges } from "./buildingEdges";
import { buildingIdFromIntersection } from "./buildingPick";
import {
  mountSelectedBuildingVisual,
  mountSelectedBuildingsVisual,
  selectedBuildingHasOutlineAfterPick,
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
  it("mounts dashed screen-space outlines after a 3D pick without hiding the building mesh", () => {
    const city = buildCityGroup(model, { uniformBuildings: true });
    addBuildingEdges(city);
    const merged = mergedBuildingMesh(city);
    expect(merged).not.toBeNull();

    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(55, 80, 15), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(city, true);
    const buildingId = hits.map(buildingIdFromIntersection).find((id) => id != null) ?? 2;
    expect(buildingId).toBe(2);

    expect(selectedBuildingHasOutlineAfterPick(city, model, buildingId, colourMode)).toBe(true);

    const groups = merged!.geometry.groups;
    const byGroup = merged!.userData.buildingIdByGroup as number[];
    for (let index = 0; index < groups.length; index++) {
      if (byGroup[index] === buildingId) expect(groups[index]!.count).toBeGreaterThan(0);
    }
    expect(merged!.visible).toBe(true);

    disposeObject(city);
  });

  it("keeps merged geometry groups intact while selected and restores outline on deselect", () => {
    const city = buildCityGroup(model, { uniformBuildings: true });
    addBuildingEdges(city);
    const mounted = mountSelectedBuildingVisual(city, model, 2, colourMode);
    expect(mounted).not.toBeNull();
    expect(mounted!.audit.hiddenSolidEdgeCount).toBeGreaterThan(0);

    const merged = mergedBuildingMesh(city)!;
    const byGroup = merged.userData.buildingIdByGroup as number[];
    for (let index = 0; index < merged.geometry.groups.length; index++) {
      if (byGroup[index] === 2) expect(merged.geometry.groups[index]!.count).toBeGreaterThan(0);
    }

    const dashed = mounted!.overlay.children.filter(
      (child) => child instanceof LineSegments2 && child.material instanceof LineMaterial,
    );
    expect(dashed.length).toBeGreaterThan(0);
    mounted!.restore();
    disposeObject(city);
  });

  it("mounts dashed outlines for multiple selected buildings", () => {
    const city = buildCityGroup(model, { uniformBuildings: true });
    addBuildingEdges(city);
    const mounted = mountSelectedBuildingsVisual(city, model, [1, 2], colourMode);
    expect(mounted).not.toBeNull();

    const dashedLines = mounted!.overlay.children.filter(
      (child) => child instanceof LineSegments2 && child.material instanceof LineMaterial,
    );
    expect(dashedLines.length).toBeGreaterThan(0);
    expect(
      dashedLines.every((line) => line instanceof LineSegments2 && (line.material as LineMaterial).dashed),
    ).toBe(true);

    mounted!.restore();
    disposeObject(city);
  });
});
