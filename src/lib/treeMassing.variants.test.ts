import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import { buildTreeGroup, countTreeCrownColourVariants } from "./treeMassing";

describe("treeMassing crown variants", () => {
  it("assigns four merged crown colours across many trees", () => {
    const trees = Array.from({ length: 48 }, (_, index) => ({
      id: index + 1,
      at: [(index % 8) * 12, Math.floor(index / 8) * 12] as [number, number],
      height_m: 8,
      crown_diameter_m: 5,
      trunk_diameter_m: 0.4,
      sizeSource: "osm" as const,
    }));
    const model = {
      placeLabel: "Test",
      center: { lat: -37.81, lon: 145.1 },
      sideM: 200,
      roadKm: 0,
      buildingCapHit: false,
      buildings: [],
      roads: [],
      areas: [],
      trees,
      layers: { buildings: true, roads: true, waterGreen: true, trees: true },
      sourceNote: "test",
    };
    const city = buildCityGroup(model, { uniformBuildings: true });
    const treeGroup = buildTreeGroup(trees);
    if (treeGroup) city.add(treeGroup);
    expect(countTreeCrownColourVariants(city)).toBe(4);
    let crownMesh: THREE.Mesh | null = null;
    city.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.name === "TreeCrowns") crownMesh = mesh;
    });
    expect(crownMesh).not.toBeNull();
    const crown = crownMesh!;
    const crownMat = crown.material as THREE.MeshStandardMaterial;
    expect(crownMat.color.getHex()).toBe(0xffffff);
    expect(crownMat.vertexColors).toBe(true);
    expect(crown.geometry.getAttribute("color")).toBeTruthy();
    disposeObject(city);
  });
});
