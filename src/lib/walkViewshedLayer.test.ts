import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { WalkViewshedLayer } from "./walkViewshedLayer";

function visibleMeshes(root: THREE.Object3D): number {
  let n = 0;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if ((o as THREE.Mesh).isMesh) n++;
    o.children.forEach(walk);
  };
  walk(root);
  return n;
}

describe("WalkViewshedLayer", () => {
  const model = { terrain: null, sideM: 1000 };

  it("draws nothing until a path is drawn, so other tabs and exports see an empty layer", () => {
    expect(visibleMeshes(new WalkViewshedLayer(model).root)).toBe(0);
  });

  it("shows clicks and ribbon for a path and is empty again after clearing", () => {
    const layer = new WalkViewshedLayer(model);
    layer.setPath([[0, 0], [30, 0]], [[0, 0], [10, 0], [20, 0], [30, 0]]);
    layer.setWalker([0, 0], 1.6);
    expect(visibleMeshes(layer.root)).toBe(1 + 1 + 3);
    layer.clearAll();
    expect(visibleMeshes(layer.root)).toBe(0);
  });
});
