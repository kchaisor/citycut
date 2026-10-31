import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import { drapeTriangles, GROUND_REMAINING_LAYER, GROUND_ROADS_LAYER, groundRoadPartition, groundTriangles, ROAD_GRADES_BY_PRIORITY, type DrapedTri } from "./groundRoads";
import type { CityModel, TerrainField } from "../types";

function field(n: number, sideM: number): TerrainField {
  const heights = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = 3 * Math.sin(c * 0.9) + 2 * r;
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) { min = Math.min(min, h); max = Math.max(max, h); }
  return { cols: n, rows: n, heights, min, max, spacingM: sideM / (n - 1), zoom: 14, metresPerPixel: 4, source: "Mapterhorn" } as TerrainField;
}

function model(): CityModel {
  const sideM = 200;
  return {
    placeLabel: "Split", center: { lon: 145, lat: -37.8 }, sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [{ id: 1, ring: [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]], holes: [], height: 12, use: "unclassified", source: "none" }],
    roads: [
      { id: 2, line: [[-120, 3], [120, -7]], width: 14, kind: "road", grade: "arterial" },
      { id: 3, line: [[-30, -120], [-25, 120]], width: 8, kind: "road", grade: "local" },
      { id: 4, line: [[40, -120], [60, 30], [120, 80]], width: 7, kind: "road", grade: "local" },
      { id: 5, line: [[-120, -60], [120, -50]], width: 3, kind: "road", grade: "path" },
    ],
    areas: [{ id: 6, ring: [[-90, 40], [-50, 40], [-50, 80], [-90, 80], [-90, 40]], holes: [], kind: "water" }],
    trees: [], roadKm: 1, buildingCapHit: false, sourceNote: "test", contours: true,
    terrain: field(9, sideM),
  } as CityModel;
}

const planArea = (t: DrapedTri) => Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;

describe("ground split into Roads + Remaining", () => {
  const m = model();
  const f = m.terrain!;
  const split = groundRoadPartition(m);
  const roads = ROAD_GRADES_BY_PRIORITY.flatMap((g) => drapeTriangles(groundTriangles(split.roads[g], f, m.sideM), f, m.sideM));
  const rest = drapeTriangles(groundTriangles(split.remaining, f, m.sideM), f, m.sideM);

  it("tiles the cut exactly: road + remaining area = frame area", () => {
    const a = roads.reduce((s, t) => s + planArea(t), 0);
    const b = rest.reduce((s, t) => s + planArea(t), 0);
    expect(a).toBeGreaterThan(1000);
    expect(a + b).toBeCloseTo(m.sideM * m.sideM, 3);
  });

  it("keeps grades disjoint (sum of per-grade areas = union area)", () => {
    const per = ROAD_GRADES_BY_PRIORITY.map((g) => drapeTriangles(groundTriangles(split.roads[g], f, m.sideM), f, m.sideM).reduce((s, t) => s + planArea(t), 0));
    expect(per.every((x) => x > 0)).toBe(true);
    const total = roads.reduce((s, t) => s + planArea(t), 0);
    expect(per.reduce((s, x) => s + x, 0)).toBeCloseTo(total, 6);
  });

  it("shares every edge: open edges of the combined surface lie only on the frame", () => {
    const key = (p: number[]) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
    const edges = new Map<string, { a: number[]; b: number[]; n: number }>();
    const heights = new Map<string, number>();
    for (const t of [...roads, ...rest]) {
      for (let i = 0; i < 3; i++) {
        const a = t[i]!;
        const b = t[(i + 1) % 3]!;
        const h = heights.get(key(a));
        if (h !== undefined) expect(Math.abs(h - a[2])).toBeLessThan(1e-6);
        heights.set(key(a), a[2]);
        const k = [key(a), key(b)].sort().join("|");
        const e = edges.get(k) ?? { a, b, n: 0 };
        e.n++;
        edges.set(k, e);
      }
    }
    const half = m.sideM / 2;
    const onFrame = (p: number[]) => Math.abs(Math.abs(p[0]) - half) < 1e-6 || Math.abs(Math.abs(p[1]) - half) < 1e-6;
    const open = [...edges.values()].filter((e) => e.n === 1);
    expect(open.length).toBeGreaterThan(0);
    const cracks = open.filter((e) => !(onFrame(e.a) && onFrame(e.b) && (Math.abs(e.a[0] - e.b[0]) < 1e-6 || Math.abs(e.a[1] - e.b[1]) < 1e-6)));
    expect(cracks).toEqual([]);
    expect([...edges.values()].every((e) => e.n <= 2)).toBe(true);
  });

  it("builds tagged meshes; buildings are not cut out and water stays an overlay", () => {
    const group = buildCityGroup(m);
    try {
      const terrain = group.getObjectByName("Terrain") as THREE.Mesh;
      expect(terrain.userData.exportLayer).toBe(GROUND_REMAINING_LAYER);
      const roadMeshes: THREE.Mesh[] = [];
      group.traverse((o) => { if (o.name === "Roads") roadMeshes.push(o as THREE.Mesh); });
      expect(roadMeshes.length).toBeGreaterThan(0);
      expect(roadMeshes.every((r) => r.userData.exportLayer === GROUND_ROADS_LAYER)).toBe(true);
      expect(group.getObjectByName("Water")).toBeTruthy();
      const pos = terrain.geometry.getAttribute("position");
      let area = 0;
      for (let i = 0; i < pos.count; i += 3) {
        const t = [0, 1, 2].map((k) => [pos.getX(i + k), -pos.getZ(i + k), pos.getY(i + k)]) as DrapedTri;
        area += planArea(t);
      }
      expect(area).toBeCloseTo(rest.reduce((s, t) => s + planArea(t), 0), 0);
    } finally {
      disposeObject(group);
    }
  });
});
