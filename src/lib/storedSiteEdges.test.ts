import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { matteStandardMaterial } from "./matteMaterial";
import { addStoredSiteEdges, STORED_SITE_MIN_EDGE_M } from "./storedSiteEdges";

function boxMesh(sx: number, sy: number, sz: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  const material = matteStandardMaterial({ color: "#ffffff" });
  material.flatShading = true;
  return new THREE.Mesh(geometry, material);
}

describe("stored site outlines", () => {
  it("skips mostly horizontal ground faces", () => {
    const group = new THREE.Group();
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    groundGeo.rotateX(-Math.PI / 2);
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, matteStandardMaterial({ color: "#ffffff" }));
    ground.name = "Buildings-stored-mesh";
    group.add(ground);
    const stats = addStoredSiteEdges(group);
    expect(stats.segments).toBe(0);
    expect(group.getObjectByName("StoredSiteEdges")).toBeUndefined();
  });

  it("draws vertical feature edges above the minimum edge length", () => {
    const group = new THREE.Group();
    const tower = boxMesh(12, 30, 8);
    tower.name = "Buildings-stored-mesh";
    group.add(tower);
    const stats = addStoredSiteEdges(group);
    expect(stats.segments).toBeGreaterThan(0);
    const edges = group.getObjectByName("StoredSiteEdges") as THREE.LineSegments;
    const position = edges.geometry.getAttribute("position");
    let maxLen = 0;
    for (let i = 0; i < position.count; i += 2) {
      const len = Math.hypot(
        position.getX(i + 1) - position.getX(i),
        position.getY(i + 1) - position.getY(i),
        position.getZ(i + 1) - position.getZ(i),
      );
      if (len > maxLen) maxLen = len;
    }
    expect(maxLen).toBeGreaterThanOrEqual(STORED_SITE_MIN_EDGE_M);
  });
});