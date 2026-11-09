import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { safeMergeGeometries } from "./safeMergeGeometries";

describe("safeMergeGeometries", () => {
  it("returns null for an empty list", () => {
    expect(safeMergeGeometries([])).toBeNull();
  });

  it("merges two boxes without throwing", () => {
    const a = new THREE.BoxGeometry(1, 1, 1);
    const b = new THREE.BoxGeometry(2, 2, 2);
    const merged = safeMergeGeometries([a, b]);
    expect(merged).toBeTruthy();
    expect(merged!.getAttribute("position").count).toBeGreaterThan(0);
    merged?.dispose();
  });
});
