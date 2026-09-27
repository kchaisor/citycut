import { describe, expect, it } from "vitest";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import { SURFACE } from "./surfaceLayers";
import { sitePlanSvg } from "./svgPlan";
import {
  contourInterval,
  contourLevels,
  contourLines,
  decodeTerrarium,
  footprintBase,
  heightFieldFromTiles,
  metresPerPixel,
  preferredTerrainZoom,
  sampleTerrain,
  terrariumHeight,
  terrainBuffers,
  TERRAIN_SKIRT_M,
  TERRAIN_TILE_SIZE,
  tilesForBBox,
  webMercatorPixel,
  type DecodedTile,
} from "./terrain";
import { squareBBox } from "./geo";
import type { CityModel, TerrainField } from "../types";

const melbourne = { lon: 144.9631, lat: -37.8136 };

describe("terrarium decoding", () => {
  it("uses the MapLibre terrarium formula, not mapbox terrain-RGB", () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    expect(terrariumHeight(128, 20, 128)).toBeCloseTo(20.5, 5);
    const mapbox = -10000 + (128 * 65536 + 20 * 256 + 128) * 0.1;
    expect(terrariumHeight(128, 20, 128)).not.toBeCloseTo(mapbox, 0);
  });

  it("decodes a packed RGBA tile, ignoring alpha", () => {
    const rgba = Uint8ClampedArray.of(128, 0, 0, 255, 128, 10, 0, 128);
    const heights = decodeTerrarium(rgba, 2, 1);
    expect(heights[0]).toBe(0);
    expect(heights[1]).toBe(10);
  });
});

describe("height sampling", () => {
  it("picks zoom 14 at Melbourne for a 5 m target", () => {
    expect(preferredTerrainZoom(melbourne.lat)).toBe(14);
    expect(metresPerPixel(melbourne.lat, 14)).toBeGreaterThan(3.5);
    expect(metresPerPixel(melbourne.lat, 14)).toBeLessThan(4.2);
    const tiles = tilesForBBox(squareBBox(melbourne, 500), 14);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(4);
  });

  it("resamples a constant tile into a flat heightfield", () => {
    const zoom = 14;
    const pixel = webMercatorPixel(melbourne.lon, melbourne.lat, zoom);
    const tile: DecodedTile = {
      x: Math.floor(pixel.x / TERRAIN_TILE_SIZE),
      y: Math.floor(pixel.y / TERRAIN_TILE_SIZE),
      width: TERRAIN_TILE_SIZE,
      height: TERRAIN_TILE_SIZE,
      heights: new Float32Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE).fill(42),
    };
    const field = heightFieldFromTiles([tile], melbourne, 120, zoom);
    expect(field.min).toBeCloseTo(42, 4);
    expect(field.max).toBeCloseTo(42, 4);
    expect(sampleTerrain(field, 0, 0, 120)).toBeCloseTo(42, 4);
    expect(sampleTerrain(field, -60, 60, 120)).toBeCloseTo(42, 4);
  });

  it("reads an east-west gradient off the tile columns", () => {
    const zoom = 14;
    const pixel = webMercatorPixel(melbourne.lon, melbourne.lat, zoom);
    const heights = new Float32Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE);
    for (let row = 0; row < TERRAIN_TILE_SIZE; row++) {
      for (let col = 0; col < TERRAIN_TILE_SIZE; col++) heights[row * TERRAIN_TILE_SIZE + col] = col;
    }
    const tile: DecodedTile = {
      x: Math.floor(pixel.x / TERRAIN_TILE_SIZE),
      y: Math.floor(pixel.y / TERRAIN_TILE_SIZE),
      width: TERRAIN_TILE_SIZE,
      height: TERRAIN_TILE_SIZE,
      heights,
    };
    const field = heightFieldFromTiles([tile], melbourne, 80, zoom);
    expect(sampleTerrain(field, 30, 0, 80)).toBeGreaterThan(sampleTerrain(field, -30, 0, 80) + 5);
  });

  it("bilinear-samples the grid and uses the lowest footprint vertex", () => {
    const heights = new Float32Array([0, 10, 20, 0, 10, 20, 0, 10, 20]);
    const field: TerrainField = {
      cols: 3,
      rows: 3,
      heights,
      min: 0,
      max: 20,
      spacingM: 50,
      zoom: 14,
      metresPerPixel: 4,
      source: "Mapterhorn",
    };
    expect(sampleTerrain(field, -50, -50, 100)).toBeCloseTo(0, 5);
    expect(sampleTerrain(field, 50, 50, 100)).toBeCloseTo(20, 5);
    expect(sampleTerrain(field, 0, 0, 100)).toBeCloseTo(10, 5);
    const base = footprintBase(
      field,
      [
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10],
      ],
      100,
    );
    expect(base).toBeCloseTo(sampleTerrain(field, -10, -10, 100), 5);
    expect(base).toBeLessThan(sampleTerrain(field, 10, 10, 100));
  });
});

