import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import { applyCanvasRoadTint, snapshotPrimaryViewportColors } from "./primaryViewport";
import { applyWhiteCardGroundTint } from "./whiteCardViewport";

describe("whiteCardViewport", () => {
  it("whitens ground and uses MeshBasic white roads in White Card mode", () => {
    const root = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#cccccc" }));
    ground.name = "Ground";
    const road = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#888888" }));
    road.name = "Roads";
    road.userData.roadGrade = "local";
    root.add(ground, road);
    snapshotPrimaryViewportColors(root, { colourByUse: false, uniformBuildings: true, colourBySource: false });
    applyCanvasRoadTint(root, "white");
    applyWhiteCardGroundTint(root, true);
    if (ground.material instanceof THREE.MeshStandardMaterial) {
      expect(`#${ground.material.color.getHexString()}`.toLowerCase()).toBe(getColour("--primary-surface").toLowerCase());
    }
    if (road.material instanceof THREE.MeshBasicMaterial) {
      expect(`#${road.material.color.getHexString()}`.toLowerCase()).toBe(getColour("--primary-surface").toLowerCase());
    }
    applyWhiteCardGroundTint(root, false);
    applyCanvasRoadTint(root, "off");
    expect(ground.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });
});
