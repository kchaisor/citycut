import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import { applyUniformRoadTint, uniformRoadColor } from "./uniformViewport";

describe("uniform road colour", () => {
  it("uses rgb(85, 85, 85) for Uniform view roads", () => {
    expect(uniformRoadColor().toLowerCase()).toBe("#555555");
    expect(getColour("--uniform-road").toLowerCase()).toBe("#555555");
  });

  it("tints 3D road meshes when Uniform is on", () => {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#ffffff" }),
    );
    road.name = "Roads";
    road.userData.roadGrade = "local";
    (road.material as THREE.MeshStandardMaterial).userData.primaryRestHex = "#ffffff";
    const root = new THREE.Group();
    root.add(road);
    applyUniformRoadTint(root, true);
    const mat = road.material as THREE.MeshStandardMaterial;
    expect(`#${mat.color.getHexString()}`.toLowerCase()).toBe("#555555");
    applyUniformRoadTint(root, false);
    expect(`#${mat.color.getHexString()}`.toLowerCase()).toBe("#ffffff");
  });
});
