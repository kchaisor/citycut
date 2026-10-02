import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import { clipPolygon, clipSegment } from "./clip";
import { fromLocal, squareBBox, toLocal } from "./geo";
import { buildingHeight } from "./height";
import { parseCity, stitchRings } from "./parseOsm";
import { planPaths } from "./svgPlan";
import type { CityModel, Pt } from "../types";

const origin = { lon: 144.9631, lat: -37.8136 };

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  const ring: Pt[] = [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
  return ring;
}

function geom(points: Pt[]) {
  return points.map((point) => fromLocal(point, origin));
}

describe("heights", () => {
  it("prefers the height tag, then levels, then 9 m", () => {
    expect(buildingHeight({ height: "24.5" })).toBe(24.5);
    expect(buildingHeight({ height: "12 m" })).toBe(12);
    expect(buildingHeight({ height: "1500 cm" })).toBe(15);
    expect(buildingHeight({ height: "30 ft" })).toBeCloseTo(9.144, 2);
    expect(buildingHeight({ "building:levels": "4" })).toBe(12);
    expect(buildingHeight({ building: "yes" })).toBe(9);
  });
});

describe("clip", () => {
  it("keeps an inside segment and cuts one that crosses the square", () => {
    expect(clipSegment([0, 0], [10, 0], -20, 20)).not.toBeNull();
    const cut = clipSegment([-40, 0], [40, 0], -10, 10);
    expect(cut?.[0][0]).toBeCloseTo(-10);
    expect(cut?.[1][0]).toBeCloseTo(10);
  });

  it("clips a polygon to the cut square", () => {
    const clipped = clipPolygon(square([0, 0], 100), -10, 10);
    expect(clipped.length).toBeGreaterThanOrEqual(4);
    for (const [x, y] of clipped) {
      expect(x).toBeGreaterThanOrEqual(-10.01);
      expect(x).toBeLessThanOrEqual(10.01);
      expect(y).toBeGreaterThanOrEqual(-10.01);
      expect(y).toBeLessThanOrEqual(10.01);
    }
  });
});

