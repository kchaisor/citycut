import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import {
  HILLSHADE_MAX,
  HILLSHADE_MIN,
  groundHillshadeOn,
  hillshadeGrid,
  hillshadeTexture,
  sampleHillshade,
  setGroundHillshade,
  shadeRgb,
} from "./hillshade";
import { QA_TERRAIN_SOURCE, qaTerrainFromSearch } from "./qaTerrain";
import { fetchTerrainForCut } from "./fetchTerrain";
import { terrainBuffers, terrainTint } from "./terrain";
import type { CityModel, TerrainField } from "../types";

const rozelle = { lat: -33.867518, lon: 151.18298 };

function field(cols: number, rows: number, height: (col: number, row: number) => number, spacingM = 4): TerrainField {
  const heights = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) heights[row * cols + col] = height(col, row);
  }
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { cols, rows, heights, min, max, spacingM, zoom: 14, metresPerPixel: 4, source: "test" };
}

function model(terrain: TerrainField, sideM: number): CityModel {
  return {
    center: rozelle,
    sideM,
    placeLabel: "Test",
    buildings: [],
    areas: [],
    roads: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
    terrain,
    frameShape: "circle",
    layers: { buildings: false, roads: false, waterGreen: false, trees: false },
  };
}

describe("hillshade grid", () => {
  it("is uniform on a flat field and leaves flat ground unshaded", () => {
    const grid = hillshadeGrid(field(9, 9, () => 12));
    const first = grid.values[0]!;
    for (const value of grid.values) expect(value).toBe(first);
    expect(first).toBeCloseTo(1, 6);
  });

  it("lights the north-west-facing slope and darkens the south-east-facing slope", () => {
    const ridge = field(21, 21, (col, row) => 28 - Math.abs(col - row) * 2);
    const grid = hillshadeGrid(ridge);
    const nwFace = grid.values[15 * 21 + 5]!;
    const seFace = grid.values[5 * 21 + 15]!;
    expect(nwFace).toBeGreaterThan(seFace);
    expect(nwFace).toBeGreaterThan(1);
    expect(seFace).toBeLessThan(1);
    expect(new Set(grid.values).size).toBeGreaterThan(1);
  });

  it("stays a soft multiply inside its range on steep ground", () => {
    const cliff = field(9, 9, (col) => col * 50);
    for (const value of hillshadeGrid(cliff).values) {
      expect(value).toBeGreaterThanOrEqual(HILLSHADE_MIN);
      expect(value).toBeLessThanOrEqual(HILLSHADE_MAX);
    }
  });

  it("samples between nodes in local east/north metres", () => {
    const grid = { cols: 2, rows: 2, values: Float32Array.from([0.8, 1, 0.8, 1]) };
    expect(sampleHillshade(grid, 0, 0, 100)).toBeCloseTo(0.9, 6);
    expect(sampleHillshade(grid, 50, 0, 100)).toBeCloseTo(1, 6);
  });
});

describe("hillshade colour multiply", () => {
  it("encodes the shade range into a byte texture laid out south to north", () => {
    const grid = { cols: 2, rows: 2, values: Float32Array.from([HILLSHADE_MIN, HILLSHADE_MAX, 1, 1]) };
    const texture = hillshadeTexture(grid);
    const data = texture.image.data as Uint8Array;
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(255);
    expect(texture.image.width).toBe(2);
    texture.dispose();
  });

  it("multiplies the ground fill by the shade and leaves it untouched at 1", () => {
    const flat = field(3, 3, () => 0);
    const base = terrainTint(flat, 0);
    expect(shadeRgb(base, 1)).toEqual(base);
    expect(shadeRgb(base, 0.85)[0]).toBeCloseTo(base[0] * 0.85, 6);
  });

  it("gives a flat field uniform ground colours", () => {
    const flat = field(5, 5, () => 3, 10);
    const colors = terrainBuffers(flat, 40).colors;
    for (let i = 3; i < colors.length; i++) expect(colors[i]).toBe(colors[i % 3]);
  });

  it("yields to a ground-draping analysis overlay", () => {
    expect(groundHillshadeOn(true, false)).toBe(true);
    expect(groundHillshadeOn(true, true)).toBe(false);
    expect(groundHillshadeOn(false, false)).toBe(false);
  });
});

describe("3D ground hillshade", () => {
  it("adds a shade map and toggle without moving or recolouring the terrain mesh", () => {
    const ridge = field(17, 17, (col, row) => 28 - Math.abs(col - row) * 3, 5);
    const sideM = 80;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const truth = terrainBuffers(ridge, sideM, "circle");
    const group = buildCityGroup(model(ridge, sideM));
    try {
      const terrain = group.getObjectByName("Terrain") as THREE.Mesh;
      const positions = terrain.geometry.getAttribute("position").array;
      expect(Array.from(positions)).toEqual(Array.from(truth.positions));
      expect(Array.from(terrain.geometry.getAttribute("color").array)).toEqual(Array.from(truth.colors));
      expect(Object.keys(terrain.geometry.attributes).sort()).toEqual(["color", "normal", "position"]);
      const material = terrain.material as THREE.MeshStandardMaterial;
      const uniform = material.userData.hillshadeUniform as { value: number };
      expect(uniform.value).toBe(1);
      const map = material.userData.hillshadeMap as THREE.DataTexture;
      expect(new Set(map.image.data as Uint8Array).size).toBeGreaterThan(1);
      setGroundHillshade(group, false);
      expect(uniform.value).toBe(0);
      expect(Array.from(terrain.geometry.getAttribute("position").array)).toEqual(Array.from(truth.positions));
    } finally {
      disposeObject(group);
      warn.mockRestore();
    }
  }, 30_000);
});

describe("qaTerrain hook", () => {
  it("needs qa=1 and a known kind", () => {
    expect(qaTerrainFromSearch("?qa=1&qaTerrain=ridge")).toBe("ridge");
    expect(qaTerrainFromSearch("qa=1&qaTerrain=flat")).toBe("flat");
    expect(qaTerrainFromSearch("?qaTerrain=ridge")).toBeNull();
    expect(qaTerrainFromSearch("?qa=1&qaTerrain=alps")).toBeNull();
  });

  it("returns a Rozelle-like ridge without fetching tiles, even when tiles would fail", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      const ridge = await fetchTerrainForCut(rozelle, 1000, undefined, "?qa=1&qaTerrain=ridge");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(ridge.source).toBe(QA_TERRAIN_SOURCE);
      expect(ridge.max - ridge.min).toBeGreaterThan(20);
      expect(ridge.max - ridge.min).toBeLessThanOrEqual(28);
      expect(ridge.heights.length).toBe(ridge.cols * ridge.rows);
      const flat = await fetchTerrainForCut(rozelle, 1000, undefined, "?qa=1&qaTerrain=flat");
      expect(flat.max - flat.min).toBe(0);
      await expect(fetchTerrainForCut(rozelle, 1000, undefined, "")).rejects.toThrow();
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
