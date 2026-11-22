import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import {
  buildContourLineObject,
  CONTOUR_3D_DASH_M,
  CONTOUR_3D_GAP_M,
  CONTOUR_3D_INDEX_NAME,
  CONTOUR_3D_INDEX_WIDTH_PX,
  contourLineMaterials,
  drapeContourSegments,
  drapeContourSegmentsWithDistances,
} from "./contourLines3d";
import type { CityModel } from "../types";

describe("contour drape", () => {
  it("splits long segments so every piece sits on the sampled terrain", () => {
    const bump = (east: number) => 10 - Math.abs(east) / 10;
    const positions = drapeContourSegments([[[-50, 0], [50, 0]]], (east) => bump(east), 25, 0.5);
    expect(positions.length).toBe(4 * 6);
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i + 1]).toBeCloseTo(bump(positions[i]!) + 0.5, 6);
    }
    expect(positions.some((value, i) => i % 3 === 0 && Math.abs(value) < 1e-9)).toBe(true);
  });

  it("keeps a short segment whole and maps north to -Z", () => {
    const positions = drapeContourSegments([[[0, 0], [3, 4]]], () => 2, 25, 0);
    expect(positions).toEqual([0, 2, -0, 3, 2, -4]);
  });

  it("accumulates lineDistance along draped pieces and builds a dashed 3D line object", () => {
    const { lineDistances } = drapeContourSegmentsWithDistances([[[0, 0], [10, 0], [10, 20]]], () => 0, 5, 0);
    expect(lineDistances).toEqual([0, 5, 5, 10, 10, 15, 15, 20, 20, 25, 25, 30]);
    const model = {
      center: { lat: -37.8, lon: 145 },
      sideM: 100,
      buildings: [],
      roads: [],
      areas: [],
      trees: [],
      layers: { buildings: true, roads: true, water: true, green: true, trees: true, terrain: true },
      contourLayer: {
        source: "vicmap-1m",
        label: "Vicmap",
        attribution: "",
        interval: 1,
        lines: [{ z: 10, points: [[-20, 0], [20, 0]] }],
      },
    } as unknown as CityModel;
    const obj = buildContourLineObject(model);
    expect(obj).not.toBeNull();
    expect(obj!.material).toBeInstanceOf(THREE.LineDashedMaterial);
    expect(obj!.geometry.getAttribute("lineDistance")?.count).toBe(obj!.geometry.getAttribute("position")?.count);
  });

  it("draws the 5 m index contours dashed like the 1 m set, as a heavier overlay", () => {
    const model = {
      center: { lat: -37.8, lon: 145 },
      sideM: 100,
      buildings: [],
      roads: [],
      areas: [],
      trees: [],
      contours: true,
      layers: { buildings: true, roads: true, water: true, green: true, trees: true, terrain: true },
      contourLayer: {
        source: "vicmap-metro",
        label: "Vicmap",
        attribution: "",
        interval: 1,
        lines: [9, 10, 11].map((z, i) => ({ z, points: [[-20, -20 + i * 10], [20, -20 + i * 10]] })),
      },
    } as unknown as CityModel;
    const obj = buildContourLineObject(model)!;
    expect(obj.geometry.getAttribute("position").count).toBe(6);
    const base = obj.material as THREE.LineDashedMaterial;
    const index = obj.getObjectByName(CONTOUR_3D_INDEX_NAME) as LineSegments2;
    expect(index).toBeInstanceOf(LineSegments2);
    expect(index.geometry.getAttribute("instanceStart").count).toBe(1);
    expect(index.material).toBeInstanceOf(LineMaterial);
    expect(index.material.dashed).toBe(true);
    expect(index.material.dashSize).toBe(CONTOUR_3D_DASH_M);
    expect(index.material.gapSize).toBe(CONTOUR_3D_GAP_M);
    expect(index.material.dashSize).toBe(base.dashSize);
    expect(index.material.gapSize).toBe(base.gapSize);
    expect(index.material.dashScale).toBe(base.scale);
    expect(index.material.linewidth).toBe(CONTOUR_3D_INDEX_WIDTH_PX);
    expect(index.material.linewidth).toBeGreaterThan(base.linewidth);
    expect(index.material.color.getHex()).toBe(base.color.getHex());
    expect(index.geometry.getAttribute("lineDistance")).toBeUndefined();
    const start = index.geometry.getAttribute("instanceDistanceStart");
    const end = index.geometry.getAttribute("instanceDistanceEnd");
    expect(start.getX(0)).toBe(0);
    expect(end.getX(0)).toBeCloseTo(40, 6);
    expect(end.getX(0)).toBeGreaterThan(CONTOUR_3D_DASH_M + CONTOUR_3D_GAP_M);
    expect(contourLineMaterials(obj)).toEqual([base, index.material]);
  });
});
