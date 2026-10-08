import { describe, expect, it } from "vitest";
import type { MultiPolygon, Pair } from "polygon-clipping";
import { signedArea } from "./geo";
import {
  bufferCentreline,
  unionCarriageways,
  unionFootpathStrips,
  unionRoadSurface,
} from "./roadFill";
import { planPaths } from "./svgPlan";
import { offsetCloseMultiPolygon, offsetMultiPolygon } from "./polygonOffset";
import type { CityModel, Pt, RoadFeat } from "../types";

function planFixtureModel(): CityModel {
  return {
    placeLabel: "Test Block",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      {
        id: 1,
        ring: [
          [-20, -20],
          [20, -20],
          [20, 20],
          [-20, 20],
          [-20, -20],
        ],
        holes: [],
        height: 12,
        use: "residential",
        source: "osm_tag",
      },
    ],
    roads: [
      { id: 2, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" },
      { id: 5, line: [[-30, -20], [30, -20]], width: 2, kind: "road", grade: "path" },
      { id: 6, line: [[10, -40], [10, 40]], width: 3.2, kind: "rail" },
    ],
    areas: [{ id: 3, ring: [[-45, -45], [-30, -45], [-30, -30], [-45, -30], [-45, -45]], holes: [], kind: "green" }],
    trees: [],
    roadKm: 0.16,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

function rect(w: number, h: number, ccw = true): MultiPolygon {
  const pts: Pair[] = ccw
    ? [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
        [0, 0],
      ]
    : [
        [0, 0],
        [0, h],
        [w, h],
        [w, 0],
        [0, 0],
      ];
  return [[pts]];
}

function multiArea(multi: MultiPolygon): number {
  let area = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (!outer) continue;
    area += Math.abs(signedArea(outer.slice(0, -1)));
    for (const hole of polygon.slice(1)) area -= Math.abs(signedArea(hole.slice(0, -1)));
  }
  return area;
}

function inside(multi: MultiPolygon, x: number, y: number): boolean {
  let hits = 0;
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = ring.slice(0, -1);
      for (let i = 0, j = open.length - 1; i < open.length; j = i++) {
        const yi = open[i]![1];
        const yj = open[j]![1];
        if (yi > y === yj > y) continue;
        const xc = ((open[j]![0] - open[i]![0]) * (y - yi)) / (yj - yi) + open[i]![0];
        if (x < xc) hits += 1;
      }
    }
  }
  return hits % 2 === 1;
}

function roadGrid3x3(): MultiPolygon {
  const streets: { line: Pt[]; width: number }[] = [];
  for (let i = 0; i <= 3; i++) {
    streets.push({ line: [[i * 90, 0], [i * 90, 270]], width: 10 });
    streets.push({ line: [[0, i * 90], [270, i * 90]], width: 10 });
  }
  return unionCarriageways(streets, 400).polygons;
}

