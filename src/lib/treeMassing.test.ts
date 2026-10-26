import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildTreeGroup, treeCrownSphereLayout } from "./treeMassing";

describe("treeCrownSphereLayout", () => {
  it("uses uniform scale equal to crown diameter", () => {
    const layout = treeCrownSphereLayout(12, 8);
    expect(layout.scale).toBe(8);
    expect(layout.radius).toBe(4);
  });

  it("places the top of the sphere at the tree height when the crown fits", () => {
    const layout = treeCrownSphereLayout(12, 8);
    expect(layout.centerY + layout.radius).toBeCloseTo(12, 6);
  });

  it("clamps the sphere above ground when crown width exceeds height", () => {
    const layout = treeCrownSphereLayout(5, 9);
    expect(layout.centerY - layout.radius).toBeGreaterThanOrEqual(-1e-6);
    expect(layout.centerY).toBe(4.5);
  });

  it("builds opaque 3D tree trunk and crown meshes", () => {
    const group = buildTreeGroup([
      { id: 1, at: [10, 20], height_m: 12, crown_diameter_m: 8, trunk_diameter_m: 0.4, sizeSource: "default" },
    ]);
    expect(group).not.toBeNull();
    expect(group!.children).toHaveLength(2);
    for (const child of group!.children) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.transparent).toBe(false);
      expect(mat.opacity).toBe(1);
      expect(mat.depthWrite).toBe(true);
    }
  });
});
