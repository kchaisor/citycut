import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import type { AreaFeat, CityModel, Pt, TerrainField } from "../types";

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

function flatTerrain(): TerrainField {
  return {
    cols: 3,
    rows: 3,
    heights: new Float32Array(9).fill(2),
    min: 2,
    max: 2,
    spacingM: 20,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
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

  it("does not polygon-offset draped green over the terrain heightfield", () => {
    const areas: AreaFeat[] = [
      {
        id: 1,
        kind: "green",
        ring: [
          [-40, -40],
          [40, -40],
          [40, 40],
          [-40, 40],
          [-40, -40],
        ],
        holes: [],
      },
    ];
    const model: CityModel = {
      ...modelWithCrossing(),
      areas,
      terrain: flatTerrain(),
      layers: { buildings: false, roads: false, waterGreen: true, trees: false },
    };
    const group = buildCityGroup(model);
    try {
      const green = group.getObjectByName("Green") as THREE.Mesh;
      expect(green).toBeTruthy();
      const material = green.material as THREE.MeshStandardMaterial;
      expect(material.polygonOffset).toBe(false);
    } finally {
      disposeObject(group);
    }
  });
});
