import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildTreeGroup, countTreeCrowns, treeCrownSphereLayout } from "./treeMassing";

describe("treeCrownSphereLayout & buildTreeGroup", () => {
  it("computes independent horizontal (X/Z = crown_diameter_m) and vertical (Y = 0.72 * height_m) ellipsoid scales", () => {
    const layout = treeCrownSphereLayout(12, 8);
    expect(layout.scaleX).toBe(8);
    expect(layout.scaleZ).toBe(8);
    expect(layout.scaleY).toBeCloseTo(12 * 0.72, 6);
    expect(layout.radiusX).toBe(4);
    expect(layout.radiusY).toBeCloseTo(12 * 0.36, 6);
  });

  it("places the top of the ellipsoid crown at the tree height and leaves ~28% clear trunk below", () => {
    const layout = treeCrownSphereLayout(12, 8);
    expect(layout.centerY + layout.radiusY).toBeCloseTo(12, 6);
    expect(layout.centerY - layout.radiusY).toBeCloseTo(12 * 0.28, 6);
  });

  it("clamps the crown above ground when minimum vertical crown height exceeds nominal tree height", () => {
    const layout = treeCrownSphereLayout(1, 9);
    expect(layout.centerY - layout.radiusY).toBeGreaterThanOrEqual(-1e-6);
    expect(layout.centerY).toBeCloseTo(0.6, 6);
  });

  it("builds 80-triangle (240 non-indexed vertices) geodesic icosahedron crowns with opaque flat-shaded material", () => {
    const group = buildTreeGroup([
      { id: 1, at: [10, 20], height_m: 12, crown_diameter_m: 8, trunk_diameter_m: 0.4, sizeSource: "default" },
    ]);
    expect(group).not.toBeNull();
    expect(group!.children).toHaveLength(2);
    expect(countTreeCrowns(group!)).toBe(1);

    const trunkMesh = group!.children[0] as THREE.Mesh;
    const crownMesh = group!.children[1] as THREE.Mesh;
    const crownPos = crownMesh.geometry.getAttribute("position");
    expect(crownPos.count).toBe(240);

    for (const mesh of [trunkMesh, crownMesh]) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.transparent).toBe(false);
      expect(mat.opacity).toBe(1);
      expect(mat.depthWrite).toBe(true);
    }
    const crownMat = crownMesh.material as THREE.MeshStandardMaterial;
    expect(crownMat.flatShading).toBe(true);
  });

  it("scales tall narrow vs wide spreading trees into distinct ellipsoid proportions", () => {
    const tallGroup = buildTreeGroup([
      { id: 1, at: [0, 0], height_m: 20, crown_diameter_m: 6, trunk_diameter_m: 0.4, sizeSource: "osm" },
    ])!;
    const tallCrown = tallGroup.children[1] as THREE.Mesh;
    tallCrown.geometry.computeBoundingBox();
    const tallBox = tallCrown.geometry.boundingBox!;
    expect(tallBox.max.x - tallBox.min.x).toBeCloseTo(6, 1);
    expect(tallBox.max.z - tallBox.min.z).toBeCloseTo(6, 1);
    expect(tallBox.max.y - tallBox.min.y).toBeCloseTo(14.4, 1);
    expect(tallBox.max.y).toBeCloseTo(20, 1);

    const wideGroup = buildTreeGroup([
      { id: 2, at: [0, 0], height_m: 10, crown_diameter_m: 14, trunk_diameter_m: 0.5, sizeSource: "osm" },
    ])!;
    const wideCrown = wideGroup.children[1] as THREE.Mesh;
    wideCrown.geometry.computeBoundingBox();
    const wideBox = wideCrown.geometry.boundingBox!;
    expect(wideBox.max.x - wideBox.min.x).toBeCloseTo(14, 1);
    expect(wideBox.max.z - wideBox.min.z).toBeCloseTo(14, 1);
    expect(wideBox.max.y - wideBox.min.y).toBeCloseTo(7.2, 1);
    expect(wideBox.max.y).toBeCloseTo(10, 1);
  });
});
