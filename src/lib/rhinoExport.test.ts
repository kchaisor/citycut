import { describe, expect, it } from "vitest";
import { projectLocal } from "./crs";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import { SURFACE } from "./surfaceLayers";
import { footprintBase } from "./terrain";
import type { CityModel, Pt, TerrainField } from "../types";

const origin = { lon: 144.9631, lat: -37.8136 };

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

const model: CityModel = {
  placeLabel: "Test",
  center: origin,
  sideM: 200,
  layers: { buildings: true, roads: true, waterGreen: true, trees: false },
  buildings: [{ id: 1, ring: square([0, 0], 40), holes: [], height: 12, use: "unclassified", source: "none" }],
  roads: [{ id: 2, line: [[-80, 10], [80, 10]], width: 6, kind: "road" }],
  areas: [{ id: 3, ring: square([-40, -40], 30), holes: [], kind: "green" }],
  trees: [],
  roadKm: 0.16,
  buildingCapHit: false,
  sourceNote: "test",
};

type ReadMesh = {
  vertices: () => { count: number; point3dAt: (index: number) => number[] };
  faces: () => { count: number };
};

function latin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("rhino export", () => {
  it("writes a Z-up .3dm in MGA zone 55 metres", async () => {
    const bytes = await cityModelTo3dm({
      ...model,
      buildings: [
        ...model.buildings,
        { id: 8, ring: square([60, 0], 16), holes: [], height: 10, use: "civic", source: "osm_landuse" },
      ],
    });
    const header = latin1(bytes);
    expect(header.startsWith("3D Geometry File Format")).toBe(true);
    expect(header).toContain("EPSG:7855");
    expect(header).toContain("datum shift");

    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      expect(doc.settings().modelUnitSystem).toBe(rhino.UnitSystem.Meters);
      const anchor = doc.settings().earthAnchorPoint;
      const [easting, northing] = projectLocal([0, 0], origin, 55);
      expect(anchor.earthBasepointLatitude).toBeCloseTo(origin.lat, 5);
      expect(anchor.earthBasepointLongitude).toBeCloseTo(origin.lon, 5);
      expect(anchor.modelBasePoint[0]).toBeCloseTo(easting, 2);
      expect(anchor.modelBasePoint[1]).toBeCloseTo(northing, 2);
      expect(anchor.modelBasePoint[2]).toBeCloseTo(0, 5);
      expect(anchor.modelEast[0]).toBeCloseTo(1);
      expect(anchor.modelNorth[1]).toBeCloseTo(1);
      expect(doc.objects().count).toBeGreaterThanOrEqual(4);

      const names: string[] = [];
      const points: number[][] = [];
      for (let i = 0; i < doc.objects().count; i++) {
        const object = doc.objects().get(i);
        names.push(object.attributes().name);
        const geometry = object.geometry() as unknown as ReadMesh;
        expect(geometry.faces().count).toBeGreaterThan(0);
        for (let v = 0; v < geometry.vertices().count; v++) {
          points.push(geometry.vertices().point3dAt(v));
        }
      }
      expect(names).toEqual(expect.arrayContaining(["Buildings::Unclassified", "Roads", "Green", "Ground"]));
      const paths: string[] = [];
      for (let i = 0; i < doc.layers().count; i++) paths.push(doc.layers().get(i).fullPath);
      expect(paths).toContain("Buildings::Unclassified");
      let use = "";
      let typologySource = "";
      for (let i = 0; i < doc.objects().count; i++) {
        const attributes = doc.objects().get(i).attributes();
        if (attributes.name !== "Buildings::Unclassified") continue;
        use = attributes.getUserString("use");
        typologySource = attributes.getUserString("typology_source");
      }
      expect(use).toBe("unclassified");
      expect(typologySource).toBe("none");
      let landuseSource = "";
      for (let i = 0; i < doc.objects().count; i++) {
        const attributes = doc.objects().get(i).attributes();
        if (attributes.name !== "Buildings::Civic") continue;
        landuseSource = attributes.getUserString("typology_source");
      }
      expect(landuseSource).toBe("osm_landuse");

      const top = projectLocal([20, 20], origin, 55);
      const south = projectLocal([20, -20], origin, 55);
      const hasTop = points.some(
        (point) => Math.hypot(point[0] - top[0], point[1] - top[1]) < 0.05 && Math.abs(point[2] - 12) < 0.05,
      );
      const hasSouth = points.some(
        (point) =>
          Math.hypot(point[0] - south[0], point[1] - south[1]) < 0.05 && Math.abs(point[2] - 12) < 0.05,
      );
      expect(hasTop).toBe(true);
      expect(hasSouth).toBe(true);
      expect(top[1]).toBeGreaterThan(south[1]);
    } finally {
      doc.destroy();
    }
  });

  it("includes a tree mesh with its tip at the tree height", async () => {
    const bytes = await cityModelTo3dm({
      ...model,
      layers: { ...model.layers, trees: true },
      trees: [{ id: 9, at: [20, 30], height_m: 14, crown_diameter_m: 8, trunk_diameter_m: 0.3, sizeSource: "osm" }],
    });
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      const names: string[] = [];
      const points: number[][] = [];
      for (let i = 0; i < doc.objects().count; i++) {
        const object = doc.objects().get(i);
        names.push(object.attributes().name);
        const geometry = object.geometry() as unknown as ReadMesh;
        for (let v = 0; v < geometry.vertices().count; v++) {
          points.push(geometry.vertices().point3dAt(v));
        }
      }
      expect(names).toContain("Trees");
      const tip = projectLocal([20, 30], origin, 55);
      const hasTip = points.some(
        (point) =>
          Math.hypot(point[0] - tip[0], point[1] - tip[1]) < 0.05 && Math.abs(point[2] - 14) < 0.05,
      );
      const hasCrown = points.some((point) => {
        const radial = Math.hypot(point[0] - tip[0], point[1] - tip[1]);
        return radial > 3.2 && radial < 4.3 && point[2] > 8 && point[2] < 12.5;
      });
      expect(hasTip).toBe(true);
      expect(hasCrown).toBe(true);
    } finally {
      doc.destroy();
    }
  });

  it("puts the terrain mesh on a Terrain layer in DEM metres", async () => {
    const heights = Float32Array.of(15, 18, 21, 24);
    const terrain: TerrainField = {
      cols: 2,
      rows: 2,
      heights,
      min: 15,
      max: 24,
      spacingM: 200,
      zoom: 14,
      metresPerPixel: 4,
      source: "Mapterhorn",
    };
    const sloped: CityModel = {
      ...model,
      terrain,
      contours: false,
    };
    const bytes = await cityModelTo3dm(sloped);
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      const names: string[] = [];
      let terrainMin = Infinity;
      let terrainMax = -Infinity;
      let terrainVertices = 0;
      const base = footprintBase(terrain, model.buildings[0].ring, model.sideM);
      let buildingMin = Infinity;
      for (let i = 0; i < doc.objects().count; i++) {
        const object = doc.objects().get(i);
        const name = object.attributes().name;
        names.push(name);
        const geometry = object.geometry() as unknown as ReadMesh;
        for (let v = 0; v < geometry.vertices().count; v++) {
          const point = geometry.vertices().point3dAt(v);
          if (name === "Terrain") {
            terrainVertices += 1;
            terrainMin = Math.min(terrainMin, point[2]);
            terrainMax = Math.max(terrainMax, point[2]);
          }
          if (name.startsWith("Buildings")) buildingMin = Math.min(buildingMin, point[2]);
        }
      }
      expect(names).toContain("Terrain");
      expect(names).not.toContain("Ground");
      expect(terrainVertices).toBeGreaterThan(4);
      expect(terrainMax).toBeCloseTo(24, 2);
      expect(terrainMin).toBeCloseTo(7, 2);
      expect(buildingMin).toBeCloseTo(base + SURFACE.building.lift, 2);
      const layers: string[] = [];
      for (let i = 0; i < doc.layers().count; i++) layers.push(doc.layers().get(i).name);
      expect(layers).toContain("Terrain");
    } finally {
      doc.destroy();
    }
  });

  it("labels a western block as MGA zone 54", async () => {
    const bytes = await cityModelTo3dm({
      ...model,
      center: { lon: 143.5, lat: -37.8136 },
    });
    expect(latin1(bytes)).toContain("EPSG:7854");
  });
});