describe("contours", () => {
  it("chooses 1, 2, 5, or 10 m from the relief", () => {
    expect(contourInterval(3)).toBe(1);
    expect(contourInterval(8)).toBe(2);
    expect(contourInterval(24)).toBe(2);
    expect(contourInterval(25)).toBe(5);
    expect(contourInterval(79)).toBe(5);
    expect(contourInterval(80)).toBe(10);
    expect(contourLevels(10.2, 14.8, 2)).toEqual([12, 14]);
  });

  it("draws a level line across a north-south ramp", () => {
    const field: TerrainField = {
      cols: 2,
      rows: 2,
      heights: Float32Array.of(0, 0, 2, 2),
      min: 0,
      max: 2,
      spacingM: 10,
      zoom: 14,
      metresPerPixel: 4,
      source: "Mapterhorn",
    };
    const lines = contourLines(field, 10, 1);
    expect(lines).toHaveLength(1);
    for (const [, north] of lines[0]) expect(north).toBeCloseTo(0, 4);
    const eastings = lines[0].map((point) => point[0]);
    expect(Math.min(...eastings)).toBeCloseTo(-5, 4);
    expect(Math.max(...eastings)).toBeCloseTo(5, 4);
  });

  it("closes a loop around a peak", () => {
    const field: TerrainField = {
      cols: 3,
      rows: 3,
      heights: Float32Array.of(1, 1, 1, 1, 8, 1, 1, 1, 1),
      min: 1,
      max: 8,
      spacingM: 10,
      zoom: 14,
      metresPerPixel: 4,
      source: "Mapterhorn",
    };
    const lines = contourLines(field, 20, 2);
    expect(lines.length).toBeGreaterThan(0);
    const loop = lines.find((line) => {
      const a = line[0];
      const b = line[line.length - 1];
      return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.2;
    });
    expect(loop).toBeTruthy();
  });
});

function slopedModel(): CityModel {
  const heights = new Float32Array([0, 10, 20, 0, 10, 20, 0, 10, 20]);
  return {
    placeLabel: "Slope",
    center: melbourne,
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      {
        id: 1,
        ring: [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
          [-10, -10],
        ],
        holes: [],
        height: 12,
        use: "unknown",
      },
    ],
    roads: [{ id: 2, line: [[-40, 0], [40, 0]], width: 6, kind: "road" }],
    areas: [
      {
        id: 3,
        ring: [
          [-40, -40],
          [-15, -40],
          [-15, -15],
          [-40, -15],
          [-40, -40],
        ],
        holes: [],
        kind: "green",
      },
    ],
    trees: [
      {
        id: 4,
        at: [10, 0],
        height_m: 14,
        crown_diameter_m: 6,
        trunk_diameter_m: 0.3,
        sizeSource: "osm",
        archetype: "generic",
      },
    ],
    roadKm: 0.08,
    buildingCapHit: false,
    sourceNote: "test",
    contours: true,
    terrain: {
      cols: 3,
      rows: 3,
      heights,
      min: 0,
      max: 20,
      spacingM: 50,
      zoom: 14,
      metresPerPixel: 4,
      source: "Mapterhorn",
    },
  };
}

