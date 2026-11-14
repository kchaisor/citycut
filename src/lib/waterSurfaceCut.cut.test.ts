import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Pt } from "../types";
import { cutWaterFromBufferGeometry } from "./waterSurfaceCut";

describe("cutWaterFromBufferGeometry", () => {
  it("removes horizontal triangles whose centroids lie in OSM water", () => {
    const ring: Pt[] = [
      [-40, -40],
      [40, -40],
      [40, 40],
      [-40, 40],
      [-40, -40],
    ];
    const areas = [{ ring, holes: [] as Pt[][] }];
    const positions = new Float32Array([
      -50, 0, 50,
      50, 0, 50,
      50, 0, -50,
      -50, 0, -50,
    ]);
    const indices = [0, 1, 2, 0, 2, 3];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const cut = cutWaterFromBufferGeometry(geometry, areas, { horizontalMinY: 0 });
    expect(cut).toBeNull();
  });

  it("keeps triangles outside the water footprint", () => {
    const ring: Pt[] = [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ];
    const areas = [{ ring, holes: [] as Pt[][] }];
    const positions = new Float32Array([
      -50, 0, 50,
      50, 0, 50,
      50, 0, -50,
      -50, 0, -50,
    ]);
    const indices = [0, 1, 2, 0, 2, 3];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const cut = cutWaterFromBufferGeometry(geometry, areas, { horizontalMinY: 0 });
    expect(cut).not.toBeNull();
    const index = cut!.getIndex();
    expect(index).not.toBeNull();
    expect(index!.count).toBe(6);
  });
});