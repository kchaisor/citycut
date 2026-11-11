import { describe, expect, it } from "vitest";
import { projectLocal } from "./crs";
import { cityModelTo3dm, loadRhino, partExtrusion, type ExtrusionTally } from "./rhinoExport";
import { buildingExtrusionPoints, ringsSelfIntersect } from "./rhinoExtrusion";
import { SURFACE } from "./surfaceLayers";
import { footprintBase } from "./terrain";
import type { BuildingFeat, CityModel, Pt, TerrainField } from "../types";

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

const courtyard: BuildingFeat = {
  id: 2,
  ring: square([-40, 30], 30),
  holes: [square([-40, 30], 10).reverse()],
  height: 9,
  use: "residential",
  source: "zone",
};
const stacked: BuildingFeat = {
  id: 3,
  ring: square([40, -30], 24),
  holes: [],
  height: 40,
  use: "commercial",
  source: "zone",
  extrusionParts: [
    { ring: square([40, -30], 24), holes: [], height: 12 },
    { ring: square([40, -30], 12), holes: [], height: 28, base: 12 },
  ],
};
const bowtie: BuildingFeat = {
  id: 4,
  ring: [[60, 40], [80, 60], [80, 40], [60, 60], [60, 40]],
  holes: [],
  height: 6,
  use: "civic",
  source: "zone",
};

const model: CityModel = {
  placeLabel: "Test",
  center: origin,
  sideM: 200,
  layers: { buildings: true, roads: false, waterGreen: false, trees: false },
  buildings: [
    { id: 1, ring: square([0, 0], 40), holes: [], height: 12, use: "unclassified", source: "none" },
    courtyard,
    stacked,
  ],
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "test",
};

function slopedTerrain(): TerrainField {
  const cols = 11;
  const rows = 11;
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = 15 + c * 0.9;
  return { cols, rows, heights, min: 15, max: 24, spacingM: 20, zoom: 15, metresPerPixel: 2, source: "test" };
}

type Read = {
  layer: string;
  name: string;
  type: string;
  solid: boolean;
  closed: boolean;
  profiles: number;
  use: string;
  min: number[];
  max: number[];
};

async function read(bytes: Uint8Array): Promise<Read[]> {
  const rhino = await loadRhino();
  const doc = rhino.File3dm.fromByteArray(bytes);
  try {
    const out: Read[] = [];
    for (let i = 0; i < doc.objects().count; i++) {
      const object = doc.objects().get(i);
      const attributes = object.attributes();
      const layer = doc.layers().get(attributes.layerIndex).fullPath;
      if (!layer.startsWith("Buildings")) continue;
      const geometry = object.geometry() as unknown as {
        constructor: { name: string };
        isSolid?: boolean;
        isClosed?: boolean;
        profileCount?: number;
        getBoundingBox(): { min: number[]; max: number[] };
      };
      const box = geometry.getBoundingBox();
      out.push({
        layer,
        name: attributes.name,
        type: geometry.constructor.name,
        solid: Boolean(geometry.isSolid),
        closed: Boolean(geometry.isClosed),
        profiles: geometry.profileCount ?? 0,
        use: attributes.getUserString("use"),
        min: box.min,
        max: box.max,
      });
    }
    return out;
  } finally {
    doc.destroy();
  }
}

function sortKey(item: Read) {
  return `${item.layer}|${item.min.map((v) => v.toFixed(2)).join(",")}`;
}

