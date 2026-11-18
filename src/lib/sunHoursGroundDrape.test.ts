import { describe, expect, it } from "vitest";
import realTerrain from "./__fixtures__/dandenongTerrain.json";
import { buildSunHoursGroundDrapeGeometry, SUN_HOURS_GROUND_TEXTURE_FLIP_Y } from "./sunHoursGroundDrape";
import { sunHoursGroundImageFor3d, type SunHoursGroundImage } from "./sunHoursGroundRaster";
import { computeSunHoursGroundGrid, sampleSunHoursGroundCell, type SunHoursGroundGrid } from "./sunHoursGroundPlan";
import type { BuildingFeat, CityModel, Pt, TerrainField } from "../types";
import type * as THREE from "three";

const dandenong = { lat: -37.983826, lon: 145.21555 };
const pyrmont = { lat: -33.86627, lon: 151.18389 };
const dandenongTerrain: TerrainField = {
  ...(realTerrain as Omit<TerrainField, "heights">),
  heights: new Float32Array(realTerrain.heights),
};

function block(id: number, east: number, north: number, size: number, height: number): BuildingFeat {
  return {
    id,
    ring: [
      [east, north],
      [east + size, north],
      [east + size, north + size],
      [east, north + size],
      [east, north],
    ],
    holes: [],
    height,
    use: "commercial",
    source: "none",
  };
}

function site(center: { lat: number; lon: number }, sideM: number, buildings: BuildingFeat[], terrain: TerrainField | null): CityModel {
  return {
    placeLabel: "Test",
    center,
    sideM,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
    terrain,
  };
}

function drapeUvAt(geometry: THREE.BufferGeometry, east: number, north: number): [number, number] | null {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex()!;
  const x = east;
  const z = -north;
  for (let face = 0; face < index.count; face += 3) {
    const ids = [index.getX(face), index.getX(face + 1), index.getX(face + 2)];
    const [a, b, c] = ids.map((id) => [position.getX(id), position.getZ(id)] as Pt);
    const det = (b![1] - c![1]) * (a![0] - c![0]) + (c![0] - b![0]) * (a![1] - c![1]);
    if (det === 0) continue;
    const wa = ((b![1] - c![1]) * (x - c![0]) + (c![0] - b![0]) * (z - c![1])) / det;
    const wb = ((c![1] - a![1]) * (x - c![0]) + (a![0] - c![0]) * (z - c![1])) / det;
    const wc = 1 - wa - wb;
    if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
    const weights = [wa, wb, wc];
    let u = 0;
    let v = 0;
    ids.forEach((id, k) => {
      u += uv.getX(id) * weights[k]!;
      v += uv.getY(id) * weights[k]!;
    });
    return [u, v];
  }
  return null;
}

function texelForUv(image: SunHoursGroundImage, [u, v]: [number, number]): { x: number; y: number } {
  const imageV = SUN_HOURS_GROUND_TEXTURE_FLIP_Y ? 1 - v : v;
  return {
    x: Math.min(image.width - 1, Math.floor(u * image.width)),
    y: Math.min(image.height - 1, Math.floor(imageV * image.height)),
  };
}

function textureAlphaAt(grid: SunHoursGroundGrid, geometry: THREE.BufferGeometry, east: number, north: number) {
  const image = sunHoursGroundImageFor3d(grid)!;
  const uv = drapeUvAt(geometry, east, north);
  expect(uv).not.toBeNull();
  const texel = texelForUv(image, uv!);
  const cell = sampleSunHoursGroundCell(grid, east, north);
  const col = Math.floor((east - grid.originEast) / grid.cellM);
  const row = Math.floor((north - grid.originNorth) / grid.cellM);
  return { texel, col, row, masked: cell.masked, alpha: image.data[(texel.y * image.width + texel.x) * 4 + 3]! };
}

const cases = [
  { name: "Dandenong flat", center: dandenong, sideM: 120, terrain: null, at: [21, 27] as Pt },
  { name: "Dandenong terrain", center: dandenong, sideM: 1000, terrain: dandenongTerrain, at: [-180, 260] as Pt },
  { name: "Pyrmont flat", center: pyrmont, sideM: 1500, terrain: null, at: [310, 420] as Pt },
];

describe("sun hours ground drape", () => {
  for (const { name, center, sideM, terrain, at } of cases) {
    it(`puts the footprint hole under an off-centre 3D building (${name})`, { timeout: 20000 }, () => {
      const building = block(1, at[0], at[1], 12, 20);
      const model = site(center, sideM, [building], terrain);
      const grid = computeSunHoursGroundGrid(model, 2026, 6, 21)!;
      const geometry = buildSunHoursGroundDrapeGeometry(grid, model);
      const under = textureAlphaAt(grid, geometry, at[0] + 6.4, at[1] + 6.4);
      expect(under.masked).toBe(true);
      expect(under.texel).toEqual({ x: under.col, y: grid.rows - 1 - under.row });
      expect(under.alpha).toBe(0);
      const mirrored = textureAlphaAt(grid, geometry, at[0] + 6.4, -(at[1] + 6.4));
      expect(mirrored.masked).toBe(false);
      expect(mirrored.texel).toEqual({ x: mirrored.col, y: grid.rows - 1 - mirrored.row });
      expect(mirrored.alpha).toBeGreaterThan(0);
    });
  }

  it("spans exactly the grid extent without terrain", () => {
    const model = site(dandenong, 1000, [], null);
    const grid = computeSunHoursGroundGrid(model, 2026, 6, 21, 3)!;
    const geometry = buildSunHoursGroundDrapeGeometry(grid, model);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(grid.originEast, 3);
    expect(box.max.x).toBeCloseTo(grid.originEast + grid.cols * grid.cellM, 3);
    expect(-box.max.z).toBeCloseTo(grid.originNorth, 3);
    expect(-box.min.z).toBeCloseTo(grid.originNorth + grid.rows * grid.cellM, 3);
  });
});
