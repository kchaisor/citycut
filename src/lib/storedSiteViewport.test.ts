import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import { matteStandardMaterial } from "./matteMaterial";
import { syncStoredSiteViewport } from "./storedSiteViewport";
import type { BuildingFeat } from "../types";

function meshPart(name: string, buildingId?: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    matteStandardMaterial({ color: getColour("--stored-site-structure") }),
  );
  mesh.name = name;
  if (buildingId != null) mesh.userData.buildingId = buildingId;
  return mesh;
}

describe("stored site viewport tint", () => {
  it("matches Primary building fill for stored mesh buildings and structure", () => {
    const group = new THREE.Group();
    group.add(meshPart("Buildings-stored-mesh", -3_000_001));
    group.add(meshPart("StoredSiteStructure"));
    const buildings: BuildingFeat[] = [
      {
        id: -3_000_001,
        ring: [[0, 0]],
        holes: [],
        height: 10,
        use: "unclassified",
        source: "none",
        storedSiteMesh: true,
      },
    ];
    const colourMode = { colourByUse: false, uniformBuildings: false, colourBySource: false };
    syncStoredSiteViewport(group, buildings, colourMode, true, false, getColour("--building-solar-neutral"));
    const primaryBuilding = getColour("--primary-building").toLowerCase();
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      expect(`#${material.color.getHexString()}`.toLowerCase()).toBe(primaryBuilding);
    });
  });

  it("uses use colours when Primary is off and colour-by-use is on", () => {
    const group = new THREE.Group();
    group.add(meshPart("Buildings-stored-mesh", -3_000_001));
    const buildings: BuildingFeat[] = [
      {
        id: -3_000_001,
        ring: [[0, 0]],
        holes: [],
        height: 10,
        use: "residential",
        source: "none",
        storedSiteMesh: true,
      },
    ];
    const colourMode = { colourByUse: true, uniformBuildings: false, colourBySource: false };
    syncStoredSiteViewport(group, buildings, colourMode, false, false, getColour("--building-solar-neutral"));
    const mesh = group.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.userData.viewportFill).toBe(getColour("--use-residential"));
  });
});