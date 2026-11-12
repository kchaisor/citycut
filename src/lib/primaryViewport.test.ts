import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import { applyPrimaryViewportTint, snapshotPrimaryViewportColors } from "./primaryViewport";
import { DEFAULT_VIEW3D_DISPLAY, view3dDisplayForModelOpen } from "./view3dDisplay";

describe("primary viewport", () => {
  it("defaults Primary view on when a model opens", () => {
    const storage = { getItem: () => null, setItem: () => {} };
    expect(view3dDisplayForModelOpen(storage).primaryView).toBe(true);
    expect(DEFAULT_VIEW3D_DISPLAY.primaryView).toBe(true);
  });

  it("tints roads and footpaths with primary tokens", () => {
    const root = new THREE.Group();
    const road = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#cccccc" }));
    road.name = "Roads";
    road.userData.roadGrade = "local";
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#cccccc" }));
    foot.name = "Roads";
    foot.userData.roadGrade = "path";
    root.add(road, foot);
    snapshotPrimaryViewportColors(root, { colourByUse: false, uniformBuildings: true, colourBySource: false });
    applyPrimaryViewportTint(root, true);
    const roadMat = road.material as THREE.MeshStandardMaterial;
    const footMat = foot.material as THREE.MeshStandardMaterial;
    expect(`#${roadMat.color.getHexString()}`.toLowerCase()).toBe(getColour("--primary-road").toLowerCase());
    expect(`#${footMat.color.getHexString()}`.toLowerCase()).toBe(getColour("--primary-footpath").toLowerCase());
  });
});