describe("terrain in the model", () => {
  it("replaces the flat slab and seats buildings, trees, and roads on the DEM", () => {
    const model = slopedModel();
    const field = model.terrain!;
    const base = footprintBase(field, model.buildings[0].ring, model.sideM);
    const group = buildCityGroup(model);
    try {
      expect(group.getObjectByName("Ground")).toBeUndefined();
      const terrain = group.getObjectByName("Terrain") as THREE.Mesh;
      expect(terrain).toBeTruthy();
      const position = terrain.geometry.getAttribute("position");
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < position.count; i++) {
        minY = Math.min(minY, position.getY(i));
        maxY = Math.max(maxY, position.getY(i));
      }
      expect(maxY).toBeCloseTo(20, 4);
      expect(minY).toBeCloseTo(0 - TERRAIN_SKIRT_M, 4);

      let buildings: THREE.Mesh | undefined;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.name.startsWith("Buildings")) buildings = mesh;
      });
      expect(buildings).toBeTruthy();
      const buildingMesh = buildings as THREE.Mesh;
      buildingMesh.updateWorldMatrix(true, true);
      const buildingPosition = buildingMesh.geometry.getAttribute("position");
      let buildingMin = Infinity;
      let buildingMax = -Infinity;
      for (let i = 0; i < buildingPosition.count; i++) {
        const y = buildingPosition.getY(i);
        buildingMin = Math.min(buildingMin, y);
        buildingMax = Math.max(buildingMax, y);
      }
      expect(buildingMin).toBeCloseTo(base + SURFACE.building.lift, 4);
      expect(buildingMax).toBeCloseTo(base + 12 + SURFACE.building.lift, 4);

      let trees: THREE.InstancedMesh | null = null;
      group.traverse((object) => {
        const candidate = object as THREE.InstancedMesh;
        if (candidate.isInstancedMesh) trees = candidate;
      });
      expect(trees).toBeTruthy();
      const matrix = new THREE.Matrix4();
      const treePosition = new THREE.Vector3();
      trees!.getMatrixAt(0, matrix);
      treePosition.setFromMatrixPosition(matrix);
      expect(treePosition.y).toBeCloseTo(sampleTerrain(field, 10, 0, 100), 4);

      const roads = group.getObjectByName("Roads") as THREE.Mesh;
      const roadPosition = roads.geometry.getAttribute("position");
      let sawLow = false;
      let sawHigh = false;
      for (let i = 0; i < roadPosition.count; i++) {
        const y = roadPosition.getY(i);
        if (y < base + 1) sawLow = true;
        if (y > sampleTerrain(field, 40, 0, 100)) sawHigh = true;
      }
      expect(sawLow).toBe(true);
      expect(sawHigh).toBe(true);
    } finally {
      disposeObject(group);
    }
  });

  it("keeps the flat ground slab when terrain is absent", () => {
    const model = slopedModel();
    model.terrain = null;
    model.contours = true;
    const group = buildCityGroup(model);
    try {
      const ground = group.getObjectByName("Ground") as THREE.Mesh;
      expect(ground).toBeTruthy();
      expect(group.getObjectByName("Terrain")).toBeUndefined();
      expect(ground.position.y).toBe(-4);
      const svg = sitePlanSvg(model);
      expect(svg).not.toContain("#7a6248");
    } finally {
      disposeObject(group);
    }
  });

  it("adds contour strokes to the SVG only when requested", () => {
    const model = slopedModel();
    const withContours = sitePlanSvg(model);
    expect(withContours).toContain("#7a6248");
    expect(withContours).toContain("Mapterhorn");
    const without = sitePlanSvg({ ...model, contours: false });
    expect(without).not.toContain("#7a6248");
    expect(without).toContain("OpenStreetMap");
  });

  it("names the terrain mesh Terrain in the binary glTF", async () => {
    if (typeof globalThis.FileReader === "undefined") {
      class Reader {
        result: ArrayBuffer | null = null;
        onloadend: null | (() => void) = null;
        readAsArrayBuffer(blob: Blob) {
          void blob.arrayBuffer().then((buffer) => {
            this.result = buffer;
            this.onloadend?.();
          });
        }
      }
      globalThis.FileReader = Reader as unknown as typeof FileReader;
    }
    const group = buildCityGroup(slopedModel());
    try {
      const exporter = new GLTFExporter();
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          group,
          (result) => {
            if (result instanceof ArrayBuffer) resolve(result);
            else reject(new Error("expected binary glTF"));
          },
          (error) => reject(error),
          { binary: true },
        );
      });
      expect(new TextDecoder().decode(buffer)).toContain("Terrain");
    } finally {
      disposeObject(group);
    }
  });

  it("points the heightfield normal upward", () => {
    const field: TerrainField = {
      cols: 2,
      rows: 2,
      heights: Float32Array.of(5, 5, 5, 5),
      min: 5,
      max: 5,
      spacingM: 10,
      zoom: 12,
      metresPerPixel: 15,
      source: "Mapterhorn",
    };
    const buffers = terrainBuffers(field, 10);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    geometry.computeVertexNormals();
    const normal = geometry.getAttribute("normal");
    expect(normal.getY(0)).toBeGreaterThan(0.9);
  });
});