describe("buildings as Rhino Extrusions", () => {
  it("writes each building part as a closed, capped Extrusion by default", async () => {
    const tally: ExtrusionTally = { extrusions: 0, meshFallback: 0 };
    const objects = await read(await cityModelTo3dm(model, { extrusionTally: tally }));
    expect(objects).toHaveLength(4);
    expect(tally).toEqual({ extrusions: 4, meshFallback: 0 });
    for (const item of objects) {
      expect(item.type).toBe("Extrusion");
      expect(item.solid).toBe(true);
    }
    const court = objects.find((item) => item.layer === "Buildings::Residential")!;
    expect(court.profiles).toBe(2);
    expect(court.use).toBe("residential");
    const stackedParts = objects.filter((item) => item.layer === "Buildings::Commercial");
    expect(stackedParts.map((item) => item.max[2]).sort((a, b) => a - b)).toEqual([
      expect.closeTo(12 + SURFACE.building.lift, 3),
      expect.closeTo(40 + SURFACE.building.lift, 3),
    ]);
    expect(Math.min(...stackedParts.map((item) => item.min[2]))).toBeCloseTo(SURFACE.building.lift, 3);
  });

  it("places Extrusions at the same full MGA bounding boxes as the mesh export, on terrain", async () => {
    const sloped: CityModel = { ...model, terrain: slopedTerrain() };
    const asExtrusions = (await read(await cityModelTo3dm(sloped))).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const asMesh = (await read(await cityModelTo3dm(sloped, { buildingsAsMesh: true }))).sort((a, b) =>
      sortKey(a).localeCompare(sortKey(b)),
    );
    expect(asMesh.every((item) => item.type === "Mesh")).toBe(true);
    expect(asExtrusions).toHaveLength(asMesh.length);
    asExtrusions.forEach((item, index) => {
      const mesh = asMesh[index];
      expect(item.layer).toBe(mesh.layer);
      expect(item.name).toBe(mesh.name);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(item.min[k] - mesh.min[k])).toBeLessThan(0.02);
        expect(Math.abs(item.max[k] - mesh.max[k])).toBeLessThan(0.02);
      }
    });
    const corners = model.buildings[0].ring.map((pt) => projectLocal(pt, origin, 55));
    const e = Math.min(...corners.map((c) => c[0]));
    const n = Math.min(...corners.map((c) => c[1]));
    const plain = asExtrusions.find((item) => item.layer === "Buildings::Unclassified")!;
    expect(plain.min[0]).toBeCloseTo(e, 2);
    expect(plain.min[1]).toBeCloseTo(n, 2);
    expect(plain.min[0]).toBeGreaterThan(300000);
    expect(plain.min[1]).toBeGreaterThan(5_000_000);
    const base = footprintBase(sloped.terrain!, model.buildings[0].ring, model.sideM) + SURFACE.building.lift;
    expect(plain.min[2]).toBeCloseTo(base, 3);
  });

  it("falls back to a mesh for a self-intersecting outline and keeps the rest as Extrusions", async () => {
    const tally: ExtrusionTally = { extrusions: 0, meshFallback: 0 };
    const objects = await read(
      await cityModelTo3dm({ ...model, buildings: [...model.buildings, bowtie] }, { extrusionTally: tally }),
    );
    expect(tally).toEqual({ extrusions: 4, meshFallback: 1 });
    const civic = objects.filter((item) => item.layer === "Buildings::Civic");
    expect(civic.map((item) => item.type)).toEqual(["Mesh"]);
    expect(objects.filter((item) => item.type === "Extrusion")).toHaveLength(4);
  });

  it("uses the same per-part Extrusions when buildings are merged per layer (uniform colours)", async () => {
    const tally: ExtrusionTally = { extrusions: 0, meshFallback: 0 };
    const objects = await read(
      await cityModelTo3dm({ ...model, buildings: [...model.buildings, bowtie] }, { uniformBuildings: true, extrusionTally: tally }),
    );
    expect(tally).toEqual({ extrusions: 4, meshFallback: 1 });
    expect(objects.filter((item) => item.type === "Extrusion" && item.solid)).toHaveLength(4);
    expect(objects.filter((item) => item.type === "Mesh")).toHaveLength(1);
  });

  it("'Buildings as mesh' writes every building as a mesh, as before", async () => {
    const tally: ExtrusionTally = { extrusions: 0, meshFallback: 0 };
    const objects = await read(await cityModelTo3dm(model, { buildingsAsMesh: true, extrusionTally: tally }));
    expect(objects.length).toBeGreaterThan(0);
    expect(objects.every((item) => item.type === "Mesh" && item.closed)).toBe(true);
    expect(tally).toEqual({ extrusions: 0, meshFallback: 0 });
  });
});

