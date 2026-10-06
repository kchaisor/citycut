import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { hideBuildingForHeightEdit } from "./buildingHeightEditVisibility";

describe("hideBuildingForHeightEdit", () => {
  it("hides a dedicated mesh and restores it", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = "Buildings::Retail";
    mesh.userData.buildingId = 7;
    root.add(mesh);
    const restore = hideBuildingForHeightEdit(root, 7);
    expect(mesh.visible).toBe(false);
    restore();
    expect(mesh.visible).toBe(true);
  });

  it("zeroes merged geometry groups for one building id", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.clearGroups();
    geometry.addGroup(0, 6, 0);
    geometry.addGroup(6, 6, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.name = "Buildings";
    mesh.userData.buildingIdByGroup = [3, 8];
    const root = new THREE.Group();
    root.add(mesh);
    const restore = hideBuildingForHeightEdit(root, 8);
    expect(geometry.groups[1]!.count).toBe(0);
    restore();
    expect(geometry.groups[1]!.count).toBe(6);
  });
});
