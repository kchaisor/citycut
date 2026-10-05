import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "./buildCity";
import { maxTriangleEdge, subdivideToSpacing, splitTriangle } from "./roadDrape";
import { carriagewaysOf, unionCarriageways } from "./roadFill";
import { planPaths } from "./svgPlan";
import {
  clipLineToGroundVisible,
  clipLineToVisibleSpans,
  groundHiddenSpansFromOvertureProps,
} from "./overtureSegmentVisibility";
import type { CityModel, Pt } from "../types";

describe("road drape blast radius", () => {
  it("partitions bridge spans between ground clip and deck clip", () => {
    const line: Pt[] = [
      [0, 0],
      [100, 0],
    ];
    const props = { road_flags: '[{"between":[0.25,0.75],"values":["is_bridge"]}]' };
    const hidden = groundHiddenSpansFromOvertureProps(props);
    const ground = clipLineToGroundVisible(line, hidden);
    const deck = clipLineToVisibleSpans(line, hidden);
    expect(ground).toHaveLength(2);
    expect(deck).toHaveLength(1);
    expect(deck[0][0][0]).toBeCloseTo(25, 0);
    expect(deck[0][1][0]).toBeCloseTo(75, 0);
  });

  it("includes deck centrelines in the site-plan carriageway union without duplicating ground", () => {
    const model: CityModel = {
      placeLabel: "Test",
      center: { lat: -37.82, lon: 144.98 },
      sideM: 400,
      layers: { buildings: false, roads: true, waterGreen: false, trees: false },
      buildings: [],
      areas: [],
      trees: [],
      roadKm: 0.2,
      buildingCapHit: false,
      sourceNote: "test",
      roads: [
        { id: 1, line: [[-80, 0], [80, 0]], width: 10, kind: "road", grade: "arterial" },
        { id: 2, line: [[-20, -40], [-20, 40]], width: 10, kind: "road", grade: "arterial", deck: true },
      ],
    };
    const ground = unionCarriageways(carriagewaysOf(model.roads, "ground"), model.sideM);
    const all = unionCarriageways(carriagewaysOf(model.roads, "all"), model.sideM);
    expect(all.inputs).toBeGreaterThan(ground.inputs);
    expect(planPaths(model).roadFill.length).toBeGreaterThan(0);
  });

  it("keeps draped road triangles under the post-fix edge budget on a wide strip", () => {
    const tris = [
      [
        [-500, -8],
        [500, -8],
        [500, 8],
      ] as [Pt, Pt, Pt],
      [
        [-500, -8],
        [500, 8],
        [-500, 8],
      ] as [Pt, Pt, Pt],
    ];
    let legacy = tris;
    for (let level = 0; level < 8; level++) {
      const needs = legacy.some(
        ([a, b, c]) =>
          Math.hypot(a[0] - b[0], a[1] - b[1]) > 5 ||
          Math.hypot(b[0] - c[0], b[1] - c[1]) > 5 ||
          Math.hypot(c[0] - a[0], c[1] - a[1]) > 5,
      );
      if (!needs) break;
      legacy = legacy.flatMap((tri) => splitTriangle(tri, 5));
      if (legacy.length > 24000) break;
    }
    const modern = subdivideToSpacing(tris, 5);
    expect(maxTriangleEdge(legacy)).toBeGreaterThan(5);
    expect(maxTriangleEdge(modern)).toBeLessThanOrEqual(5.01);
  });

  it("builds a 1 km road+terrain mesh without throwing", () => {
    const field = {
      cols: 5,
      rows: 5,
      heights: new Float32Array(25).fill(3),
      min: 3,
      max: 3,
      spacingM: 5,
      zoom: 14,
      metresPerPixel: 4,
      source: "Mapterhorn" as const,
    };
    const model: CityModel = {
      placeLabel: "Test",
      center: { lat: -37.8235, lon: 144.988 },
      sideM: 1000,
      terrain: field,
      layers: { buildings: false, roads: true, waterGreen: false, trees: false },
      buildings: [],
      areas: [],
      trees: [],
      roadKm: 1,
      buildingCapHit: false,
      sourceNote: "test",
      roads: [{ id: 1, line: [[-400, 0], [400, 0]], width: 20, kind: "road", grade: "arterial" }],
    };
    const group = buildCityGroup(model);
    try {
      let vertices = 0;
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.name === "Roads") vertices += mesh.geometry.getAttribute("position").count;
      });
      expect(vertices).toBeGreaterThan(100);
    } finally {
      disposeObject(group);
    }
  });
});