describe("polygonOffset", () => {
  it("expands a 10 x 1.2 m rectangle by +2 m", () => {
    const base = rect(10, 1.2);
    expect(multiArea(base)).toBeCloseTo(12, 2);
    const expanded = offsetMultiPolygon(base, 2);
    expect(multiArea(expanded)).toBeGreaterThan(67);
    expect(multiArea(expanded)).toBeLessThan(74);
  });

  it("shrinks a 10 x 1.2 m rectangle by -0.5 m", () => {
    const base = rect(10, 1.2);
    const shrunk = offsetMultiPolygon(base, -0.5);
    expect(multiArea(shrunk)).toBeGreaterThan(1.7);
    expect(multiArea(shrunk)).toBeLessThan(1.85);
  });

  it("offsets CW and CCW rectangles the same way", () => {
    const ccw = offsetMultiPolygon(rect(10, 1.2, true), 2);
    const cw = offsetMultiPolygon(rect(10, 1.2, false), 2);
    expect(multiArea(ccw)).toBeCloseTo(multiArea(cw), 1);
  });

  it("closes a concave corner without growing a square footprint", () => {
    const lShape: MultiPolygon = [
      [
        [
          [0, 0],
          [10, 0],
          [10, 2],
          [2, 2],
          [2, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    ];
    const closed = offsetCloseMultiPolygon(lShape, 1);
    expect(closed.length).toBeGreaterThan(0);
    expect(multiArea(closed)).toBeGreaterThanOrEqual(multiArea(lShape) * 0.98);
  });

  it("closing a 3x3 road grid with r=3 keeps four block holes and nearly the same area", () => {
    const grid = roadGrid3x3();
    expect(grid[0]!.length - 1).toBe(4);
    const closed = offsetCloseMultiPolygon(grid, 3);
    expect(closed[0]!.length - 1).toBe(4);
    expect(multiArea(closed)).toBeGreaterThan(multiArea(grid) * 0.97);
    expect(multiArea(closed)).toBeLessThan(multiArea(grid) * 1.03);
    expect(inside(closed, 45, 45)).toBe(false);
    expect(inside(closed, 5, 5)).toBe(true);
  });

  it("closing two 1.2 m footpath strips crossing at 75° with r=2 adds area and arc vertices", () => {
    const len = 40;
    const angle = (75 * Math.PI) / 180;
    const strips = [
      { line: [[-len / 2, 0], [len / 2, 0]] as Pt[], width: 1.2 },
      {
        line: [
          [-Math.cos(angle) * (len / 2), -Math.sin(angle) * (len / 2)],
          [Math.cos(angle) * (len / 2), Math.sin(angle) * (len / 2)],
        ] as Pt[],
        width: 1.2,
      },
    ];
    const sharp = unionFootpathStrips(strips, 200, "square", 0, 1.2);
    const filleted = unionFootpathStrips(strips, 200, "square", 2, 1.2);
    expect(multiArea(filleted.polygons)).toBeGreaterThan(multiArea(sharp.polygons));
    expect(multiArea(filleted.polygons)).toBeLessThan(multiArea(sharp.polygons) * 1.25);
    const outer = filleted.polygons[0]![0]!.slice(0, -1);
    const nearCross = outer.filter((p) => Math.hypot(p[0], p[1]) < 2.5 && Math.hypot(p[0], p[1]) > 0.35);
    expect(nearCross.length).toBeGreaterThanOrEqual(4);
  });

  it("footpaths forming a loop around a lawn keep the lawn as a hole", () => {
    const loop: Pt[] = [
      [-30, -30],
      [30, -30],
      [30, 30],
      [-30, 30],
      [-30, -30],
    ];
    const buffered = bufferCentreline(loop, 2.4, 0);
    expect(buffered[0]!.length).toBeGreaterThan(1);
    const closed = offsetCloseMultiPolygon([buffered[0]!], 2);
    expect(closed[0]!.length).toBeGreaterThan(1);
    expect(inside(closed, 0, 0)).toBe(false);
  });

  it("dual carriageway with a 4 m tram gap fills the gap without widening outer edges", () => {
    const roads: RoadFeat[] = [
      { id: 1, line: [[-40, 0], [40, 0]], width: 10, kind: "road", grade: "arterial" },
      { id: 2, line: [[-40, 12], [40, 12]], width: 10, kind: "road", grade: "arterial" },
    ];
    const bare = unionCarriageways(
      roads.map((road) => ({ line: road.line, width: road.width })),
      200,
    );
    expect(inside(bare.polygons, 0, 6)).toBe(false);
    const filled = unionRoadSurface(roads, [[[-40, 6], [40, 6]]], 200);
    expect(inside(filled.polygons, 0, 6)).toBe(true);
    function outerYExtents(multi: MultiPolygon) {
      let minY = Infinity;
      let maxY = -Infinity;
      for (const polygon of multi) {
        for (const p of polygon[0]!.slice(0, -1)) {
          minY = Math.min(minY, p[1]);
          maxY = Math.max(maxY, p[1]);
        }
      }
      return { minY, maxY };
    }
    const bareY = outerYExtents(bare.polygons);
    const filledY = outerYExtents(filled.polygons);
    expect(Math.abs(filledY.minY - bareY.minY)).toBeLessThan(0.11);
    expect(Math.abs(filledY.maxY - bareY.maxY)).toBeLessThan(0.11);
  });

  it("planPaths on the export fixture keeps road and path area within 10% of pathFilletM 0", () => {
    const model = planFixtureModel();
    const sharp = planPaths(model, 1.2, 5, 1000, undefined, undefined, { pathFilletM: 0 });
    const filleted = planPaths(model, 1.2, 5, 1000, undefined, undefined, { pathFilletM: 2 });
    const roadSharp = multiArea(sharp.roadFill);
    const roadFilleted = multiArea(filleted.roadFill);
    const pathSharp = multiArea(sharp.pathFill);
    const pathFilleted = multiArea(filleted.pathFill);
    expect(roadFilleted).toBeGreaterThan(roadSharp * 0.9);
    expect(roadFilleted).toBeLessThan(roadSharp * 1.1);
    expect(pathFilleted).toBeGreaterThan(pathSharp * 0.9);
    expect(pathFilleted).toBeLessThan(pathSharp * 1.1);
  });
});