describe("parse", () => {
  it("stitches a split outer ring", () => {
    const rings = stitchRings([
      [
        [0, 0],
        [10, 0],
      ],
      [
        [10, 0],
        [10, 8],
        [0, 8],
      ],
      [
        [0, 8],
        [0, 0],
      ],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0][0][0]).toBeCloseTo(rings[0][rings[0].length - 1][0]);
  });

  it("builds buildings, roads, and parks inside the frame", () => {
    const footprint = geom(square([20, 30], 40));
    const park = geom(square([-80, -40], 50));
    const road = geom([
      [-400, 0],
      [400, 0],
    ]);
    const parsed = parseCity(
      {
        elements: [
          {
            type: "way",
            id: 1,
            tags: { building: "yes", height: "18" },
            geometry: footprint,
          },
          {
            type: "way",
            id: 2,
            tags: { leisure: "park" },
            geometry: park,
          },
          {
            type: "way",
            id: 3,
            tags: { highway: "residential" },
            geometry: road,
          },
          {
            type: "way",
            id: 4,
            tags: { building: "yes", "building:levels": "2" },
            geometry: geom(square([5000, 5000], 30)),
          },
        ],
      },
      origin,
      400,
      { buildings: true, roads: true, waterGreen: true, trees: false },
    );

    expect(parsed.buildings).toHaveLength(1);
    expect(parsed.buildings[0].height).toBe(18);
    expect(parsed.buildings[0].use).toBe("unclassified");
    expect(parsed.buildings[0].source).toBe("none");
    expect(parsed.roads[0].grade).toBe("local");
    expect(parsed.areas).toHaveLength(1);
    expect(parsed.areas[0].kind).toBe("green");
    expect(parsed.roads).toHaveLength(1);
    expect(parsed.roadKm).toBeGreaterThan(0.3);
    expect(parsed.roadKm).toBeLessThan(0.5);

    const roadGroup = buildCityGroup({ ...parsed, placeLabel: "Test" });
    try {
      const roadMesh = roadGroup.getObjectByName("Roads") as THREE.Mesh;
      expect(roadMesh).toBeTruthy();
      const stats = roadSurface(roadMesh);
      expect(stats.triangles).toBeGreaterThan(0);
      expect(stats.area).toBeGreaterThan(400 * 5.5 * 0.8);
      expect(stats.minNormalY).toBeGreaterThan(0);
      expect(stats.minY).toBeGreaterThan(0.1);
      expect(stats.maxY).toBeLessThan(0.4);
    } finally {
      disposeObject(roadGroup);
    }
    const back = toLocal(parsed.center.lat, parsed.center.lon, origin);
    expect(back[0]).toBeCloseTo(0);
    expect(back[1]).toBeCloseTo(0);
  });

  it("drops a duplicate footprint and keeps the more specific use", () => {
    const footprint = geom(square([0, 0], 30));
    const parsed = parseCity(
      {
        elements: [
          { type: "way", id: 1, tags: { building: "yes" }, geometry: footprint },
          { type: "way", id: 2, tags: { building: "apartments", shop: "yes" }, geometry: footprint },
        ],
      },
      origin,
      200,
      { buildings: true, roads: false, waterGreen: false, trees: false },
    );
    expect(parsed.buildings).toHaveLength(1);
    expect(parsed.buildings[0].use).toBe("mixed_use");
    expect(parsed.buildings[0].source).toBe("osm_tag");
    expect(parsed.buildings[0].id).toBe(2);
  });

  it("drops zoo ponds and intermittent drains from the water layer", () => {
    const ring = geom([
      [-20, -20],
      [20, -20],
      [20, 20],
      [-20, 20],
      [-20, -20],
    ]);
    const parsed = parseCity(
      {
        elements: [
          {
            type: "way",
            id: 1,
            tags: { natural: "water", water: "pond", name: "Sediment Pond" },
            geometry: ring,
          },
          {
            type: "way",
            id: 2,
            tags: { natural: "water", zoo: "enclosure" },
            geometry: ring,
          },
          {
            type: "way",
            id: 3,
            tags: { natural: "water", name: "Tam-Boore" },
            geometry: ring,
          },
        ],
      },
      origin,
      200,
      { buildings: false, roads: false, waterGreen: true, trees: false },
    );
    expect(parsed.areas.filter((area) => area.kind === "water")).toHaveLength(1);
    expect(parsed.areas[0].id).toBe(3);
  });

  it("reads a multipolygon water relation", () => {
    const west = geom([
      [-30, -20],
      [0, -20],
    ]);
    const east = geom([
      [0, -20],
      [30, -20],
      [30, 20],
      [-30, 20],
      [-30, -20],
    ]);
    const parsed = parseCity(
      {
        elements: [
          {
            type: "relation",
            id: 9,
            tags: { natural: "water", type: "multipolygon" },
            members: [
              { type: "way", ref: 11, role: "outer", geometry: west },
              { type: "way", ref: 12, role: "outer", geometry: east },
            ],
          },
        ],
      },
      origin,
      200,
      { buildings: false, roads: false, waterGreen: true, trees: false },
    );
    expect(parsed.areas).toHaveLength(1);
    expect(parsed.areas[0].kind).toBe("water");
  });

  it("builds upward, non-degenerate road ribbons from sample OSM ways", () => {
    const parsed = parseCity(
      {
        elements: [
          {
            type: "way",
            id: 1,
            tags: { highway: "primary" },
            geometry: geom([
              [-80, -40],
              [-80, 60],
            ]),
          },
          {
            type: "way",
            id: 2,
            tags: { highway: "residential" },
            geometry: geom([
              [-40, 10],
              [70, 10],
            ]),
          },
          {
            type: "way",
            id: 3,
            tags: { highway: "footway" },
            geometry: geom([
              [20, -50],
              [-30, -50],
            ]),
          },
        ],
      },
      origin,
      200,
      { buildings: false, roads: true, waterGreen: false, trees: false },
    );
    expect(parsed.roads.map((road) => road.grade).sort()).toEqual(["arterial", "local", "path"]);
    const group = buildCityGroup({ ...parsed, placeLabel: "Test" });
    try {
      const meshes: THREE.Mesh[] = [];
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.name === "Roads") meshes.push(mesh);
      });
      expect(meshes).toHaveLength(3);
      let area = 0;
      const colors = new Set<string>();
      for (const mesh of meshes) {
        const stats = roadSurface(mesh);
        expect(stats.vertices).toBeGreaterThanOrEqual(6);
        expect(stats.minNormalY).toBeGreaterThan(0);
        expect(stats.minY).toBeGreaterThan(0.1);
        expect(stats.maxY).toBeLessThan(0.35);
        area += stats.area;
        const material = mesh.material as THREE.MeshStandardMaterial;
        expect(material.polygonOffset).toBe(false);
        const hex = material.color.getHexString();
        expect(hex).not.toBe("e6e0d4");
        colors.add(hex);
      }
      expect(colors).toEqual(new Set(["3a3a3a", "4a4a4a", "5c5c5c"]));
      // 100 m × 12 m + 110 m × 5.5 m + 50 m × 1.8 m
      expect(area).toBeGreaterThan(1800);
      expect(area).toBeLessThan(2000);
    } finally {
      disposeObject(group);
    }
  });
});

