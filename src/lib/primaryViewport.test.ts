import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import {
  applyPrimaryViewportTint,
  primaryPlinthReadsOnCanvas,
  primaryRoadReadsOnCanvas,
  snapshotPrimaryViewportColors,
} from "./primaryViewport";
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
    expect(road.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(foot.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(primaryRoadReadsOnCanvas(road.material)).toBe(true);
    if (foot.material instanceof THREE.MeshBasicMaterial) {
      expect(`#${foot.material.color.getHexString()}`.toLowerCase()).toBe(getColour("--primary-footpath").toLowerCase());
    }
    applyPrimaryViewportTint(root, false);
    expect(road.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it("whitens BasePlinth cut faces in Primary view", () => {
    const geometry = new THREE.BufferGeometry();
    const colors = new Float32Array([0.5, 0.5, 0.5, 0.6, 0.6, 0.6]);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const plinth = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, color: "#ffffff" }),
    );
    plinth.name = "BasePlinth";
    const root = new THREE.Group();
    root.add(plinth);
    snapshotPrimaryViewportColors(root, { colourByUse: false, uniformBuildings: true, colourBySource: false });
    applyPrimaryViewportTint(root, true);
    const attr = geometry.getAttribute("color");
    expect(attr.getX(0)).toBeCloseTo(1, 3);
    expect(attr.getY(0)).toBeCloseTo(1, 3);
    expect(attr.getZ(0)).toBeCloseTo(1, 3);
    expect(plinth.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(primaryPlinthReadsOnCanvas(plinth.material)).toBe(true);
    expect(plinth.userData.cannotReceiveAO).toBe(true);
    applyPrimaryViewportTint(root, false);
    expect(plinth.userData.cannotReceiveAO).toBeUndefined();
    expect(plinth.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });
});
