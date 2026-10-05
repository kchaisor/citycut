import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, deckSpanGeometry, disposeObject } from "./buildCity";
import { BRIDGE_DECK_CLEARANCE_M, deckHeightAt } from "./roadDrape";
import { sampleTerrain } from "./terrain";
import type { CityModel, TerrainField } from "../types";

function stepField(): TerrainField {
  return {
    cols: 3,
    rows: 3,
    heights: new Float32Array([0, 0, 10, 0, 0, 10, 0, 0, 10]),
    min: 0,
    max: 10,
    spacingM: 20,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

describe("deck span geometry", () => {
  it("meets ground at the ends and rises by clearance at mid-span", () => {
    const line: [number, number][] = [
      [-40, 0],
      [40, 0],
    ];
    const sample = (east: number) => (east < 0 ? 2 : 6);
    const geometry = deckSpanGeometry(line, 8, sample, 0.2, 200);
    expect(geometry).toBeTruthy();
    const position = geometry!.getAttribute("position");
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < position.count; i++) {
      minY = Math.min(minY, position.getY(i));
      maxY = Math.max(maxY, position.getY(i));
    }
    expect(minY).toBeGreaterThanOrEqual(2);
    expect(maxY).toBeCloseTo(5 + BRIDGE_DECK_CLEARANCE_M + 0.2, 0);
    geometry!.dispose();
  });

  it("matches deckHeightAt at abutment vertices including road width", () => {
    const line: [number, number][] = [
      [-40, 0],
      [40, 0],
    ];
    const sample = (_east: number, north: number) => 12 + north * 0.3;
    const lift = 0.2;
    const geometry = deckSpanGeometry(line, 10, sample, lift, 200);
    expect(geometry).toBeTruthy();
    const position = geometry!.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const east = position.getX(i);
      const north = -position.getZ(i);
      const expected = deckHeightAt(line, sample, east, north) + lift;
      const y = position.getY(i);
      const t = Math.abs(east + 40) / 80;
      if (t < 0.08 || t > 0.92) {
        expect(y).toBeCloseTo(expected, 2);
      }
    }
    geometry!.dispose();
  });
});

describe("buildCityGroup bridge decks", () => {
  it("builds a deck mesh instead of draping an is_bridge span onto a cutting", () => {
    const field = stepField();
    const model: CityModel = {
      placeLabel: "Test",
      center: { lat: -37.8235, lon: 144.988 },
      sideM: 80,
      terrain: field,
      layers: { buildings: false, roads: true, waterGreen: false, trees: false },
      buildings: [],
      areas: [],
      trees: [],
      roadKm: 0.08,
      buildingCapHit: false,
      sourceNote: "test",
      roads: [
        { id: 1, line: [[-30, 0], [30, 0]], width: 8, kind: "road", grade: "arterial", deck: true },
      ],
    };
    const sample = (east: number, north: number) => sampleTerrain(field, east, north, model.sideM);
    const group = buildCityGroup(model);
    try {
      const roads = group.children.filter((child) => child.name === "Roads") as THREE.Mesh[];
      expect(roads.length).toBeGreaterThan(0);
      expect(roads.some((mesh) => mesh.userData.deck === true)).toBe(true);
      const deck = roads.find((mesh) => mesh.userData.deck === true)!;
      const position = deck.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const east = position.getX(i);
        const north = -position.getZ(i);
        const ground = sample(east, north);
        expect(position.getY(i)).toBeGreaterThanOrEqual(ground - 0.05);
      }
      let maxClear = 0;
      for (let i = 0; i < position.count; i++) {
        const east = position.getX(i);
        const north = -position.getZ(i);
        maxClear = Math.max(maxClear, position.getY(i) - sample(east, north));
      }
      expect(maxClear).toBeGreaterThan(2);
    } finally {
      disposeObject(group);
    }
  });
});