function roadSurface(mesh: THREE.Mesh) {
  const position = mesh.geometry.getAttribute("position");
  let area = 0;
  let triangles = 0;
  let minNormalY = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 2 < position.count; i += 3) {
    const ax = position.getX(i);
    const ay = position.getY(i);
    const az = position.getZ(i);
    const bx = position.getX(i + 1);
    const by = position.getY(i + 1);
    const bz = position.getZ(i + 1);
    const cx = position.getX(i + 2);
    const cy = position.getY(i + 2);
    const cz = position.getZ(i + 2);
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const tri = 0.5 * Math.hypot(nx, ny, nz);
    area += tri;
    triangles += 1;
    minNormalY = Math.min(minNormalY, ny);
    minY = Math.min(minY, ay, by, cy);
    maxY = Math.max(maxY, ay, by, cy);
    expect(tri).toBeGreaterThan(0.5);
  }
  return { area, triangles, minNormalY, minY, maxY, vertices: position.count };
}

describe("exports", () => {
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

  it("keeps building footprints and a road fill for the plan", () => {
    const plan = planPaths(model);
    expect(plan.buildings.length).toBeGreaterThan(0);
    expect(plan.roadFill.length).toBeGreaterThan(0);
    expect(plan.buildings[0].rings[0].length).toBeGreaterThan(2);
  });

  it("extrudes a building mesh above the ground", () => {
    const group = buildCityGroup(model);
    let buildings: THREE.Object3D | undefined;
    group.traverse((object) => {
      if (object.name.startsWith("Buildings")) buildings = object;
    });
    const roads = group.getObjectByName("Roads");
    expect(buildings).toBeTruthy();
    expect(roads).toBeTruthy();
    const roadMaterial = (roads as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(roadMaterial.color.getHexString()).toBe("4a4a4a");
    expect(roadMaterial.polygonOffset).toBe(false);
    buildings!.updateWorldMatrix(true, true);
    const position = (buildings as { geometry?: { attributes?: { position?: { count: number } } } }).geometry;
    expect(position?.attributes?.position?.count).toBeGreaterThan(0);
    const bbox = squareBBox(origin, 200);
    expect(bbox.north).toBeGreaterThan(origin.lat);
    expect(bbox.east).toBeGreaterThan(origin.lon);
    disposeObject(group);
  });
});