describe("partExtrusion", () => {
  it("keeps a courtyard in place on a rotated outline at full MGA magnitudes", async () => {
    const rhino = await loadRhino();
    const rotate = ([x, y]: Pt): Pt => [x * Math.cos(0.5) - y * Math.sin(0.5), x * Math.sin(0.5) + y * Math.cos(0.5)];
    const toMga = (pt: Pt): [number, number] => [pt[0] + 321000.25, pt[1] + 5812000.75];
    const ring = square([0, 0], 30).map(rotate);
    const hole = square([3, 2], 8).map(rotate).reverse();
    const points = buildingExtrusionPoints({ ring, holes: [hole], height: 9, base: 14.5 }, toMga)!;
    const extrusion = partExtrusion(rhino, points) as unknown as {
      isSolid: boolean;
      toBrep(split: boolean): { vertices(): { count: number; get(i: number): { location: number[] } }; delete(): void };
      delete(): void;
    };
    expect(extrusion).not.toBeNull();
    expect(extrusion.isSolid).toBe(true);
    const brep = extrusion.toBrep(false);
    const locations: number[][] = [];
    for (let i = 0; i < brep.vertices().count; i++) locations.push(brep.vertices().get(i).location);
    for (const corner of hole.slice(0, -1).map(toMga)) {
      expect(
        locations.some((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1]) < 0.001 && Math.abs(p[2] - 14.5) < 0.001),
      ).toBe(true);
    }
    brep.delete();
    extrusion.delete();
  });
});

describe("buildingExtrusionPoints", () => {
  const identity = (pt: Pt): [number, number] => [pt[0] + 320000, pt[1] + 5800000];

  it("drops duplicate points and closes rings, with bounds in full MGA", () => {
    const points = buildingExtrusionPoints(
      { ring: [[0, 0], [10, 0], [10, 0.0001], [10, 10], [0, 10], [0, 0]], holes: [], height: 5, base: 2 },
      identity,
    )!;
    expect(points.outer).toHaveLength(5);
    expect(points.outer[0]).toEqual(points.outer[4]);
    expect(points.origin).toEqual([320000, 5800000]);
    expect(points.bounds).toEqual([320000, 5800000, 320010, 5800010]);
  });

  it("rejects fewer than 3 points, zero height, crossing rings and courtyards outside the outline", () => {
    expect(buildingExtrusionPoints({ ring: [[0, 0], [1, 0], [0, 0]], holes: [], height: 5, base: 0 }, identity)).toBeNull();
    expect(buildingExtrusionPoints({ ring: square([0, 0], 10), holes: [], height: 0, base: 0 }, identity)).toBeNull();
    expect(buildingExtrusionPoints({ ring: bowtie.ring, holes: [], height: 5, base: 0 }, identity)).toBeNull();
    expect(
      buildingExtrusionPoints({ ring: square([0, 0], 10), holes: [square([20, 0], 4)], height: 5, base: 0 }, identity),
    ).toBeNull();
    expect(
      buildingExtrusionPoints({ ring: square([0, 0], 10), holes: [square([4, 0], 4)], height: 5, base: 0 }, identity),
    ).toBeNull();
  });

  it("detects self-intersection but not shared corners of adjacent edges", () => {
    expect(ringsSelfIntersect([[[0, 0], [10, 0], [10, 10], [0, 10]]])).toBe(false);
    expect(ringsSelfIntersect([[[0, 0], [10, 10], [10, 0], [0, 10]]])).toBe(true);
  });
});
