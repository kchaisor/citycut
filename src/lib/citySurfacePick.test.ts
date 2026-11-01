import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { pickCitySurfaceY } from "./citySurfacePick";

describe("pickCitySurfaceY", () => {
  it("returns the Y of the first mesh hit below the sample point", () => {
    const root = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, 82, 0);
    plane.name = "Ground";
    root.add(plane);
    expect(pickCitySurfaceY(root, 0, 0, 200)).toBeCloseTo(82, 2);
  });
});
