import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import type { CityModel, Pt } from "../types";

function modelWithCrossing(): CityModel {
  const roads = [
    { id: 1, line: [[-40, 0], [40, 0]] as Pt[], width: 10, kind: "road" as const, grade: "local" as const },
    { id: 2, line: [[0, -40], [0, 40]] as Pt[], width: 10, kind: "road" as const, grade: "local" as const },
  ];
  return {
    center: { lat: -37.82, lon: 144.98 },
    sideM: 200,
    placeLabel: "Test",
    buildings: [],
    areas: [],
    roads,
    trees: [],
    roadKm: 0.16,
    buildingCapHit: false,
    sourceNote: "test",
    layers: { buildings: false, roads: true, waterGreen: false, trees: false },
  };
}

describe("buildCity road fills", () => {
  it("merges crossing carriageways into one local mesh", () => {
    const group = buildCityGroup(modelWithCrossing());
    try {
      const local = group.children.find(
        (child) => child.name === "Roads" && (child as THREE.Mesh).isMesh,
      ) as THREE.Mesh | undefined;
      expect(local).toBeTruthy();
      const position = local!.geometry.getAttribute("position");
      expect(position.count).toBeGreaterThan(6);
      let maxY = -Infinity;
      for (let i = 0; i < position.count; i++) maxY = Math.max(maxY, position.getY(i));
      expect(maxY).toBeCloseTo(0.17, 2);
    } finally {
      disposeObject(group);
    }
  });
});
