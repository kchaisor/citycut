import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, buildHeightEditOverlay, disposeObject } from "./buildCity";

const model = {
  placeLabel: "Test",
  center: { lat: -37.81, lon: 145.1 },
  sideM: 400,
  roadKm: 0,
  buildingCapHit: false,
  buildings: [
    {
      id: 42,
      ring: [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
        [0, 0],
      ] as [number, number][],
      holes: [],
      height: 10,
      use: "residential" as const,
      source: "osm_tag" as const,
    },
  ],
  roads: [],
  areas: [],
  trees: [],
  layers: { buildings: true, roads: true, waterGreen: true, trees: false },
  sourceNote: "test",
};

describe("buildHeightEditOverlay", () => {
  it("adds a semi-transparent overlay that is removed with the group", () => {
    const city = buildCityGroup(model, { uniformBuildings: true });
    const overlay = buildHeightEditOverlay(model, 42, "#888888");
    expect(overlay).not.toBeNull();
    city.add(overlay!);
    const fill = overlay!.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    const mat = fill.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.5, 2);
    expect(overlay!.name).toBe("HeightEditOverlay");
    disposeObject(city);
  });
});
